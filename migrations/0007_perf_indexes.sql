-- 性能补丁：补齐常用查询的覆盖索引
-- 1. 章节按更新时间倒序（RSS / 最近更新）
CREATE INDEX IF NOT EXISTS idx_chapters_updated ON chapters(updated_at DESC);
-- 2. 当前用户点过哪些赞（讨论列表批量查 liked）
CREATE INDEX IF NOT EXISTS idx_discussion_likes_user ON discussion_likes(user_id);
-- 3. 清理过期会话
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
