import { TTL_MED, memo } from '../../cache';
import {
  BOOK_COLS,
  CHAPTER_COLS_LITE,
  type Book,
  type BookRow,
  type Chapter,
  type Volume,
} from '../types';
import { type ChapterLiteRow, toBook, withVolumeNos } from '../rows';
import { placeholders } from '../sql';
import { chapterFilter, getChapters, toVolumeCounts } from './chapters';

/** 按 slug 或 id 取书籍行：详情页、编辑页、轻量接口共用同一段 SQL */
async function findBookRow(
  db: D1Database,
  where: { slug?: string; id?: number },
): Promise<BookRow | null> {
  const bySlug = where.slug !== undefined;
  return await db
    .prepare(`SELECT ${BOOK_COLS} FROM books WHERE ${bySlug ? 'slug' : 'id'} = ?`)
    .bind(bySlug ? where.slug! : where.id!)
    .first<BookRow>();
}

/** 书行 + 目录 + 卷装配成 Book，getBook / getBookById 共用 */
async function loadBook(
  db: D1Database,
  row: BookRow,
  opts: { includeDrafts?: boolean } = {},
): Promise<Book> {
  const [chapters, volumes] = await Promise.all([
    getChapters(db, row.id, opts),
    getVolumes(db, row.id),
  ]);
  return toBook(row, chapters, volumes);
}

export async function getBook(
  db: D1Database,
  slug: string,
  opts: { includeDrafts?: boolean } = {},
): Promise<Book | null> {
  const row = await findBookRow(db, { slug });
  if (!row) return null;
  return loadBook(db, row, opts);
}

/** 书页首屏最多渲染的目录行数，超出的章节交给 /api/toc 按卷补齐 */
export const BOOK_PREVIEW = 60;

export type BookPageData = {
  book: Book;
  /** 全部已发布章节数，可能大于 book.chapters.length */
  total: number;
  /** 全部已发布章节的字数合计 */
  words: number;
  /** 每卷的章节数（键为 `v${id}` 或 'none'） */
  volumeCounts: Record<string, number>;
};

/** 书籍详情页：只取前 BOOK_PREVIEW 章，长书不再把整本目录读进 Worker */
export async function getBookForPage(db: D1Database, slug: string): Promise<BookPageData | null> {
  // 所有语句都直接用 slug 定位，一次 batch 完成，省掉「先查 id 再查详情」的往返
  const bookId = '(SELECT id FROM books WHERE slug = ?)';
  const [bookRes, volumeRes, previewRes, aggRes, countRes] = await db.batch([
    db.prepare(`SELECT ${BOOK_COLS} FROM books WHERE slug = ?`).bind(slug),
    db
      .prepare(`SELECT id, idx, title, intro FROM volumes WHERE book_id = ${bookId} ORDER BY idx`)
      .bind(slug),
    db
      .prepare(
        `SELECT ${CHAPTER_COLS_LITE} FROM chapters
          WHERE book_id = ${bookId} AND status = 'published' ORDER BY idx LIMIT ?`,
      )
      .bind(slug, BOOK_PREVIEW),
    db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(words), 0) AS w FROM chapters
          WHERE book_id = ${bookId} AND status = 'published'`,
      )
      .bind(slug),
    db
      .prepare(
        `SELECT COALESCE(volume_id, 0) AS vid, COUNT(*) AS n FROM chapters
          WHERE book_id = ${bookId} AND status = 'published' GROUP BY vid`,
      )
      .bind(slug),
  ]);

  const row = (bookRes.results as BookRow[])[0];
  if (!row) return null;

  const volumes = volumeRes.results as Volume[];
  const chapters = withVolumeNos(previewRes.results as ChapterLiteRow[]);
  const agg = (aggRes.results as { n: number; w: number }[])[0];
  // 卷章数很小，直接和目录一起取回，长书也不用再多跑一次
  const counts = toVolumeCounts(countRes.results as { vid: number; n: number }[]);

  return {
    book: toBook(row, chapters, volumes),
    total: agg?.n ?? 0,
    words: agg?.w ?? 0,
    volumeCounts: counts.byVolume,
  };
}

export async function getBookById(db: D1Database, id: number): Promise<Book | null> {
  const row = await findBookRow(db, { id });
  if (!row) return null;
  return loadBook(db, row, { includeDrafts: true });
}

export async function getVolumes(db: D1Database, bookId: number): Promise<Volume[]> {
  // 卷列表短小、被书页/章节页反复读，60 秒内复用；写卷时主动失效
  return memo(
    db,
    `volumes:${bookId}`,
    async () => {
      const { results } = await db
        .prepare('SELECT id, idx, title, intro FROM volumes WHERE book_id = ? ORDER BY idx')
        .bind(bookId)
        .all<Volume>();
      return results;
    },
    TTL_MED,
  );
}

/** 只取书籍行：用于权限校验、写操作和轻量接口，不加载目录与正文 */
export async function getBookMetaById(
  db: D1Database,
  id: number,
  opts: { volumes?: boolean } = {},
): Promise<Book | null> {
  const row = await findBookRow(db, { id });
  if (!row) return null;
  return toBook(row, [], opts.volumes ? await getVolumes(db, id) : []);
}

/** 批量操作前取少量字段：id / 书名 / 封面 / 归属，ids 由调用方保证不超过 100 */
export async function getBookMetasByIds(
  db: D1Database,
  ids: number[],
): Promise<{ id: number; title: string; slug: string; coverUrl: string; ownerId: number | null }[]> {
  if (!ids.length) return [];
  const marks = placeholders(ids.length);
  const { results } = await db
    .prepare(`SELECT id, title, slug, cover_url, owner_id FROM books WHERE id IN (${marks})`)
    .bind(...ids)
    .all<{ id: number; title: string; slug: string; cover_url: string; owner_id: number | null }>();
  return results.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    coverUrl: row.cover_url,
    ownerId: row.owner_id,
  }));
}

export async function getBookMetaBySlug(db: D1Database, slug: string): Promise<Book | null> {
  const row = await findBookRow(db, { slug });
  return row ? toBook(row, []) : null;
}

/** 目录接口：取某本书的章节索引（不含正文），供章节页抽屉和书页按卷展开 */
export async function getChapterIndexBySlug(
  db: D1Database,
  slug: string,
  opts: { volumeId?: number | null } = {},
): Promise<{ book: Book; chapters: Chapter[] } | null> {
  // 书本行和目录一个 batch 取回，不再先查 id 再查章节
  const { where, binds } = chapterFilter(opts, 'c.');
  const [bookRes, chapterRes] = await db.batch([
    db.prepare(`SELECT ${BOOK_COLS} FROM books WHERE slug = ?`).bind(slug),
    db
      .prepare(
        `SELECT ${CHAPTER_COLS_LITE} FROM chapters c
          WHERE c.book_id = (SELECT id FROM books WHERE slug = ?) ${where}
          ORDER BY c.idx`,
      )
      .bind(slug, ...binds),
  ]);

  const row = (bookRes.results as BookRow[])[0];
  if (!row) return null;

  return {
    book: toBook(row, []),
    chapters: withVolumeNos(chapterRes.results as ChapterLiteRow[]),
  };
}
