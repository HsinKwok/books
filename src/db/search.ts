import { memo } from '../cache';

/* ---------- 全文搜索 ---------- */

export type SearchHit = {
  slug: string;
  bookTitle: string;
  idx: number;
  title: string;
  snippet: string;
};

function likeSnippet(body: string, q: string) {
  const flat = body.replace(/\s+/g, ' ');
  const at = flat.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return flat.slice(0, 80);
  const start = Math.max(0, at - 30);
  const end = Math.min(flat.length, at + q.length + 50);
  return `${start > 0 ? '…' : ''}${flat.slice(start, at)}「${flat.slice(at, at + q.length)}」${flat.slice(at + q.length, end)}${end < flat.length ? '…' : ''}`;
}

export type SearchMode = 'fts' | 'like';
export type SearchResult = { hits: SearchHit[]; mode: SearchMode };

/** 搜索每页条数，首屏和「加载更多」共用 */
export const SEARCH_PAGE = 30;

/**
 * 3 个字起走 FTS5 trigram，太短或索引不可用时退回 LIKE。
 * 翻页时带上第一页定下的 mode，避免 FTS 与 LIKE 混用导致重复条目。
 */
export async function searchChapters(
  db: D1Database,
  q: string,
  opts: { offset?: number; limit?: number; mode?: SearchMode } = {},
): Promise<SearchResult> {
  const query = q.trim();
  if (!query) return { hits: [], mode: 'like' };

  const offset = Math.max(0, Math.trunc(opts.offset ?? 0));
  const limit = Math.min(60, Math.max(1, Math.trunc(opts.limit ?? SEARCH_PAGE)));

  // 同一个词反复搜（刷新、翻回上一页、联想）没必要重扫正文，30 秒内直接复用
  return memo(db, `search:${opts.mode ?? ''}:${limit}:${offset}:${query}`, () =>
    runSearch(db, query, offset, limit, opts.mode),
  );
}

/** 真正的查询逻辑，缓存包在外面 */
async function runSearch(
  db: D1Database,
  query: string,
  offset: number,
  limit: number,
  mode?: SearchMode,
): Promise<SearchResult> {
  if (query.length >= 3 && mode !== 'like') {
    try {
      const { results } = await db
        .prepare(
          `SELECT b.slug, b.title AS book_title, c.idx, c.title,
                  snippet(chapters_fts, 1, '「', '」', '…', 24) AS snippet
             FROM chapters_fts
             JOIN chapters c ON c.id = chapters_fts.rowid
             JOIN books b ON b.id = c.book_id
            WHERE chapters_fts MATCH ? AND b.status = 'published' AND c.status = 'published'
            ORDER BY rank
            LIMIT ? OFFSET ?`,
        )
        .bind(`"${query.replace(/"/g, ' ')}"`, limit, offset)
        .all<{ slug: string; book_title: string; idx: number; title: string; snippet: string }>();
      // 第一页没命中时继续走 LIKE 兜底；后续页沿用第一页定下的模式
      if (results.length || offset > 0 || mode === 'fts') {
        return {
          mode: 'fts',
          hits: results.map((r) => ({
            slug: r.slug,
            bookTitle: r.book_title,
            idx: r.idx,
            title: r.title,
            snippet: r.snippet,
          })),
        };
      }
    } catch {
      // 索引还没建好时继续走 LIKE
    }
  }

  // 单个字的词只在书名 / 章节名里找：正文 LIKE '%x%' 要扫全部章节，命中也没有参考价值
  const byBody = query.length >= 2;
  const match = byBody
    ? '(c.title LIKE ? OR b.title LIKE ? OR c.body LIKE ?)'
    : '(c.title LIKE ? OR b.title LIKE ?)';
  const binds = byBody
    ? [`%${query}%`, `%${query}%`, `%${query}%`]
    : [`%${query}%`, `%${query}%`];

  const { results } = await db
    .prepare(
      // 只把命中位置附近的一小段正文带回 Worker，不再整篇 body 进内存
      `SELECT b.slug, b.title AS book_title, c.idx, c.title,
              substr(c.body,
                     CASE WHEN instr(lower(c.body), lower(?)) > 0
                          THEN max(1, instr(lower(c.body), lower(?)) - 30)
                          ELSE 1 END,
                     140) AS excerpt
         FROM chapters c JOIN books b ON b.id = c.book_id
        WHERE b.status = 'published' AND c.status = 'published'
          AND ${match}
        ORDER BY c.updated_at DESC
        LIMIT ? OFFSET ?`,
    )
    .bind(query, query, ...binds, limit, offset)
    .all<{ slug: string; book_title: string; idx: number; title: string; excerpt: string }>();

  return {
    mode: 'like',
    hits: results.map((r) => ({
      slug: r.slug,
      bookTitle: r.book_title,
      idx: r.idx,
      title: r.title,
      snippet: likeSnippet(r.excerpt, query),
    })),
  };
}
