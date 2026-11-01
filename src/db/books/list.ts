import {
  BOOK_COLS,
  CHAPTER_COLS_LITE,
  type Book,
  type BookRow,
  type Volume,
  isoDate,
} from '../types';
import { type ChapterLiteRow, toBook, withVolumeNos } from '../rows';
import { clampPage } from '../paging';
import { placeholders } from '../sql';
import { type BookFilter, bookFilter } from './filter';

const BOOK_ORDERS = {
  /** 后台排的展示顺序 */
  sort: 'sort, id',
  /** 最近更新（后台概览） */
  recent: 'updated_at DESC, id DESC',
  /** 首页：推荐在前 */
  featured: 'featured DESC, sort, id',
} as const;

export type BookOrder = keyof typeof BOOK_ORDERS;

export async function listBooks(
  db: D1Database,
  opts: BookFilter & {
    /** 只要 N 本；分页时配合 offset 使用 */
    limit?: number;
    offset?: number;
    order?: BookOrder;
  } = {},
): Promise<Book[]> {
  const { where, binds } = bookFilter(opts);
  const order = BOOK_ORDERS[opts.order ?? (opts.limit ? 'recent' : 'sort')];
  // 分页窗口同时带进章节/卷的子查询，避免把没选中书籍的章节也读出来
  const page = opts.limit ? ' LIMIT ? OFFSET ?' : '';
  const pageBinds = opts.limit ? [opts.limit, opts.offset ?? 0] : [];
  const scope = `book_id IN (SELECT id FROM books ${where} ORDER BY ${order}${page})`;
  const chapterWhere = opts.includeDrafts ? scope : `${scope} AND status = 'published'`;

  // 三条查询同参数、同往返，合成一个 batch 只走一次网络
  const [bookRes, chapterRes, volumeRes] = await db.batch([
    db
      .prepare(`SELECT ${BOOK_COLS} FROM books ${where} ORDER BY ${order}${page}`)
      .bind(...binds, ...pageBinds),
    db
      .prepare(
        `SELECT ${CHAPTER_COLS_LITE} FROM chapters WHERE ${chapterWhere} ORDER BY book_id, idx`,
      )
      .bind(...binds, ...pageBinds),
    db
      .prepare(
        `SELECT id, book_id, idx, title, intro FROM volumes WHERE ${scope} ORDER BY book_id, idx`,
      )
      .bind(...binds, ...pageBinds),
  ]);

  const bookRows = bookRes.results as BookRow[];
  const chapterRows = chapterRes.results as ChapterLiteRow[];
  const volumeRows = volumeRes.results as (Volume & { book_id: number })[];

  const grouped = new Map<number, ChapterLiteRow[]>();
  for (const row of chapterRows) {
    const list = grouped.get(row.book_id) ?? [];
    list.push(row);
    grouped.set(row.book_id, list);
  }

  const volumesByBook = new Map<number, Volume[]>();
  for (const row of volumeRows) {
    const list = volumesByBook.get(row.book_id) ?? [];
    list.push({ id: row.id, idx: row.idx, title: row.title, intro: row.intro });
    volumesByBook.set(row.book_id, list);
  }

  return bookRows.map((row) =>
    toBook(row, withVolumeNos(grouped.get(row.id) ?? []), volumesByBook.get(row.id) ?? []),
  );
}

export type BookPage = {
  books: Book[];
  total: number;
  /** 实际生效的页码（超出范围会被夹到首/末页） */
  page: number;
  pages: number;
};

