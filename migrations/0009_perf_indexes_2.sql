-- 性能补丁 2：补齐限流与「继续阅读」的查询索引
-- 1. 忘记密码限流：按 IP + 时间统计最近申请次数
CREATE INDEX IF NOT EXISTS idx_password_resets_ip ON password_resets(request_ip, created_at DESC);
-- 2. 继续阅读：取某用户最近更新的一条进度
CREATE INDEX IF NOT EXISTS idx_reading_progress_user_time ON reading_progress(user_id, updated_at DESC);
