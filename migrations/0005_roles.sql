-- 多角色协作：owner（站长）/ editor（编辑）/ author（作者）/ reader（读者）
-- users.role 是自由文本，不需要重建表；原来的 admin 一律视为站长
UPDATE users SET role = 'owner' WHERE role = 'admin';

-- 书籍归属；NULL 表示站点公共书（历史数据）
ALTER TABLE books ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_books_owner ON books(owner_id);
