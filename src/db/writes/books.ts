import { forget } from '../../cache';
import { chunk, placeholders } from '../sql';
import type { BookStatus, SerialStatus } from '../types';

/* ---------- 后台：书籍写入 ---------- */

export type BookInput = {
  slug: string;
  title: string;
  author: string;
  category: string;
  summary: string;
  status: BookStatus;
  sort: number;
  allowDiscussion: boolean;
  featured: boolean;
  serialStatus: SerialStatus;
  coverUrl: string;
};

export async function createBook(db: D1Database, input: BookInput, ownerId: number | null = null) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `INSERT INTO books (slug, title, author, category, summary, status, sort, allow_discussion, featured, serial_status, cover_url, owner_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      input.slug,
      input.title,
      input.author,
      input.category,
      input.summary,
      input.status,
      input.sort,
      input.allowDiscussion ? 1 : 0,
      input.featured ? 1 : 0,
      input.serialStatus,
      input.coverUrl,
      ownerId,
      now,
      now,
    )
    .first<{ id: number }>();
  forget(db, 'stats', 'words');
  return row?.id ?? 0;
}

export async function updateBook(db: D1Database, id: number, input: BookInput) {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE books
          SET slug = ?, title = ?, author = ?, category = ?, summary = ?, status = ?, sort = ?,
              allow_discussion = ?, featured = ?, serial_status = ?, cover_url = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      input.slug,
      input.title,
      input.author,
      input.category,
      input.summary,
      input.status,
      input.sort,
      input.allowDiscussion ? 1 : 0,
      input.featured ? 1 : 0,
      input.serialStatus,
      input.coverUrl,
      now,
      id,
    )
    .run();
  forget(db, 'stats', 'words');
}

export async function setBookCover(db: D1Database, id: number, coverUrl: string) {
  await db
    .prepare('UPDATE books SET cover_url = ?, updated_at = ? WHERE id = ?')
    .bind(coverUrl, Math.floor(Date.now() / 1000), id)
    .run();
}

export async function getBookSlug(db: D1Database, id: number) {
  const row = await db.prepare('SELECT slug FROM books WHERE id = ?').bind(id).first<{ slug: string }>();
  return row?.slug ?? '';
}

export async function deleteBook(db: D1Database, id: number) {
  // reading_progress 没有外键，删书时按 slug 一并清掉，避免留下孤儿记录
  const row = await db.prepare('SELECT slug FROM books WHERE id = ?').bind(id).first<{ slug: string }>();
  const stmts = [];
  if (row?.slug) {
    stmts.push(db.prepare('DELETE FROM reading_progress WHERE book_slug = ?').bind(row.slug));
  }
  stmts.push(db.prepare('DELETE FROM books WHERE id = ?').bind(id));
  await db.batch(stmts);
  forget(db, 'stats', 'words', 'talk-counts');
}

/** 批量删书：章节 / 讨论随外键级联，阅读进度按 slug 一并清理 */
export async function deleteBooks(db: D1Database, ids: number[]) {
  if (!ids.length) return;
  const stmts: D1PreparedStatement[] = [];
  for (const part of chunk(ids)) {
    const marks = placeholders(part.length);
    stmts.push(
      db
        .prepare(
          `DELETE FROM reading_progress
            WHERE book_slug IN (SELECT slug FROM books WHERE id IN (${marks}))`,
        )
        .bind(...part),
    );
    stmts.push(db.prepare(`DELETE FROM books WHERE id IN (${marks})`).bind(...part));
  }
  await db.batch(stmts);
  forget(db, 'stats', 'words', 'talk-counts');
}

/** books.updated_at 的写语句：并进调用方的同一个 batch，省一次往返 */
export const touchBookStatement = (db: D1Database, id: number, now: number) =>
  db.prepare('UPDATE books SET updated_at = ? WHERE id = ?').bind(now, id);

export async function slugExists(db: D1Database, slug: string, exceptId = 0) {
  const row = await db
    .prepare('SELECT id FROM books WHERE slug = ? AND id <> ?')
    .bind(slug, exceptId)
    .first<{ id: number }>();
  return !!row;
}
