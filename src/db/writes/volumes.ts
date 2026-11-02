import { forget } from '../../cache';
import { getVolumes } from '../books';
import { chunk, placeholders } from '../sql';
import { touchBook } from './books';

/* ---------- 后台：卷 ---------- */

export async function nextVolumeIdx(db: D1Database, bookId: number) {
  const row = await db
    .prepare('SELECT COALESCE(MAX(idx), 0) AS max FROM volumes WHERE book_id = ?')
    .bind(bookId)
    .first<{ max: number }>();
  return (row?.max ?? 0) + 1;
}

/** 有卷的书里，未归卷的章节统一挂到第一卷 */
export async function assignOrphanChapters(db: D1Database, bookId: number) {
  const first = await db
    .prepare('SELECT id FROM volumes WHERE book_id = ? ORDER BY idx LIMIT 1')
    .bind(bookId)
    .first<{ id: number }>();
  if (!first) return;
  await db
    .prepare('UPDATE chapters SET volume_id = ? WHERE book_id = ? AND volume_id IS NULL')
    .bind(first.id, bookId)
    .run();
}

/** 卷序重排成 1..N，先整体挪开避免撞 UNIQUE */
async function resequenceVolumes(db: D1Database, bookId: number, ids: number[]) {
  const now = Math.floor(Date.now() / 1000);
  const statements = [
    db.prepare('UPDATE volumes SET idx = idx + 1000 WHERE book_id = ?').bind(bookId),
    ...ids.map((id, i) =>
      db
        .prepare('UPDATE volumes SET idx = ?, updated_at = ? WHERE book_id = ? AND id = ?')
        .bind(i + 1, now, bookId, id),
    ),
  ];
  await db.batch(statements);
}

export async function createVolume(
  db: D1Database,
  bookId: number,
  title: string,
  intro = '',
) {
  const now = Math.floor(Date.now() / 1000);
  const idx = await nextVolumeIdx(db, bookId);
  const row = await db
    .prepare(
      `INSERT INTO volumes (book_id, idx, title, intro, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(bookId, idx, title, intro, now, now)
    .first<{ id: number }>();

  // 书的第一卷：把已有的未分卷章节都收进来
  if (idx === 1) await assignOrphanChapters(db, bookId);
  await touchBook(db, bookId);
  forget(db, `volumes:${bookId}`);
  return row?.id ?? 0;
}

export async function updateVolume(
  db: D1Database,
  bookId: number,
  id: number,
  input: { title: string; intro: string },
) {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare('UPDATE volumes SET title = ?, intro = ?, updated_at = ? WHERE book_id = ? AND id = ?')
    .bind(input.title, input.intro, now, bookId, id)
    .run();
  await touchBook(db, bookId);
  forget(db, `volumes:${bookId}`);
}

/** 删除卷：章节退回未分卷，再归入剩下的第一卷；卷序重排 */
export async function deleteVolume(db: D1Database, bookId: number, id: number) {
  const rest = (await getVolumes(db, bookId)).filter((v) => v.id !== id);
  if (rest.length) {
    await db
      .prepare('UPDATE chapters SET volume_id = ? WHERE book_id = ? AND volume_id = ?')
      .bind(rest[0].id, bookId, id)
      .run();
  } else {
    await db
      .prepare('UPDATE chapters SET volume_id = NULL WHERE book_id = ? AND volume_id = ?')
      .bind(bookId, id)
      .run();
  }
  await db.prepare('DELETE FROM volumes WHERE book_id = ? AND id = ?').bind(bookId, id).run();
  if (rest.length) await resequenceVolumes(db, bookId, rest.map((v) => v.id));
  await touchBook(db, bookId);
  forget(db, `volumes:${bookId}`);
}

/** 批量删除卷：章节退回剩下的第一卷（一卷不剩就置空），最后统一重排卷序 */
export async function deleteVolumes(db: D1Database, bookId: number, ids: number[]) {
  const list = await getVolumes(db, bookId);
  const mode = new Set(ids);
  const rest = list.filter((v) => !mode.has(v.id));
  const removed = list.length - rest.length;
  if (!removed) return 0;

  // D1 单条语句最多 100 个参数：这里还有 book_id / 目标卷 id，按 98 切块
  for (const part of chunk([...mode], 98)) {
    const marks = placeholders(part.length);
    if (rest.length) {
      await db
        .prepare(`UPDATE chapters SET volume_id = ? WHERE book_id = ? AND volume_id IN (${marks})`)
        .bind(rest[0].id, bookId, ...part)
        .run();
    } else {
      await db
        .prepare(`UPDATE chapters SET volume_id = NULL WHERE book_id = ? AND volume_id IN (${marks})`)
        .bind(bookId, ...part)
        .run();
    }
  }
  for (const part of chunk([...mode], 98)) {
    const marks = placeholders(part.length);
    await db
      .prepare(`DELETE FROM volumes WHERE book_id = ? AND id IN (${marks})`)
      .bind(bookId, ...part)
      .run();
  }

  if (rest.length) await resequenceVolumes(db, bookId, rest.map((v) => v.id));
  await touchBook(db, bookId);
  forget(db, `volumes:${bookId}`);
  return removed;
}

/** 上移 / 下移一位 */
export async function moveVolume(db: D1Database, bookId: number, id: number, dir: -1 | 1) {
  const list = await getVolumes(db, bookId);
  const at = list.findIndex((v) => v.id === id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= list.length) return;

  const ids = list.map((v) => v.id);
  [ids[at], ids[to]] = [ids[to], ids[at]];
  await resequenceVolumes(db, bookId, ids);
  await touchBook(db, bookId);
  forget(db, `volumes:${bookId}`);
}
