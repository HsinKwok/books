-- 初始结构：一个全新数据库执行本文件即可建好全部表、索引与全文索引触发器。
-- 时间字段统一用秒级 Unix 时间戳（INTEGER）。

-- ---------------------------------------------------------------------------
-- 账号与登录
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'reader',    -- owner | editor | author | reader
  status TEXT NOT NULL DEFAULT 'active',  -- active | banned
  pass_hash TEXT NOT NULL,                -- base64(PBKDF2-SHA256)
  salt TEXT NOT NULL,                     -- base64
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL,
  request_ip TEXT
);

-- ---------------------------------------------------------------------------
-- 书库：分类 / 书 / 卷 / 章节
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',   -- draft | published
  sort INTEGER NOT NULL DEFAULT 0,
  allow_discussion INTEGER NOT NULL DEFAULT 1,
  featured INTEGER NOT NULL DEFAULT 0,
  serial_status TEXT NOT NULL DEFAULT 'serializing',
  cover_url TEXT NOT NULL DEFAULT '',
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- NULL 表示站点公共书
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE volumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (book_id, idx)
);

CREATE TABLE chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',          -- 纯文本，空行分段
  words INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',   -- draft | published
  volume_id INTEGER REFERENCES volumes(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (book_id, idx)
);

-- 全文索引：detail=none 不存位置信息，体积约为默认配置的 15%；
-- 查询侧用三元组 AND 匹配 + instr 精确过滤，不使用 snippet()。
CREATE VIRTUAL TABLE chapters_fts USING fts5(
  title,
  body,
  content = 'chapters',
  content_rowid = 'id',
  tokenize = 'trigram',
  detail = none,
  columnsize = 0
);

CREATE TRIGGER chapters_ai AFTER INSERT ON chapters BEGIN
  INSERT INTO chapters_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

CREATE TRIGGER chapters_ad AFTER DELETE ON chapters BEGIN
  INSERT INTO chapters_fts(chapters_fts, rowid, title, body)
  VALUES ('delete', old.id, old.title, old.body);
END;

-- 只有标题 / 正文变化才重建索引，重排章节不会白跑一次全文删除+插入
CREATE TRIGGER chapters_au AFTER UPDATE OF title, body ON chapters BEGIN
  INSERT INTO chapters_fts(chapters_fts, rowid, title, body)
  VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO chapters_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

-- ---------------------------------------------------------------------------
-- 书评与阅读进度
-- ---------------------------------------------------------------------------

CREATE TABLE discussions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  chapter_idx INTEGER NOT NULL,
  parent_id INTEGER REFERENCES discussions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | spam
  likes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE discussion_likes (
  discussion_id INTEGER NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (discussion_id, user_id)
);

CREATE TABLE reading_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_slug TEXT NOT NULL,
  chapter_idx INTEGER NOT NULL,
  ratio REAL NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, book_slug)
);

-- ---------------------------------------------------------------------------
-- 站点设置与审计
-- ---------------------------------------------------------------------------

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- 索引
-- ---------------------------------------------------------------------------

CREATE INDEX idx_books_status ON books(status, sort);
CREATE INDEX idx_books_status_updated ON books(status, updated_at DESC, id DESC);
CREATE INDEX idx_books_status_featured ON books(status, featured DESC, sort, id);
CREATE INDEX idx_books_author_sort ON books(author, status, sort, id);
CREATE INDEX idx_books_category_sort ON books(category, status, sort, id);
CREATE INDEX idx_books_updated ON books(updated_at DESC);
CREATE INDEX idx_books_owner ON books(owner_id);
CREATE INDEX idx_books_owner_updated ON books(owner_id, updated_at DESC);

CREATE INDEX idx_chapters_updated ON chapters(updated_at DESC);
CREATE INDEX idx_chapters_status_updated ON chapters(status, updated_at DESC);

CREATE INDEX idx_discussions_book_status ON discussions(book_id, status, created_at DESC);
CREATE INDEX idx_discussions_chapter ON discussions(book_id, chapter_idx, status);
CREATE INDEX idx_discussions_status ON discussions(status, created_at);
CREATE INDEX idx_discussion_likes_user ON discussion_likes(user_id);

CREATE INDEX idx_reading_progress_book ON reading_progress(book_slug, chapter_idx);
CREATE INDEX idx_reading_progress_user_time ON reading_progress(user_id, updated_at DESC);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE INDEX idx_password_resets_user ON password_resets(user_id, created_at DESC);
CREATE INDEX idx_password_resets_expires ON password_resets(expires_at);
CREATE INDEX idx_password_resets_ip ON password_resets(request_ip, created_at DESC);
