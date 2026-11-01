-- 忘记密码：一次性重置令牌（只存 SHA-256，明文只在邮件链接里出现一次）
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL,
  request_ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires ON password_resets(expires_at);
