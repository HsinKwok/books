import { forget } from '../../cache';
import { getVolumes } from '../books';
import { chunk, placeholders } from '../sql';
import { touchBookStatement } from './books';

/* ---------- 后台：卷 ---------- */

/** 没有卷的书不动；有卷时把所有未分卷章节挂到第一卷，一条语句搞定 */
export const orphanStatement = (db: D1Database, bookId: number) =>
  db
    .prepare(
      `UPDATE chapters SET volume_id = (SELECT id FROM volumes WHERE book_id = ? ORDER BY idx LIMIT 1)
        WHERE book_id = ? AND volume_id IS NULL
          AND EXISTS (SELECT 1 FROM volumes WHERE book_id = ?)`,
    )
    .bind(bookId, bookId, bookId);

/** 卷序重排成 1..N，先整体挪开避免撞 UNIQUE；语句由调用方并进同一个 batch */
function resequenceStatements(db: D1Database, bookId: number, ids: number[], now: number) {
  return [
    db.prepare('UPDATE volumes SET idx = idx + 1000 WHERE book_id = ?').bind(bookId),
    ...ids.map((id, i) =>
      db
        .prepare('UPDATE volumes SET idx = ?, updated_at = ? WHERE book_id = ? AND id = ?')
        .bind(i + 1, now, bookId, id),
    ),
  ];
}

export async function nextVolumeIdx(db: D1Database, bookId: number) {
  const row = await db
    .prepare('SELECT COALESCE(MAX(idx), 0) AS max FROM volumes WHERE book_id = ?')
    .bind(bookId)
    .first<{ max: number }>();
  return (row?.max ?? 0) + 1;
}

/** 新增一卷：卷号由子查询算出来，一条语句插入；返回卷号和是否收编了未分卷章节 */
export async function createVolume(
  db: D1Database,
  bookId: number,
  title: string,
  intro = '',
): Promise<{ idx: number; adopted: boolean }> {
  const now = Math.floor(Date.now() / 1000);
  const [created, , orphaned] = await db.batch([
    // MAX(idx)+1 在内联子查询里算，省掉原来先查一次卷号的往返
    db
      .prepare(
        `INSERT INTO volumes (book_id, idx, title, intro, created_at, updated_at)
         SELECT ?, seq, CASE WHEN ? = '' THEN '第 ' || seq || ' 卷' ELSE ? END, ?, ?, ?
           FROM (SELECT COALESCE(MAX(idx), 0) + 1 AS seq FROM volumes WHERE book_id = ?)
         RETURNING id, idx`,
      )
      .bind(bookId, title, title, intro, now, now, bookId),
    touchBookStatement(db, bookId, now),
    // 没有卷的书不动；第一次建卷时把未分卷章节收进来，和插入同一个事务
    orphanStatement(db, bookId),
  ]);
  forget(db, `volumes:${bookId}`);

  const row = created.results?.[0] as { id: number; idx: number } | undefined;
  return { idx: row?.idx ?? 0, adopted: (orphaned.meta.changes ?? 0) > 0 };
}

export async function updateVolume(
  db: D1Database,
  bookId: number,
  id: number,
  input: { title: string; intro: string },
) {
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db
      .prepare('UPDATE volumes SET title = ?, intro = ?, updated_at = ? WHERE book_id = ? AND id = ?')
      .bind(input.title, input.intro, now, bookId, id),
    touchBookStatement(db, bookId, now),
  ]);
  forget(db, `volumes:${bookId}`);
}

/** 删除卷：章节退回未分卷，再归入剩下的第一卷；卷序重排 */
export async function deleteVolume(db: D1Database, bookId: number, id: number) {
  const rest = (await getVolumes(db, bookId)).filter((v) => v.id !== id);
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    rest.length
      ? db
          .prepare('UPDATE chapters SET volume_id = ? WHERE book_id = ? AND volume_id = ?')
          .bind(rest[0].id, bookId, id)
      : db
          .prepare('UPDATE chapters SET volume_id = NULL WHERE book_id = ? AND volume_id = ?')
          .bind(bookId, id),
    db.prepare('DELETE FROM volumes WHERE book_id = ? AND id = ?').bind(bookId, id),
    ...(rest.length ? resequenceStatements(db, bookId, rest.map((v) => v.id), now) : []),
    touchBookStatement(db, bookId, now),
  ]);
  forget(db, `volumes:${bookId}`);
}

/** 批量删除卷：章节退回剩下的第一卷（一卷不剩就置空），最后统一重排卷序 */
export async function deleteVolumes(db: D1Database, bookId: number, ids: number[]) {
  const list = await getVolumes(db, bookId);
  const mode = new Set(ids);
  const rest = list.filter((v) => !mode.has(v.id));
  const removed = list.length - rest.length;
  if (!removed) return 0;

  const now = Math.floor(Date.now() / 1000);
  const statements: D1PreparedStatement[] = [];

  // D1 单条语句最多 100 个参数：这里还有 book_id / 目标卷 id，按 98 切块
  for (const part of chunk([...mode], 98)) {
    const marks = placeholders(part.length);
    statements.push(
      rest.length
        ? db
            .prepare(`UPDATE chapters SET volume_id = ? WHERE book_id = ? AND volume_id IN (${marks})`)
            .bind(rest[0].id, bookId, ...part)
        : db
            .prepare(`UPDATE chapters SET volume_id = NULL WHERE book_id = ? AND volume_id IN (${marks})`)
            .bind(bookId, ...part),
    );
  }
  for (const part of chunk([...mode], 98)) {
    const marks = placeholders(part.length);
    statements.push(
      db.prepare(`DELETE FROM volumes WHERE book_id = ? AND id IN (${marks})`).bind(bookId, ...part),
    );
  }

  if (rest.length) statements.push(...resequenceStatements(db, bookId, rest.map((v) => v.id), now));
  statements.push(touchBookStatement(db, bookId, now));
  await db.batch(statements);
  forget(db, `volumes:${bookId}`);
  return removed;
}

/** 上移 / 下移一位：只互换两卷的 idx，不动其他卷 */
export async function moveVolume(db: D1Database, bookId: number, id: number, dir: -1 | 1) {
  const list = await getVolumes(db, bookId);
  const at = list.findIndex((v) => v.id === id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= list.length) return;

  const a = list[at];
  const b = list[to];
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    // 先把 a 挪到临时序号，避免 UNIQUE (book_id, idx) 中途撞车
    db.prepare('UPDATE volumes SET idx = -1 WHERE book_id = ? AND id = ?').bind(bookId, a.id),
    db
      .prepare('UPDATE volumes SET idx = ?, updated_at = ? WHERE book_id = ? AND id = ?')
      .bind(a.idx, now, bookId, b.id),
    db
      .prepare('UPDATE volumes SET idx = ?, updated_at = ? WHERE book_id = ? AND id = ?')
      .bind(b.idx, now, bookId, a.id),
    touchBookStatement(db, bookId, now),
  ]);
  forget(db, `volumes:${bookId}`);
}