/** 前台列表分页：首页 / 分类页共用，只取当前页的书和章节 */
export async function listBooksPage(
  db: D1Database,
  opts: BookFilter & { page?: number; perPage?: number; order?: BookOrder } = {},
): Promise<BookPage> {
  const perPage = Math.min(60, Math.max(1, Math.trunc(opts.perPage ?? 24)));
  const { where, binds } = bookFilter(opts);
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM books ${where}`)
    .bind(...binds)
    .first<{ n: number }>();

  const total = row?.n ?? 0;
  const paging = clampPage(opts.page, total, perPage);
  const books = total
    ? await listBooks(db, {
        ...opts,
        order: opts.order ?? 'sort',
        limit: paging.perPage,
        offset: paging.offset,
      })
    : [];

  return { books, total, page: paging.page, pages: paging.pages };
}

export type BookMeta = {
  slug: string;
  /** 在全部在架书籍里的序号，1 起 */
  no: number;
  title: string;
  author: string;
  category: string;
  chapters: number;
  words: number;
};

/**
 * 书架页按需取书：只查浏览器本地书架/阅读记录里出现过的 slug，
 * 不再把整站书籍都渲染进 HTML。
 */
export async function getBookMetas(db: D1Database, slugs: string[]): Promise<BookMeta[]> {
  const list = [...new Set(slugs.filter(Boolean))].slice(0, 100);
  if (!list.length) return [];

  const marks = placeholders(list.length);
  const { results } = await db
    .prepare(
      `SELECT b.slug, b.no, b.title, b.author, b.category,
              (SELECT COUNT(*) FROM chapters c
                WHERE c.book_id = b.id AND c.status = 'published') AS chapters,
              (SELECT COALESCE(SUM(c.words), 0) FROM chapters c
                WHERE c.book_id = b.id AND c.status = 'published') AS words
         FROM (SELECT id, slug, title, author, category,
                      ROW_NUMBER() OVER (ORDER BY sort, id) AS no
                 FROM books WHERE status = 'published') b
        WHERE b.slug IN (${marks})
        ORDER BY b.no`,
    )
    .bind(...list)
    .all<BookMeta>();

  return results;
}

/* ---------- sitemap 分片：只取 slug / 序号，不读正文 ---------- */

export async function countPublishedBooks(db: D1Database): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM books WHERE status = 'published'")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function listSitemapBooks(
  db: D1Database,
  offset: number,
  limit: number,
): Promise<{ id: number; slug: string }[]> {
  const { results } = await db
    .prepare(
      "SELECT id, slug FROM books WHERE status = 'published' ORDER BY id LIMIT ? OFFSET ?",
    )
    .bind(limit, offset)
    .all<{ id: number; slug: string }>();
  return results;
}

/** 与 listSitemapBooks 用同一段窗口，章节序号和书一一对应 */
export async function listSitemapChapters(
  db: D1Database,
  offset: number,
  limit: number,
): Promise<{ book_id: number; idx: number }[]> {
  const { results } = await db
    .prepare(
      `SELECT book_id, idx FROM chapters
        WHERE status = 'published' AND book_id IN (
          SELECT id FROM books WHERE status = 'published' ORDER BY id LIMIT ? OFFSET ?
        )
        ORDER BY book_id, idx`,
    )
    .bind(limit, offset)
    .all<{ book_id: number; idx: number }>();
  return results;
}

export async function listBookAuthors(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT DISTINCT author FROM books WHERE status = 'published' AND author <> '' ORDER BY author",
    )
    .all<{ author: string }>();
  return results.map((row) => row.author);
}

/** RSS 用：只取最近更新的章节和正文前 240 字，避免整库正文进内存 */
export async function getRssChapters(
  db: D1Database,
  limit = 50,
): Promise<{ title: string; bookTitle: string; slug: string; idx: number; excerpt: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT c.title, c.idx, substr(c.body, 1, 240) AS excerpt, b.title AS book_title, b.slug
         FROM chapters c JOIN books b ON b.id = c.book_id
        WHERE b.status = 'published' AND c.status = 'published'
        ORDER BY c.updated_at DESC
        LIMIT ?`,
    )
    .bind(limit)
    .all<{ title: string; idx: number; excerpt: string; book_title: string; slug: string }>();
  return results.map((row) => ({
    title: row.title,
    bookTitle: row.book_title,
    slug: row.slug,
    idx: row.idx,
    excerpt: row.excerpt,
  }));
}

/** 首页「最近更新」：取最近几本书的最后两章，不再把整本书连目录、卷一起读出来 */
export type RecentChapter = {
  slug: string;
  bookTitle: string;
  updatedAt: string;
  idx: number;
  title: string;
};

export async function getRecentChapters(db: D1Database, limit = 8): Promise<RecentChapter[]> {
  const { results } = await db
    .prepare(
      `SELECT b.slug, b.title AS book_title, b.updated_at, c.idx, c.title
         FROM (SELECT id, slug, title, updated_at FROM books
                WHERE status = 'published' ORDER BY updated_at DESC LIMIT ?) b
         JOIN chapters c ON c.book_id = b.id AND c.status = 'published'
          AND c.idx >= (SELECT MAX(c2.idx) - 1 FROM chapters c2
                         WHERE c2.book_id = b.id AND c2.status = 'published')
        ORDER BY b.updated_at DESC, c.idx`,
    )
    .bind(limit)
    .all<{ slug: string; book_title: string; updated_at: number; idx: number; title: string }>();
  return results.map((row) => ({
    slug: row.slug,
    bookTitle: row.book_title,
    updatedAt: isoDate(row.updated_at),
    idx: row.idx,
    title: row.title,
  }));
}
