import {
  CHAPTER_COLS,
  CHAPTER_COLS_LITE,
  type Chapter,
  type ChapterRow,
  type Volume,
} from '../types';
import { type ChapterLiteRow, toChapter, withVolumeNos } from '../rows';
import { clampPage } from '../paging';

export async function getChapters(
  db: D1Database,
  bookId: number,
  opts: { includeDrafts?: boolean } = {},
): Promise<Chapter[]> {
  const where = opts.includeDrafts ? '' : "AND status = 'published'";
  const { results } = await db
    .prepare(`SELECT ${CHAPTER_COLS_LITE} FROM chapters WHERE book_id = ? ${where} ORDER BY idx`)
    .bind(bookId)
    .all<ChapterLiteRow>();
  return withVolumeNos(results);
}

/** 后台章节表每页条数：长书一次全读会拖慢 Worker */
export const ADMIN_CHAPTERS_PER_PAGE = 50;

/** 后台章节表的统计：总章数 + 每卷章数，分页后表格和卷面板都要用 */
export type ChapterStats = {
  total: number;
  /** 键为 `v${volumeId}` 或 'none'（未分卷） */
  byVolume: Record<string, number>;
};

/** 每卷章数统计；书页（仅已发布）和后台章节表（含草稿）共用这一条 SQL */
export async function volumeCounts(
  db: D1Database,
  bookId: number,
  opts: { includeDrafts?: boolean } = {},
): Promise<ChapterStats> {
  const where = opts.includeDrafts ? '' : "AND status = 'published'";
  const { results } = await db
    .prepare(
      `SELECT COALESCE(volume_id, 0) AS vid, COUNT(*) AS n FROM chapters
        WHERE book_id = ? ${where} GROUP BY vid`,
    )
    .bind(bookId)
    .all<{ vid: number; n: number }>();

  const byVolume: Record<string, number> = {};
  let total = 0;
  for (const item of results) {
    byVolume[item.vid ? `v${item.vid}` : 'none'] = item.n;
    total += item.n;
  }
  return { total, byVolume };
}

export async function getChapterStats(db: D1Database, bookId: number): Promise<ChapterStats> {
  return volumeCounts(db, bookId, { includeDrafts: true });
}

/** 后台章节表按页取：草稿也要显示，页码由 clampPage 夹到有效范围 */
export async function getChaptersPage(
  db: D1Database,
  bookId: number,
  rawPage: unknown,
  perPage = ADMIN_CHAPTERS_PER_PAGE,
): Promise<{ chapters: Chapter[]; page: number; pages: number; stats: ChapterStats }> {
  const stats = await getChapterStats(db, bookId);
  const paging = clampPage(rawPage, stats.total, perPage);
  if (!stats.total) return { chapters: [], page: paging.page, pages: paging.pages, stats };

  const { results } = await db
    .prepare(
      `SELECT ${CHAPTER_COLS_LITE} FROM chapters
        WHERE book_id = ? ORDER BY idx LIMIT ? OFFSET ?`,
    )
    .bind(bookId, paging.perPage, paging.offset)
    .all<ChapterLiteRow>();
  return { chapters: withVolumeNos(results), page: paging.page, pages: paging.pages, stats };
}

export async function hasChapter(db: D1Database, bookId: number, idx: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM chapters WHERE book_id = ? AND idx = ? AND status = 'published'")
    .bind(bookId, idx)
    .first<{ ok: number }>();
  return !!row;
}

export async function getChapter(
  db: D1Database,
  bookId: number,
  idx: number,
  opts: { includeDrafts?: boolean } = {},
): Promise<Chapter | null> {
  const status = opts.includeDrafts ? '1 = 1' : "c.status = 'published'";
  const posStatus = opts.includeDrafts ? '1 = 1' : "x.status = 'published'";
  // 卷内序号用子查询一次算出来，省掉原来第二条 COUNT 往返
  const row = await db
    .prepare(
      `SELECT ${CHAPTER_COLS},
              (SELECT COUNT(*) FROM chapters x
                WHERE x.book_id = c.book_id AND x.volume_id = c.volume_id AND x.idx <= c.idx
                  AND ${posStatus}) AS volume_pos
         FROM chapters c
        WHERE c.book_id = ? AND c.idx = ? AND ${status}`,
    )
    .bind(bookId, idx)
    .first<ChapterRow & { volume_pos: number }>();
  if (!row) return null;
  if (row.volume_id === null) return toChapter(row, 0);
  return toChapter(row, row.volume_pos);
}

/** 上下章只要序号和标题，章节页导航用不上正文 */
export type ChapterLink = { idx: number; title: string };

