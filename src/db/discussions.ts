import { forget, memo } from '../cache';
import { chunk, placeholders } from './sql';
import { dateLabel, type DiscussionItem } from './types';

/* ---------- 讨论 ---------- */

export async function getApprovedDiscussions(
  db: D1Database,
  bookId: number,
  chapterIdx: number,
  userId?: number | null,
): Promise<DiscussionItem[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, body, likes, status, created_at
         FROM discussions
        WHERE book_id = ? AND chapter_idx = ? AND status = 'approved'
        ORDER BY created_at`,
    )
    .bind(bookId, chapterIdx)
    .all<{
      id: number;
      name: string;
      body: string;
      likes: number;
      status: 'approved';
      created_at: number;
    }>();

  let liked = new Set<number>();
  if (userId && results.length) {
    try {
      // 从本章讨论出发用主键回查点赞：成本只跟本章讨论数有关，
      // 不会随该用户在全站的历史点赞数增长
      const rows = await db
        .prepare(
          `SELECT d.id AS discussion_id
             FROM discussions d
            WHERE d.book_id = ? AND d.chapter_idx = ? AND d.status = 'approved'
              AND EXISTS (SELECT 1 FROM discussion_likes l
                           WHERE l.discussion_id = d.id AND l.user_id = ?)`,
        )
        .bind(bookId, chapterIdx, userId)
        .all<{ discussion_id: number }>();
      liked = new Set(rows.results.map((r) => r.discussion_id));
    } catch {
      // 0004 还没跑时忽略
    }
  }

  return results.map((r) => ({
    id: r.id,
    name: r.name,
    body: r.body,
    likes: r.likes,
    status: r.status,
    createdAt: r.created_at,
    date: dateLabel(r.created_at),
    liked: liked.has(r.id),
  }));
}

/** 切换点赞，返回最新状态与计数 */
export async function toggleDiscussionLike(db: D1Database, discussionId: number, userId: number) {
  const liked = await db
    .prepare('SELECT 1 AS ok FROM discussion_likes WHERE discussion_id = ? AND user_id = ?')
    .bind(discussionId, userId)
    .first<{ ok: number }>();

  // 改点赞记录、回写计数、读回计数合成一个 batch：事务内按顺序执行，只剩两次往返
  const [, , counted] = await db.batch([
    liked
      ? db
          .prepare('DELETE FROM discussion_likes WHERE discussion_id = ? AND user_id = ?')
          .bind(discussionId, userId)
      : db
          .prepare(
            'INSERT OR IGNORE INTO discussion_likes (discussion_id, user_id, created_at) VALUES (?, ?, ?)',
          )
          .bind(discussionId, userId, Math.floor(Date.now() / 1000)),
    db
      .prepare(
        'UPDATE discussions SET likes = (SELECT COUNT(*) FROM discussion_likes WHERE discussion_id = ?) WHERE id = ?',
      )
      .bind(discussionId, discussionId),
    db.prepare('SELECT likes FROM discussions WHERE id = ?').bind(discussionId),
  ]);

  const row = (counted.results as { likes: number }[])[0];
  return { liked: !liked, likes: row?.likes ?? 0 };
}

/** 讨论数缓存键：首页、分类页、feed 反复用同一份聚合 */
const TALK_COUNTS = 'talk-counts';

export async function getApprovedCounts(db: D1Database) {
  // 全站聚合，30 秒内复用；讨论有增删改时由下方写函数主动失效
  return memo(db, TALK_COUNTS, async () => {
    const { results } = await db
      .prepare(
        `SELECT b.slug AS slug, COUNT(*) AS n
           FROM discussions d JOIN books b ON b.id = d.book_id
          WHERE d.status = 'approved'
          GROUP BY b.slug`,
      )
      .all<{ slug: string; n: number }>();

    const map: Record<string, number> = {};
    for (const row of results) map[row.slug] = row.n;
    return map;
  });
}

/** 单本书的讨论数：书页只关心自己那一本，不必拉全站聚合再挑 */
export async function getApprovedCountForSlug(db: D1Database, slug: string) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM discussions d JOIN books b ON b.id = d.book_id
        WHERE b.slug = ? AND d.status = 'approved'`,
    )
    .bind(slug)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** 书页「最新讨论」：跨章节取最近几条，带上所属章节标题 */
