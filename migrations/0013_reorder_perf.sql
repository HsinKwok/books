-- 插章重排的性能配套：
-- 1) 位移只改 idx，不应触发全文索引重建；只有标题/正文变化才需要维护 FTS
DROP TRIGGER IF EXISTS chapters_au;
CREATE TRIGGER IF NOT EXISTS chapters_au AFTER UPDATE OF title, body ON chapters BEGIN
  INSERT INTO chapters_fts(chapters_fts, rowid, title, body)
  VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO chapters_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

-- 2) 与 UNIQUE (book_id, idx) 的自动索引完全重复，每次写入白维护一份
DROP INDEX IF EXISTS idx_chapters_book;

-- 3) reading_progress 主键前导列是 user_id，按书批量迁移 chapter_idx 时会全表扫描
CREATE INDEX IF NOT EXISTS idx_reading_progress_book ON reading_progress(book_slug, chapter_idx);
