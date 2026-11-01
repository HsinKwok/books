-- 性能补丁 3：分类页 / 作者页 / 后台「最近更新」的查询索引
-- 1. 分类页：按分类取已发布的书
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category, status);
-- 2. 作者页：按作者取已发布的书
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author, status);
-- 3. 后台概览：按更新时间倒序取最近几本
CREATE INDEX IF NOT EXISTS idx_books_updated ON books(updated_at DESC);
