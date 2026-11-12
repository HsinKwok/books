import { markdownText } from '../../markdown';
import { forget } from '../../cache';
import { chunk, placeholders } from '../sql';
import { countWords, normalizeBody, type BookStatus } from '../types';
import { touchBookStatement } from './books';
import { nextVolumeIdx, orphanStatement } from './volumes';

/* ---------- 后台：章节写入 ---------- */

export async function nextChapterIdx(db: D1Database, bookId: number) {
  const row = await db
    .prepare('SELECT COALESCE(MAX(idx), 0) AS max FROM chapters WHERE book_id = ?')
    .bind(bookId)
    .first<{ max: number }>();
  return (row?.max ?? 0) + 1;
}

/** 标题 / 正文的入库预处理：编辑和插入共用 */
function prepareChapter(title: string, body: string) {
  const clean = normalizeBody(body);
  return {
    title,
    clean,
    words: countWords(markdownText(clean)),
  };
}

export async function saveChapter(
  db: D1Database,
  bookId: number,
  idx: number,
  title: string,
  body: string,
  status: BookStatus,
  volumeId: number | null = null,
) {
  const now = Math.floor(Date.now() / 1000);
  const chapter = prepareChapter(title, body);
  // 章节落库、收编未分卷章节、刷新书籍时间合成一个 batch：一次往返、一个事务
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO chapters (book_id, idx, volume_id, title, body, words, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (book_id, idx) DO UPDATE SET
           volume_id = excluded.volume_id,
           title = excluded.title,
           body = excluded.body,
           words = excluded.words,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .bind(
        bookId,
        idx,
        volumeId,
        chapter.title,
        chapter.clean,
        chapter.words,
        status,
        now,
        now,
      ),
  ];
  if (volumeId === null) statements.push(orphanStatement(db, bookId));
  statements.push(touchBookStatement(db, bookId, now));
  await db.batch(statements);
  forget(db, 'stats');
}

