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
  // 四条互不依赖的统计并成一个 batch：一次往返取回
  const [books, chapters, users, pending] = await db.batch([
    db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
              SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft
         FROM books`,
    ),
    db.prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(words), 0) AS words,
              SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft
         FROM chapters`,
    ),
    db.prepare('SELECT COUNT(*) AS n FROM users'),
    db.prepare(`SELECT COUNT(*) AS n FROM discussions WHERE status = 'pending'`),
  ]);

  const bookRow = books.results?.[0] as
    | { total: number; published: number | null; draft: number | null }
    | undefined;
  const chapterRow = chapters.results?.[0] as
    | { total: number; words: number; draft: number | null }
    | undefined;
  const userRow = users.results?.[0] as { n: number } | undefined;
  const pendingRow = pending.results?.[0] as { n: number } | undefined;

  return {
    books: bookRow?.total ?? 0,
    publishedBooks: bookRow?.published ?? 0,
    draftBooks: bookRow?.draft ?? 0,
    chapters: chapterRow?.total ?? 0,
    draftChapters: chapterRow?.draft ?? 0,
    words: chapterRow?.words ?? 0,
    users: userRow?.n ?? 0,
    pending: pendingRow?.n ?? 0,
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
