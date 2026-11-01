import { TTL_LONG, forget, memo } from '../cache';
import { chunk, placeholders } from './sql';

export type Category = {
  id: number;
  name: string;
  slug: string;
  sort: number;
  hidden: boolean;
  description: string;
};

/** 分类表；还没跑 0004 迁移时退回从书籍里取，站点照常可用 */
export async function listCategories(db: D1Database): Promise<Category[]> {
  return memo(db, 'categories', () => loadCategories(db), TTL_LONG);
}

async function loadCategories(db: D1Database): Promise<Category[]> {
  try {
    const { results } = await db
      .prepare('SELECT id, name, slug, sort, hidden, description FROM categories ORDER BY sort, id')
      .all<{
        id: number;
        name: string;
        slug: string;
        sort: number;
        hidden: number;
        description: string;
      }>();
    return results.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      sort: r.sort,
      hidden: r.hidden === 1,
      description: r.description,
    }));
  } catch {
    const { results } = await db
      .prepare("SELECT DISTINCT category FROM books WHERE status = 'published' ORDER BY category")
      .all<{ category: string }>();
    return results.map((r, i) => ({
      id: i + 1,
      name: r.category,
      slug: r.category,
      sort: i,
      hidden: false,
      description: '',
    }));
  }
}

/** 前台导航用：不隐藏的分类名，按后台排序；「未分类」只做后台兜底，前台不列 */
export async function getCategories(db: D1Database): Promise<string[]> {
  return (await listCategories(db))
    .filter((c) => !c.hidden && c.name !== FALLBACK_CATEGORY)
    .map((c) => c.name);
}

export async function getCategory(db: D1Database, key: string): Promise<Category | null> {
  const all = await listCategories(db);
  let decoded = key;
  try {
    decoded = decodeURIComponent(key);
  } catch {
    // 已经是解码后的路径，保持原样
  }
  return all.find((c) => c.slug === decoded || c.name === decoded) ?? null;
}

export async function getCategoryById(db: D1Database, id: number): Promise<Category | null> {
  return (await listCategories(db)).find((c) => c.id === id) ?? null;
}

export async function createCategory(
  db: D1Database,
  input: { name: string; slug: string; sort: number; hidden: boolean; description: string },
) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `INSERT INTO categories (name, slug, sort, hidden, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(input.name, input.slug, input.sort, input.hidden ? 1 : 0, input.description, now, now)
    .first<{ id: number }>();
  forget(db, 'categories');
  return row?.id ?? 0;
}

export async function updateCategory(
  db: D1Database,
  id: number,
  input: { name: string; slug: string; sort: number; hidden: boolean; description: string },
) {
  await db
    .prepare(
      `UPDATE categories
          SET name = ?, slug = ?, sort = ?, hidden = ?, description = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      input.name,
      input.slug,
      input.sort,
      input.hidden ? 1 : 0,
      input.description,
      Math.floor(Date.now() / 1000),
      id,
    )
    .run();
  forget(db, 'categories');
}

/** 兜底分类：被删分类下的书都回落到这里 */
const FALLBACK_CATEGORY = '未分类';
const FALLBACK_INSERT = `INSERT OR IGNORE INTO categories (name, slug, sort, hidden, description, created_at, updated_at)
  VALUES ('${FALLBACK_CATEGORY}', 'uncategorized', 9999, 0, '', ?, ?)`;

/** 删除分类：先把书回落到「未分类」，再删分类本身；「未分类」自己不允许删 */
export async function deleteCategory(db: D1Database, id: number) {
  const row = await db
    .prepare('SELECT name FROM categories WHERE id = ?')
    .bind(id)
    .first<{ name: string }>();
  if (!row || row.name === FALLBACK_CATEGORY) return false;

  const now = Math.floor(Date.now() / 1000);
  await db.batch([
    db.prepare(FALLBACK_INSERT).bind(now, now),
    db.prepare('UPDATE books SET category = ? WHERE category = ?').bind(FALLBACK_CATEGORY, row.name),
    db.prepare('DELETE FROM categories WHERE id = ?').bind(id),
  ]);
  forget(db, 'categories');
  return true;
}

/** 批量删除分类：分块查名字，统一回落后再删，返回实际删除条数 */
export async function deleteCategories(db: D1Database, ids: number[]) {
  if (!ids.length) return 0;

  const rows: { id: number; name: string }[] = [];
  for (const part of chunk(ids)) {
    const { results } = await db
      .prepare(`SELECT id, name FROM categories WHERE id IN (${placeholders(part.length)})`)
      .bind(...part)
      .all<{ id: number; name: string }>();
    rows.push(...results);
  }

  // 「未分类」是兜底，任何情况下都留着
  const targets = rows.filter((row) => row.name !== FALLBACK_CATEGORY);
  if (!targets.length) return 0;

  const now = Math.floor(Date.now() / 1000);
  const names = targets.map((row) => row.name);
  const stmts: D1PreparedStatement[] = [db.prepare(FALLBACK_INSERT).bind(now, now)];
  for (const part of chunk(names)) {
    stmts.push(
      db
        .prepare(`UPDATE books SET category = ? WHERE category IN (${placeholders(part.length)})`)
        .bind(FALLBACK_CATEGORY, ...part),
    );
  }
  const keep = targets.map((row) => row.id);
  for (const part of chunk(keep)) {
    stmts.push(
      db.prepare(`DELETE FROM categories WHERE id IN (${placeholders(part.length)})`).bind(...part),
    );
  }

  await db.batch(stmts);
  forget(db, 'categories');
  return keep.length;
}

/** 后台分类下拉用：分类表 + 书里实际出现的旧分类（改名不同步 books.category） */
export async function categoryNames(db: D1Database): Promise<string[]> {
  const [categories, counts] = await Promise.all([listCategories(db), categoryBookCounts(db)]);
  const names = categories.map((cat) => cat.name);
  const seen = new Set(names);
  for (const name of Object.keys(counts)) {
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

export async function categoryBookCounts(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db
    .prepare('SELECT category, COUNT(*) AS n FROM books GROUP BY category')
    .all<{ category: string; n: number }>();
  const map: Record<string, number> = {};
  for (const row of results) map[row.category] = row.n;
  return map;
}

export async function categoryExists(db: D1Database, key: 'name' | 'slug', value: string, exceptId = 0) {
  const row = await db
    .prepare(`SELECT id FROM categories WHERE ${key} = ? AND id <> ?`)
    .bind(value, exceptId)
    .first<{ id: number }>();
  return !!row;
}