export async function getRecentBookDiscussions(db: D1Database, bookId: number, limit = 5) {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.name, d.body, d.likes, d.status, d.created_at, d.chapter_idx,
              c.title AS chapter_title
         FROM discussions d
         LEFT JOIN chapters c ON c.book_id = d.book_id AND c.idx = d.chapter_idx
        WHERE d.book_id = ? AND d.status = 'approved'
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT ?`,
    )
    .bind(bookId, limit)
    .all<{
      id: number;
      name: string;
      body: string;
      likes: number;
      status: 'approved';
      created_at: number;
      chapter_idx: number;
      chapter_title: string | null;
    }>();

  return results.map((r) => ({
    id: r.id,
    name: r.name,
    body: r.body,
    likes: r.likes,
    status: r.status,
    createdAt: r.created_at,
    date: dateLabel(r.created_at),
    idx: r.chapter_idx,
    chapterTitle: r.chapter_title || `第 ${r.chapter_idx} 章`,
  }));
}

export async function createDiscussion(
  db: D1Database,
  input: {
    bookId: number;
    chapterIdx: number;
    parentId: number | null;
    userId: number;
    name: string;
    body: string;
    status?: 'pending' | 'approved';
  },
) {
  await db
    .prepare(
      `INSERT INTO discussions (book_id, chapter_idx, parent_id, user_id, name, body, status, likes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    .bind(
      input.bookId,
      input.chapterIdx,
      input.parentId,
      input.userId,
      input.name,
      input.body,
      input.status ?? 'pending',
      Math.floor(Date.now() / 1000),
    )
    .run();
  forget(db, TALK_COUNTS);
}

export type AdminDiscussion = DiscussionItem & {
  bookId: number;
  bookTitle: string;
  bookSlug: string;
  chapterIdx: number;
  userName: string | null;
};

export async function listDiscussions(
  db: D1Database,
  status?: 'pending' | 'approved' | 'spam',
  limit = 300,
  offset = 0,
): Promise<AdminDiscussion[]> {
  const where = status ? 'WHERE d.status = ?' : '';
  const sql = `SELECT d.id, d.book_id, d.chapter_idx, d.name, d.body, d.likes, d.status, d.created_at,
                      b.title AS book_title, b.slug AS book_slug, u.name AS user_name
                 FROM discussions d
                 JOIN books b ON b.id = d.book_id
                 LEFT JOIN users u ON u.id = d.user_id
                 ${where}
                ORDER BY d.created_at DESC, d.id DESC
                LIMIT ? OFFSET ?`;
  const stmt = db.prepare(sql);
  const { results } = status
    ? await stmt.bind(status, limit, offset).all<Record<string, unknown>>()
    : await stmt.bind(limit, offset).all<Record<string, unknown>>();

  return results.map((r) => ({
    id: r.id as number,
    bookId: r.book_id as number,
    bookTitle: r.book_title as string,
    bookSlug: r.book_slug as string,
    chapterIdx: r.chapter_idx as number,
    name: r.name as string,
    userName: (r.user_name as string | null) ?? null,
    body: r.body as string,
    likes: r.likes as number,
    status: r.status as AdminDiscussion['status'],
    createdAt: r.created_at as number,
    date: dateLabel(r.created_at as number),
  }));
}

export async function countDiscussions(db: D1Database, status: 'pending' | 'approved' | 'spam') {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM discussions WHERE status = ?')
    .bind(status)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** 后台三个栏目的条数：一条 GROUP BY 取代三次计数 */
export async function countDiscussionsByStatus(db: D1Database) {
  const { results } = await db
    .prepare('SELECT status, COUNT(*) AS n FROM discussions GROUP BY status')
    .all<{ status: 'pending' | 'approved' | 'spam'; n: number }>();
  const counts = { pending: 0, approved: 0, spam: 0 };
  for (const row of results) counts[row.status] = row.n;
  return counts;
}

export async function setDiscussionStatus(
  db: D1Database,
  id: number,
  status: 'pending' | 'approved' | 'spam',
) {
  await db.prepare('UPDATE discussions SET status = ? WHERE id = ?').bind(status, id).run();
  forget(db, TALK_COUNTS);
}

export async function deleteDiscussion(db: D1Database, id: number) {
  await db.prepare('DELETE FROM discussions WHERE id = ?').bind(id).run();
  forget(db, TALK_COUNTS);
}

/** 批量改状态：按 D1 单条语句 100 个绑定参数的上限分块 */
export async function setDiscussionsStatus(
  db: D1Database,
  ids: number[],
  status: 'pending' | 'approved' | 'spam',
) {
  if (!ids.length) return;
  const stmts = chunk(ids).map((part) =>
    db
      .prepare(`UPDATE discussions SET status = ? WHERE id IN (${placeholders(part.length)})`)
      .bind(status, ...part),
  );
  await db.batch(stmts);
  forget(db, TALK_COUNTS);
}

/** 批量删除：discussion_likes 随讨论级联删除 */
export async function deleteDiscussions(db: D1Database, ids: number[]) {
  if (!ids.length) return;
  const stmts = chunk(ids).map((part) =>
    db.prepare(`DELETE FROM discussions WHERE id IN (${placeholders(part.length)})`).bind(...part),
  );
  await db.batch(stmts);
  forget(db, TALK_COUNTS);
}
