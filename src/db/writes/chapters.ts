import { markdownText, renderMarkdown } from '../../markdown';
import { contentKey, forget } from '../../cache';
import { chunk, placeholders } from '../sql';
import { countWords, normalizeBody, type BookStatus } from '../types';
import { touchBook } from './books';
import { assignOrphanChapters, nextVolumeIdx } from './volumes';

/* ---------- 后台：章节写入 ---------- */

export async function nextChapterIdx(db: D1Database, bookId: number) {
  const row = await db
    .prepare('SELECT COALESCE(MAX(idx), 0) AS max FROM chapters WHERE book_id = ?')
    .bind(bookId)
    .first<{ max: number }>();
  return (row?.max ?? 0) + 1;
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
  const clean = normalizeBody(body);
  // 正文 HTML 与摘要一起入库，读章节时摘要对得上就不用再解析 Markdown
  await db
    .prepare(
      `INSERT INTO chapters (book_id, idx, volume_id, title, body, body_html, body_hash, words, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (book_id, idx) DO UPDATE SET
         volume_id = excluded.volume_id,
         title = excluded.title,
         body = excluded.body,
         body_html = excluded.body_html,
         body_hash = excluded.body_hash,
         words = excluded.words,
         status = excluded.status,
         updated_at = excluded.updated_at`,
    )
    .bind(
      bookId,
      idx,
      volumeId,
      title,
      clean,
      renderMarkdown(clean),
      contentKey(clean),
      countWords(markdownText(clean)),
      status,
      now,
      now,
    )
    .run();
  if (volumeId === null) await assignOrphanChapters(db, bookId);
  await touchBook(db, bookId);
  forget(db, 'stats', 'words');
}

/** 删章不重排 idx，但要把挂在这一章上的讨论和阅读进度一起清掉，避免旧数据挂到新章上 */
export async function deleteChapter(db: D1Database, bookId: number, idx: number) {
  await db.batch([
    db.prepare('DELETE FROM discussions WHERE book_id = ? AND chapter_idx = ?').bind(bookId, idx),
    db
      .prepare(
        'DELETE FROM reading_progress WHERE chapter_idx = ? AND book_slug = (SELECT slug FROM books WHERE id = ?)',
      )
      .bind(idx, bookId),
    db.prepare('DELETE FROM chapters WHERE book_id = ? AND idx = ?').bind(bookId, idx),
  ]);
  await touchBook(db, bookId);
  forget(db, 'stats', 'words', 'talk-counts');
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
  await db.batch(stmts);
  await touchBook(db, bookId);
  forget(db, 'stats', 'words', 'talk-counts');
}

export type ImportChapter = { title: string; body: string };
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

  const flat: { title: string; body: string; volumeId: number | null }[] = [];
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

  const statements = flat.map((item, i) => {
    const body = normalizeBody(item.body);
    return db
      .prepare(
        `INSERT INTO chapters (book_id, idx, volume_id, title, body, body_html, body_hash, words, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (book_id, idx) DO UPDATE SET
           volume_id = excluded.volume_id,
           title = excluded.title,
           body = excluded.body,
           body_html = excluded.body_html,
           body_hash = excluded.body_hash,
           words = excluded.words,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .bind(
        bookId,
        opts.startIdx + i,
        item.volumeId,
        item.title,
        body,
        renderMarkdown(body),
        contentKey(body),
        countWords(markdownText(body)),
        opts.status,
        now,
        now,
      );
  });

  for (const part of chunk(statements, 50)) {
    await db.batch(part);
  }
  // 指定目的卷（含「不分卷」）时不收编，保留导入时的归卷结果
  if (!target) await assignOrphanChapters(db, bookId);
  await touchBook(db, bookId);
  forget(db, 'stats', 'words');
  return flat.length;
}
