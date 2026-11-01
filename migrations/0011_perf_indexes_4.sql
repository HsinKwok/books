-- 性能补丁 4：列表 / 首页 / 后台 / 讨论的排序索引
-- 说明：旧索引先保留，观察一版后再清理。

-- 1. 列表默认排序：已发布 + 最近更新
CREATE INDEX IF NOT EXISTS idx_books_status_updated ON books(status, updated_at DESC, id DESC);
-- 2. 首页精选 / 推荐位
CREATE INDEX IF NOT EXISTS idx_books_status_featured ON books(status, featured DESC, sort, id);
-- 3. 分类页排序
CREATE INDEX IF NOT EXISTS idx_books_category_sort ON books(category, status, sort, id);
-- 4. 作者页排序
CREATE INDEX IF NOT EXISTS idx_books_author_sort ON books(author, status, sort, id);
-- 5. 后台「我的书」：按归属 + 最近更新
CREATE INDEX IF NOT EXISTS idx_books_owner_updated ON books(owner_id, updated_at DESC);
-- 6. 最近更新章节（RSS / 首页更新流）
CREATE INDEX IF NOT EXISTS idx_chapters_status_updated ON chapters(status, updated_at DESC);
-- 7. 讨论按书 + 状态取最新
CREATE INDEX IF NOT EXISTS idx_discussions_book_status ON discussions(book_id, status, created_at DESC);
