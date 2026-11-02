-- 性能补丁 5：删掉完全重复 / 从未被查询用到的索引，减少每次写入的索引维护
-- 说明：0011 加的新索引已上线观察过，这里清理被它们覆盖掉的旧索引。

-- 1) idx_books_category(category, status) 是 idx_books_category_sort(category, status, sort, id) 的前缀
DROP INDEX IF EXISTS idx_books_category;
-- 2) idx_books_author(author, status) 同理被 idx_books_author_sort 覆盖
DROP INDEX IF EXISTS idx_books_author;
-- 3) 操作日志只按 id DESC 翻页（listAudit），created_at 索引没人用
DROP INDEX IF EXISTS idx_audit_created;