/** 新增章节：序号上已有章节时，把该章及之后的章节整体后移一位，评论和阅读进度同步跟着走 */
export async function insertChapter(
  db: D1Database,
  bookId: number,
  idx: number,
  title: string,
  body: string,
  status: BookStatus,
  volumeId: number | null = null,
) {
  const now = Math.floor(Date.now() / 1000);
  const chapter = prepareChapter(title, body);
  const insert = db
    .prepare(
      `INSERT INTO chapters (book_id, idx, volume_id, title, body, words, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(bookId, idx, volumeId, chapter.title, chapter.clean, chapter.words, status, now, now);
  // 书籍的 updated_at、未分卷章节的收编都并进同一个 batch，省两次往返
  const touch = touchBookStatement(db, bookId, now);
  const orphan = volumeId === null ? orphanStatement(db, bookId) : null;

  // 最大值和占用判断合成一条，省一次 D1 往返；两者都是索引点查
  const row = await db
    .prepare(
      `SELECT (SELECT COALESCE(MAX(idx), 0) FROM chapters WHERE book_id = ?) AS max,
              EXISTS (SELECT 1 FROM chapters WHERE book_id = ? AND idx = ?) AS occupied`,
    )
    .bind(bookId, bookId, idx)
    .first<{ max: number; occupied: number }>();
  const max = row?.max ?? 0;

  if (!row?.occupied) {
    await db.batch(orphan ? [insert, touch, orphan] : [insert, touch]);
  } else {
    // 先把后移部分抬到 MAX 之外，避免 UNIQUE (book_id, idx) 在中途撞车
    const offset = max + 1;
    const statements: D1PreparedStatement[] = [
      db.prepare('UPDATE chapters SET idx = idx + ? WHERE book_id = ? AND idx >= ?').bind(offset, bookId, idx),
      db
        .prepare('UPDATE chapters SET idx = idx - ? + 1 WHERE book_id = ? AND idx >= ?')
        .bind(offset, bookId, idx + offset),
      db
        .prepare('UPDATE discussions SET chapter_idx = chapter_idx + 1 WHERE book_id = ? AND chapter_idx >= ?')
        .bind(bookId, idx),
      db
        .prepare(
          'UPDATE reading_progress SET chapter_idx = chapter_idx + 1 WHERE book_slug = (SELECT slug FROM books WHERE id = ?) AND chapter_idx >= ?',
        )
        .bind(bookId, idx),
      insert,
      touch,
    ];
    if (orphan) statements.push(orphan);
    await db.batch(statements);
  }

  forget(db, 'stats', 'talk-counts');
}

/** 删章不重排 idx，但要把挂在这一章上的讨论和阅读进度一起清掉，避免旧数据挂到新章上 */
export async function deleteChapter(db: D1Database, bookId: number, idx: number) {
  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare('DELETE FROM discussions WHERE book_id = ? AND chapter_idx = ?').bind(bookId, idx),
    db
      .prepare(
        'DELETE FROM reading_progress WHERE chapter_idx = ? AND book_slug = (SELECT slug FROM books WHERE id = ?)',
      )
      .bind(idx, bookId),
    db.prepare('DELETE FROM chapters WHERE book_id = ? AND idx = ?').bind(bookId, idx),
    touchBookStatement(db, bookId, now),
  ]);
  forget(db, 'stats', 'talk-counts');
}

/** 批量删章：按 D1 参数上限分块（book_id + 99 个 idx），连带清理该章讨论和阅读进度 */
export async function deleteChapters(db: D1Database, bookId: number, idxs: number[]) {
  if (!idxs.length) return;
  const stmts: D1PreparedStatement[] = [];
  for (const part of chunk(idxs)) {
    const marks = placeholders(part.length);
    stmts.push(
      db.prepare(`DELETE FROM discussions WHERE book_id = ? AND chapter_idx IN (${marks})`).bind(bookId, ...part),
      db
        .prepare(
          `DELETE FROM reading_progress WHERE chapter_idx IN (${marks}) AND book_slug = (SELECT slug FROM books WHERE id = ?)`,
        )
        .bind(...part, bookId),
      db.prepare(`DELETE FROM chapters WHERE book_id = ? AND idx IN (${marks})`).bind(bookId, ...part),
    );
  }
  stmts.push(touchBookStatement(db, bookId, Math.floor(Date.now() / 1000)));
  await db.batch(stmts);
  forget(db, 'stats', 'talk-counts');
}

export type ImportChapter = {
  title: string;
  body: string;
  /** 解析阶段已经算好字数时直接复用，省一次全文扫描 */
  words?: number;
};
export type ImportVolume = { title: string; intro?: string; chapters: ImportChapter[] };
/** 导入目的卷：并入某一卷（没有 id 就新建），或 'none' 表示全部保持未分卷 */
export type ImportTargetVolume = { id?: number; title: string } | 'none';

export async function importChapters(
  db: D1Database,
  bookId: number,
  input: { volumes?: ImportVolume[]; chapters?: ImportChapter[] },
  opts: {
    startIdx: number;
    status: BookStatus;
    replace?: boolean;
    /** 指定后忽略 TXT 里的卷标题，所有章节按顺序放进这一卷 */
    target?: ImportTargetVolume;
  },
) {
  if (opts.replace) {
    // 和单章删除保持一致：整本替换时旧章节的讨论和阅读进度也一起清掉
    await db.batch([
      db.prepare('DELETE FROM discussions WHERE book_id = ?').bind(bookId),
      db
        .prepare('DELETE FROM reading_progress WHERE book_slug = (SELECT slug FROM books WHERE id = ?)')
        .bind(bookId),
      db.prepare('DELETE FROM chapters WHERE book_id = ?').bind(bookId),
      db.prepare('DELETE FROM volumes WHERE book_id = ?').bind(bookId),
    ]);
  }

  const now = Math.floor(Date.now() / 1000);
  const target = opts.target;
  let targetId: number | null = null;

  // 指定了目的卷：先把卷落地（替换模式下旧卷刚被清掉，需要重建），再让所有章节归入这一卷
  if (target && target !== 'none') {
    let id = target.id;
    if (id) {
      const exists = await db
        .prepare('SELECT id FROM volumes WHERE book_id = ? AND id = ?')
        .bind(bookId, id)
        .first<{ id: number }>();
      if (!exists) id = undefined;
    }
    if (!id) {
      const idx = await nextVolumeIdx(db, bookId);
      const row = await db
        .prepare(
          `INSERT INTO volumes (book_id, idx, title, intro, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           RETURNING id`,
        )
        .bind(bookId, idx, target.title, '', now, now)
        .first<{ id: number }>();
      id = row?.id;
    }
    targetId = id ?? null;
  }

  const volumes = target ? [] : input.volumes ?? [];
  const volumeIds: number[] = [];

  // 卷一次性批量写入；未归卷章节留到最后统一收编，只 touch 一次书
  if (volumes.length) {
    const startIdx = await nextVolumeIdx(db, bookId);
    const inserts = volumes.map((volume, i) =>
      db
        .prepare(
          `INSERT INTO volumes (book_id, idx, title, intro, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(bookId, startIdx + i, volume.title, volume.intro ?? '', now, now),
    );
    for (const part of chunk(inserts, 50)) {
      await db.batch(part);
    }
    const { results } = await db
      .prepare('SELECT id FROM volumes WHERE book_id = ? AND idx >= ? ORDER BY idx')
      .bind(bookId, startIdx)
      .all<{ id: number }>();
    volumeIds.push(...results.map((row) => row.id));
  }

  const flat: { title: string; body: string; words?: number; volumeId: number | null }[] = [];
  if (target) {
    // 目的卷模式：TXT 里的卷标题不再建卷，章节顺序保持不变
    for (const volume of input.volumes ?? []) {
      for (const chapter of volume.chapters) flat.push({ ...chapter, volumeId: targetId });
    }
    for (const chapter of input.chapters ?? []) flat.push({ ...chapter, volumeId: targetId });
  } else {
    volumes.forEach((volume, i) => {
      for (const chapter of volume.chapters) {
        flat.push({ ...chapter, volumeId: volumeIds[i] ?? null });
      }
    });
    for (const chapter of input.chapters ?? []) flat.push({ ...chapter, volumeId: null });
  }

  // 边生成边入库：每批最多 200 条，或累计正文 150 万字符就先发一次，
  // 避免一本 500 万字的书把所有正文章节 HTML 同时攒在内存里（Worker 只有 128MB）
  const INSERT = `INSERT INTO chapters (book_id, idx, volume_id, title, body, words, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (book_id, idx) DO UPDATE SET
       volume_id = excluded.volume_id,
       title = excluded.title,
       body = excluded.body,
       words = excluded.words,
       status = excluded.status,
       updated_at = excluded.updated_at`;
  const BATCH_ROWS = 200;
  const BATCH_CHARS = 1_500_000;
  let batch: D1PreparedStatement[] = [];
  let chars = 0;

  const flush = async () => {
    if (!batch.length) return;
    await db.batch(batch);
    batch = [];
    chars = 0;
  };

  for (let i = 0; i < flat.length; i += 1) {
    const item = flat[i];
    // 正文在 TXT 切分阶段已经 normalize 过，这里不再整篇重复扫描
    const body = item.body;
    batch.push(
      db.prepare(INSERT).bind(
        bookId,
        opts.startIdx + i,
        item.volumeId,
        item.title,
        body,
        item.words ?? countWords(markdownText(body)),
        opts.status,
        now,
        now,
      ),
    );
    chars += body.length;
    if (batch.length >= BATCH_ROWS || chars >= BATCH_CHARS) await flush();
  }
  await flush();
  // 指定目的卷（含「不分卷」）时不收编，保留导入时的归卷结果；收编与 touch 合成一次
  const tail: D1PreparedStatement[] = [];
  if (!target) tail.push(orphanStatement(db, bookId));
  tail.push(touchBookStatement(db, bookId, now));
  await db.batch(tail);
  forget(db, 'stats');
  return flat.length;
}
