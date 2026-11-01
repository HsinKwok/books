import { TTL_LONG, memo } from '../../cache';
import type { Stats } from '../types';
import { placeholders } from '../sql';

export async function getStats(db: D1Database): Promise<Stats> {
  return memo(
    db,
    'stats',
    async () => {
      const row = await db
        .prepare(
          `SELECT COUNT(DISTINCT b.id) AS books,
                  COUNT(c.id) AS chapters,
                  COALESCE(SUM(c.words), 0) AS words
             FROM books b
             LEFT JOIN chapters c ON c.book_id = b.id AND c.status = 'published'
            WHERE b.status = 'published'`,
        )
        .first<Stats>();
      return { books: row?.books ?? 0, chapters: row?.chapters ?? 0, words: row?.words ?? 0 };
    },
    TTL_LONG,
  );
}

/** 一次最多查多少本书的字数，避免请求把整站章节表拖出来 */
export const WORDS_SLUG_LIMIT = 50;

/**
 * 按 slug 取章节字数表。页脚「已读字数」只需要读过的书，没必要全站拉一遍。
 * 不传 slug 直接返回空表，由调用方保证传入需要的书。
 */
export async function getWordsByChapter(
  db: D1Database,
  slugs: string[],
): Promise<Record<string, Record<string, number>>> {
  const list = [...new Set(slugs.filter(Boolean))].slice(0, WORDS_SLUG_LIMIT);
  if (!list.length) return {};

  const { results } = await db
    .prepare(
      `SELECT b.slug AS slug, c.idx AS idx, c.words AS words
         FROM chapters c JOIN books b ON b.id = c.book_id
        WHERE b.status = 'published' AND c.status = 'published'
          AND b.slug IN (${placeholders(list.length)})`,
    )
    .bind(...list)
    .all<{ slug: string; idx: number; words: number }>();

  const map: Record<string, Record<string, number>> = {};
  for (const row of results) {
    (map[row.slug] ??= {})[row.idx] = row.words;
  }
  return map;
}
