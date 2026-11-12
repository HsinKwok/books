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
 * trigram 索引在 detail=none 下只存 token、不存位置，任何短语查询都会报错，
 * 所以自己拆成三元组，用 AND 连起来匹配；标题/正文里真正包含原词的行才保留。
 * 三元组必须是不带引号的 bareword（引号会被当成短语），含空格/标点的直接跳过。
 */
/** FTS5 的查询操作符，不能作为裸词出现在 MATCH 表达式里 */
const FTS_KEYWORDS = new Set(['AND', 'OR', 'NOT', 'NEAR']);

function trigramMatch(query: string) {
  const grams: string[] = [];
  for (let i = 0; i + 3 <= query.length; i += 1) {
    const gram = query.slice(i, i + 3);
    if (!/^[\p{L}\p{N}_]+$/u.test(gram)) continue;
    // AND / OR / NOT / NEAR 在 FTS5 里是操作符，裸写会把查询变成非法表达式
    if (FTS_KEYWORDS.has(gram.toUpperCase())) continue;
    grams.push(gram);
  }
  return grams.join(' AND ');
}

/** 查询串上限：再长也搜不出更有意义的结果，只会让 MATCH 表达式膨胀 */
const MAX_QUERY = 50;

/**
 * 3 个字起走 FTS5 trigram，太短或索引不可用时退回 instr 子串匹配。
 * 翻页时带上第一页定下的 mode，避免 FTS 与 LIKE 混用导致重复条目。
 */
export async function searchChapters(
  db: D1Database,
  q: string,
  opts: { offset?: number; limit?: number; mode?: SearchMode; noBodyLike?: boolean } = {},
): Promise<SearchResult> {
  const query = q.trim().slice(0, MAX_QUERY);
  if (!query) return { hits: [], mode: 'like' };

  const offset = Math.max(0, Math.trunc(opts.offset ?? 0));
  const limit = Math.min(60, Math.max(1, Math.trunc(opts.limit ?? SEARCH_PAGE)));

  // 同一个词反复搜（刷新、翻回上一页、联想）没必要重扫正文，30 秒内直接复用
  return memo(
    db,
    `search:${opts.mode ?? ''}:${opts.noBodyLike ? 't' : 'b'}:${limit}:${offset}:${query}`,
    () => runSearch(db, query, offset, limit, opts.mode, opts.noBodyLike),
  );
}

/** 真正的查询逻辑，缓存包在外面 */
async function runSearch(
  db: D1Database,
  query: string,
  offset: number,
  limit: number,
  mode?: SearchMode,
  noBodyLike?: boolean,
): Promise<SearchResult> {
  const ftsQuery = trigramMatch(query);
  if (ftsQuery && query.length >= 3 && mode !== 'like') {
    try {
      const { results } = await db
        .prepare(
          // detail=none 下 snippet() 只能给正文开头，定位不到命中位置；
          // 用 instr 自己切一小段，和 LIKE 兜底路径保持一致。
          `SELECT b.slug, b.title AS book_title, c.idx, c.title,
                  CASE WHEN instr(lower(c.body), lower(?)) > 0
                       THEN substr(c.body, max(1, instr(lower(c.body), lower(?)) - 30), 140)
                       ELSE '' END AS excerpt
             FROM chapters_fts
             JOIN chapters c ON c.id = chapters_fts.rowid
             JOIN books b ON b.id = c.book_id
            WHERE chapters_fts MATCH ?
              AND (instr(lower(c.body), lower(?)) > 0 OR instr(lower(c.title), lower(?)) > 0)
              AND b.status = 'published' AND c.status = 'published'
            ORDER BY rank
            LIMIT ? OFFSET ?`,
        )
        .bind(query, query, ftsQuery, query, query, limit, offset)
        .all<{ slug: string; book_title: string; idx: number; title: string; excerpt: string }>();
      // 第一页没命中时继续走 LIKE 兜底；后续页沿用第一页定下的模式
      if (results.length || offset > 0 || mode === 'fts') {
        return {
          mode: 'fts',
          hits: results.map((r) => ({
            slug: r.slug,
            bookTitle: r.book_title,
            idx: r.idx,
            title: r.title,
            snippet: r.excerpt ? likeSnippet(r.excerpt, query) : `「${r.title}」`,
          })),
        };
      }
    } catch {
      // 索引还没建好时继续走 LIKE
    }
  }

  // 单个字的词只在书名 / 章节名里找：正文 LIKE '%x%' 要扫全部章节，命中也没有参考价值
  // 联想（noBodyLike）即使是 2 个字也不扫正文，否则每次击键都要全表扫一遍
  const byBody = !noBodyLike && query.length >= 2;
  // 用 instr 做字面量匹配：% 和 _ 不再有通配符语义，也避免 D1 在中文绑定参数上
  // 报 "LIKE or GLOB pattern too complex"
  const match = byBody
    ? '(instr(lower(c.title), lower(?)) > 0 OR instr(lower(b.title), lower(?)) > 0 OR instr(lower(c.body), lower(?)) > 0)'
    : '(instr(lower(c.title), lower(?)) > 0 OR instr(lower(b.title), lower(?)) > 0)';
  const binds = byBody ? [query, query, query] : [query, query];

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
