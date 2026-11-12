/* ---------- 云端阅读进度 ---------- */

export type ReadingProgress = {
  slug: string;
  idx: number;
  ratio: number;
  bookTitle: string;
  chapterTitle: string;
};

/** 校验并写入阅读进度：一条语句完成，省掉每次心跳先查书、再查章节 */
export async function saveReadingProgress(
  db: D1Database,
  userId: number,
  slug: string,
  idx: number,
  ratio: number,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `INSERT INTO reading_progress (user_id, book_slug, chapter_idx, ratio, updated_at)
       SELECT ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM books b JOIN chapters c ON c.book_id = b.id
           WHERE b.slug = ? AND c.idx = ? AND c.status = 'published'
        )
       ON CONFLICT (user_id, book_slug) DO UPDATE SET
         chapter_idx = excluded.chapter_idx,
         ratio = excluded.ratio,
         updated_at = excluded.updated_at`,
    )
    .bind(userId, slug, idx, Math.max(0, Math.min(1, ratio)), now, slug, idx)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function getReadingProgress(
  db: D1Database,
  userId: number,
  slug: string,
): Promise<{ idx: number; ratio: number } | null> {
  try {
    const row = await db
      .prepare('SELECT chapter_idx, ratio FROM reading_progress WHERE user_id = ? AND book_slug = ?')
      .bind(userId, slug)
      .first<{ chapter_idx: number; ratio: number }>();
    return row ? { idx: row.chapter_idx, ratio: row.ratio } : null;
  } catch {
    return null;
  }
}

export async function getLatestProgress(
  db: D1Database,
  userId: number,
): Promise<ReadingProgress | null> {
  try {
    const row = await db
      .prepare(
        `SELECT p.book_slug, p.chapter_idx, p.ratio, b.title AS book_title, c.title AS chapter_title
           FROM reading_progress p
           JOIN books b ON b.slug = p.book_slug AND b.status = 'published'
           LEFT JOIN chapters c ON c.book_id = b.id AND c.idx = p.chapter_idx AND c.status = 'published'
          WHERE p.user_id = ?
          ORDER BY p.updated_at DESC
          LIMIT 1`,
      )
      .bind(userId)
      .first<{
        book_slug: string;
        chapter_idx: number;
        ratio: number;
        book_title: string;
        chapter_title: string | null;
      }>();
    if (!row) return null;
    return {
      slug: row.book_slug,
      idx: row.chapter_idx,
      ratio: row.ratio,
      bookTitle: row.book_title,
      chapterTitle: row.chapter_title ?? '',
    };
  } catch {
    return null;
  }
}
