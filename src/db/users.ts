import type { Role } from '../env';
import { chunk, placeholders } from './sql';
import type { User } from './types';

/* ---------- 用户 / 会话 ---------- */

type UserRow = {
  id: number;
  email: string;
  name: string;
  role: Role;
  status: 'active' | 'banned';
  created_at: number;
  last_login_at: number | null;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

const USER_COLS = 'id, email, name, role, status, created_at, last_login_at';

export async function findUserByEmail(db: D1Database, email: string) {
  const row = await db
    .prepare(`SELECT ${USER_COLS}, pass_hash, salt FROM users WHERE email = ?`)
    .bind(email)
    .first<UserRow & { pass_hash: string; salt: string }>();
  return row ?? null;
}

export async function getUserById(db: D1Database, id: number) {
  const row = await db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).bind(id).first<UserRow>();
  return row ? toUser(row) : null;
}

export async function countOwners(db: D1Database) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'")
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** 站长 id 列表：批量封禁要跳过他们，避免一次全选把站长封光 */
export async function listOwnerIds(db: D1Database) {
  const { results } = await db.prepare("SELECT id FROM users WHERE role = 'owner'").all<{ id: number }>();
  return results.map((row) => row.id);
}

export async function createUser(
  db: D1Database,
  input: {
    email: string;
    name: string;
    role: Role;
    passHash: string;
    salt: string;
  },
) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `INSERT INTO users (email, name, role, status, pass_hash, salt, created_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?)
       RETURNING id`,
    )
    .bind(input.email, input.name, input.role, input.passHash, input.salt, now)
    .first<{ id: number }>();
  return row?.id ?? 0;
}

export async function touchLogin(db: D1Database, id: number) {
  await db
    .prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
    .bind(Math.floor(Date.now() / 1000), id)
    .run();
}

export async function listUsers(db: D1Database, q = '') {
  // 昵称或邮箱模糊匹配；参数走占位符，不拼 SQL
  const where = q ? 'WHERE name LIKE ? OR email LIKE ?' : '';
  const stmt = db.prepare(
    `SELECT ${USER_COLS} FROM users
       ${where}
       ORDER BY CASE role
                  WHEN 'owner' THEN 0
                  WHEN 'editor' THEN 1
                  WHEN 'author' THEN 2
                  ELSE 3
                END, id`,
  );
  const { results } = await (q ? stmt.bind(`%${q}%`, `%${q}%`) : stmt).all<UserRow>();
  return results.map(toUser);
}

export async function updateUserRole(db: D1Database, id: number, role: Role) {
  await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, id).run();
}

export async function updateUserStatus(db: D1Database, id: number, status: 'active' | 'banned') {
  await db.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, id).run();
  if (status === 'banned') {
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
  }
}

/** 批量改状态：封禁时顺手清掉这批账号的会话，按 D1 参数上限分块 */
export async function setUsersStatus(db: D1Database, ids: number[], status: 'active' | 'banned') {
  if (!ids.length) return;
  const stmts = chunk(ids).flatMap((part) => {
    const marks = placeholders(part.length);
    const out = [db.prepare(`UPDATE users SET status = ? WHERE id IN (${marks})`).bind(status, ...part)];
    if (status === 'banned') out.push(db.prepare(`DELETE FROM sessions WHERE user_id IN (${marks})`).bind(...part));
    return out;
  });
  await db.batch(stmts);
}

export async function createSession(
  db: D1Database,
  token: string,
  userId: number,
  expiresAt: number,
) {
  await db
    .prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, userId, Math.floor(Date.now() / 1000), expiresAt)
    .run();
}

export async function findSessionUser(db: D1Database, token: string) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.status
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ?`,
    )
    .bind(token, now)
    .first<{ id: number; email: string; name: string; role: Role; status: 'active' | 'banned' }>();
  if (!row || row.status !== 'active') return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export async function deleteSession(db: D1Database, token: string) {
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export async function pruneSessions(db: D1Database) {
  await db
    .prepare('DELETE FROM sessions WHERE expires_at <= ?')
    .bind(Math.floor(Date.now() / 1000))
    .run();
}
