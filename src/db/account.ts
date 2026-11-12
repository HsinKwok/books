/* ---------- 账号：改密码 ---------- */

export async function updateUserPassword(db: D1Database, id: number, hash: string, salt: string) {
  await db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE id = ?').bind(hash, salt, id).run();
}

export async function deleteUserSessions(db: D1Database, userId: number) {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

/* ---------- 密码重置令牌 ---------- */

export type PasswordResetRow = {
  id: number;
  user_id: number;
  expires_at: number;
  used_at: number | null;
  email: string;
  name: string;
  status: 'active' | 'banned';
};

export async function createPasswordReset(
  db: D1Database,
  input: { userId: number; tokenHash: string; expiresAt: number; requestIp: string | null },
) {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO password_resets (user_id, token_hash, expires_at, created_at, request_ip)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(input.userId, input.tokenHash, input.expiresAt, now, input.requestIp)
    .run();
}

export async function findPasswordReset(db: D1Database, tokenHash: string) {
  return db
    .prepare(
      `SELECT r.id, r.user_id, r.expires_at, r.used_at, u.email, u.name, u.status
         FROM password_resets r JOIN users u ON u.id = r.user_id
        WHERE r.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<PasswordResetRow>();
}

export async function usePasswordReset(db: D1Database, id: number) {
  await db
    .prepare('UPDATE password_resets SET used_at = ? WHERE id = ?')
    .bind(Math.floor(Date.now() / 1000), id)
    .run();
}

/** 重置成功后清掉这个用户剩下的令牌与过期记录 */
export async function clearPasswordResets(db: D1Database, userId: number) {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare('DELETE FROM password_resets WHERE user_id = ? OR expires_at <= ?')
    .bind(userId, now)
    .run();
}

/** 限流用：某邮箱 / 某 IP 在时间窗内发过几封 */
export async function countRecentResets(
  db: D1Database,
  field: 'user_id' | 'request_ip',
  value: number | string,
  since: number,
) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM password_resets WHERE ${field} = ? AND created_at > ?`)
    .bind(value, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
