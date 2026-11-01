-- 分类：后台可排序、可隐藏；未迁移到的旧数据从 books.category 里补一份
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO categories (name, slug, sort, hidden, description, created_at, updated_at)
SELECT DISTINCT category, category, 0, 0, '', strftime('%s', 'now'), strftime('%s', 'now')
  FROM books
 WHERE category <> '';

-- 封面：存 R2 对象键或外链地址，空串表示用排版生成的封面
ALTER TABLE books ADD COLUMN cover_url TEXT NOT NULL DEFAULT '';

-- 讨论点赞
CREATE TABLE IF NOT EXISTS discussion_likes (
  discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (discussion_id, user_id)
);

-- 云端阅读进度（每本书一条，登录用户）
CREATE TABLE IF NOT EXISTS reading_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_slug TEXT NOT NULL,
  chapter_idx INTEGER NOT NULL,
  ratio REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_slug)
);

-- 后台操作日志
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- 章节全文索引：trigram 支持中文子串，少于 3 个字时退回 LIKE
CREATE VIRTUAL TABLE IF NOT EXISTS chapters_fts USING fts5(
  title,
  body,
  content = 'chapters',
  content_rowid = 'id',
  tokenize = 'trigram'
);

INSERT INTO chapters_fts(chapters_fts) VALUES ('rebuild');

CREATE TRIGGER IF NOT EXISTS chapters_ai AFTER INSERT ON chapters BEGIN
  INSERT INTO chapters_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS chapters_ad AFTER DELETE ON chapters BEGIN
  INSERT INTO chapters_fts(chapters_fts, rowid, title, body)
  VALUES ('delete', old.id, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS chapters_au AFTER UPDATE ON chapters BEGIN
  INSERT INTO chapters_fts(chapters_fts, rowid, title, body)
  VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO chapters_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
