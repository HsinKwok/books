import { listBooks } from './books';
import { listCategories } from './taxonomy';

/* ---------- 操作日志 / 备份 ---------- */

export type AuditItem = {
  id: number;
  action: string;
  detail: string;
  userName: string | null;
  createdAt: number;
};

/** 审计日志只保留最近这么多条：后台只读最近 100 条，不需要无限历史 */
const AUDIT_KEEP = 5000;

export async function logAudit(
  db: D1Database,
  userId: number | null,
  action: string,
  detail: string,
) {
  try {
    // 写入和裁剪合成一个 batch：一次往返、一个事务。
    // 按主键范围删除，id 单调递增，不需要给 created_at 加索引。
    await db.batch([
      db
        .prepare('INSERT INTO audit_log (user_id, action, detail, created_at) VALUES (?, ?, ?, ?)')
        .bind(userId, action, detail.slice(0, 500), Math.floor(Date.now() / 1000)),
      db
        .prepare('DELETE FROM audit_log WHERE id <= (SELECT MAX(id) FROM audit_log) - ?')
        .bind(AUDIT_KEEP),
    ]);
  } catch {
    // 日志失败不影响主流程
  }
}

export async function listAudit(db: D1Database, limit = 100): Promise<AuditItem[]> {
  try {
    const { results } = await db
      .prepare(
        `SELECT a.id, a.action, a.detail, a.created_at, u.name AS user_name
           FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
          ORDER BY a.id DESC LIMIT ?`,
      )
      .bind(limit)
      .all<{ id: number; action: string; detail: string; created_at: number; user_name: string | null }>();
    return results.map((r) => ({
      id: r.id,
      action: r.action,
      detail: r.detail,
      userName: r.user_name,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

/** 导出整站数据（不含密码与会话） */
export async function exportBackup(db: D1Database) {
  const [books, categories, discussions, users, settings] = await Promise.all([
    listBooks(db, { includeDrafts: true }),
    listCategories(db),
    db
      .prepare('SELECT * FROM discussions ORDER BY id')
      .all<Record<string, unknown>>(),
    db
      .prepare('SELECT id, email, name, role, status, created_at, last_login_at FROM users ORDER BY id')
      .all<Record<string, unknown>>(),
    db.prepare('SELECT key, value FROM settings ORDER BY key').all<Record<string, unknown>>(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    books,
    categories,
    discussions: discussions.results,
    users: users.results,
    settings: settings.results,
  };
}
