import { countDiscussions } from './discussions';

/* ---------- 后台概览 ---------- */

export type AdminOverview = {
  books: number;
  publishedBooks: number;
  draftBooks: number;
  chapters: number;
  draftChapters: number;
  words: number;
  users: number;
  pending: number;
};

export async function getAdminOverview(db: D1Database): Promise<AdminOverview> {
  const [books, chapters, users, pending] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
                SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft
           FROM books`,
      )
      .first<{ total: number; published: number | null; draft: number | null }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(words), 0) AS words,
                SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft
           FROM chapters`,
      )
      .first<{ total: number; words: number; draft: number | null }>(),
    db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>(),
    countDiscussions(db, 'pending'),
  ]);

  return {
    books: books?.total ?? 0,
    publishedBooks: books?.published ?? 0,
    draftBooks: books?.draft ?? 0,
    chapters: chapters?.total ?? 0,
    draftChapters: chapters?.draft ?? 0,
    words: chapters?.words ?? 0,
    users: users?.n ?? 0,
    pending,
  };
}

/** 作者只看自己名下的书：一条聚合语句算完，不把全部章节读进内存 */
export async function getOwnerOverview(db: D1Database, ownerId: number): Promise<AdminOverview> {
  const row = await db
    .prepare(
      `SELECT COUNT(DISTINCT b.id) AS books,
              COUNT(DISTINCT CASE WHEN b.status = 'published' THEN b.id END) AS published,
              COUNT(DISTINCT CASE WHEN b.status = 'draft' THEN b.id END) AS draft,
              COUNT(c.id) AS chapters,
              COALESCE(SUM(CASE WHEN c.status = 'draft' THEN 1 ELSE 0 END), 0) AS draft_chapters,
              COALESCE(SUM(c.words), 0) AS words
         FROM books b LEFT JOIN chapters c ON c.book_id = b.id
        WHERE b.owner_id = ?`,
    )
    .bind(ownerId)
    .first<{
      books: number;
      published: number;
      draft: number;
      chapters: number;
      draft_chapters: number;
      words: number;
    }>();

  return {
    books: row?.books ?? 0,
    publishedBooks: row?.published ?? 0,
    draftBooks: row?.draft ?? 0,
    chapters: row?.chapters ?? 0,
    draftChapters: row?.draft_chapters ?? 0,
    words: row?.words ?? 0,
    users: 0,
    pending: 0,
  };
}