/** 上一章 / 下一章：一条语句取两个方向，省掉两次往返 */
export async function getChapterNeighbors(
  db: D1Database,
  bookId: number,
  idx: number,
): Promise<{ prev?: ChapterLink; next?: ChapterLink }> {
  const { results } = await db
    .prepare(
      `SELECT * FROM (
         SELECT 'prev' AS dir, idx, title FROM chapters
          WHERE book_id = ? AND idx < ? AND status = 'published' ORDER BY idx DESC LIMIT 1
       )
       UNION ALL
       SELECT * FROM (
         SELECT 'next' AS dir, idx, title FROM chapters
          WHERE book_id = ? AND idx > ? AND status = 'published' ORDER BY idx ASC LIMIT 1
       )`,
    )
    .bind(bookId, idx, bookId, idx)
    .all<{ dir: 'prev' | 'next'; idx: number; title: string }>();

  const pick = (dir: 'prev' | 'next') => {
    const row = results.find((r) => r.dir === dir);
    return row ? { idx: row.idx, title: row.title } : undefined;
  };
  return { prev: pick('prev'), next: pick('next') };
}

/** 章节页「第 x / N 章」只需要总数，不必把目录读出来 */
export async function countBookChapters(db: D1Database, bookId: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM chapters WHERE book_id = ? AND status = 'published'")
    .bind(bookId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export type ChapterPageData = {
  chapter: Chapter;
  volume: Volume | null;
  total: number;
  prev?: ChapterLink;
  next?: ChapterLink;
};

/**
 * 章节页一次取齐：正文、所属卷、章节总数、卷内序号、上下章。
 * 原有的 getChapter / getChapterNeighbors / countBookChapters / getVolumes 保留导出，
 * 如需回退可换回多次查询。
 */
export async function getChapterPage(
  db: D1Database,
  slug: string,
  idx: number,
): Promise<ChapterPageData | null> {
  const row = await db
    .prepare(
      `SELECT c.id, c.book_id, c.idx, c.volume_id, c.title, c.body, c.body_html, c.body_hash,
              c.words, c.status, c.updated_at,
              (SELECT title FROM volumes v WHERE v.id = c.volume_id) AS volume_title,
              (SELECT idx FROM volumes v WHERE v.id = c.volume_id) AS volume_idx,
              (SELECT COUNT(*) FROM chapters x
                WHERE x.book_id = c.book_id AND x.status = 'published') AS total,
              (SELECT COUNT(*) FROM chapters x
                WHERE x.book_id = c.book_id AND x.status = 'published'
                  AND x.volume_id IS c.volume_id AND x.idx <= c.idx) AS volume_pos,
              (SELECT idx FROM chapters x
                WHERE x.book_id = c.book_id AND x.status = 'published' AND x.idx < c.idx
                ORDER BY x.idx DESC LIMIT 1) AS prev_idx,
              (SELECT title FROM chapters x
                WHERE x.book_id = c.book_id AND x.status = 'published' AND x.idx < c.idx
                ORDER BY x.idx DESC LIMIT 1) AS prev_title,
              (SELECT idx FROM chapters x
                WHERE x.book_id = c.book_id AND x.status = 'published' AND x.idx > c.idx
                ORDER BY x.idx ASC LIMIT 1) AS next_idx,
              (SELECT title FROM chapters x
                WHERE x.book_id = c.book_id AND x.status = 'published' AND x.idx > c.idx
                ORDER BY x.idx ASC LIMIT 1) AS next_title
         FROM chapters c JOIN books b ON b.id = c.book_id
        WHERE b.slug = ? AND c.idx = ? AND c.status = 'published'`,
    )
    .bind(slug, idx)
    .first<
      ChapterRow & {
        volume_title: string | null;
        volume_idx: number | null;
        total: number;
        volume_pos: number;
        prev_idx: number | null;
        prev_title: string | null;
        next_idx: number | null;
        next_title: string | null;
      }
    >();
  if (!row) return null;

  const chapter = toChapter(row, row.volume_id === null ? 0 : row.volume_pos);
  const volume: Volume | null =
    row.volume_id === null || row.volume_idx === null
      ? null
      : { id: row.volume_id, idx: row.volume_idx, title: row.volume_title ?? '', intro: '' };

  return {
    chapter,
    volume,
    total: row.total,
    prev: row.prev_idx === null ? undefined : { idx: row.prev_idx, title: row.prev_title ?? '' },
    next: row.next_idx === null ? undefined : { idx: row.next_idx, title: row.next_title ?? '' },
  };
}

/** 「同书其他章节」：只取前几条，与原来的展示顺序一致 */
export async function getRelatedChapters(
  db: D1Database,
  bookId: number,
  idx: number,
  limit = 4,
): Promise<{ idx: number; title: string; words: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT idx, title, words FROM chapters
        WHERE book_id = ? AND status = 'published' AND idx <> ?
        ORDER BY idx LIMIT ?`,
    )
    .bind(bookId, idx, limit)
    .all<{ idx: number; title: string; words: number }>();
  return results;
}
