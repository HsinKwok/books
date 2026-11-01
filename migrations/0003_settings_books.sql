-- 站点设置：键值对，未写入的行取代码里的默认值
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

-- 书籍开关：是否允许讨论、首页推荐、连载状态
ALTER TABLE books ADD COLUMN allow_discussion INTEGER NOT NULL DEFAULT 1;
ALTER TABLE books ADD COLUMN featured INTEGER NOT NULL DEFAULT 0;
ALTER TABLE books ADD COLUMN serial_status TEXT NOT NULL DEFAULT 'serializing'; -- serializing | finished | paused
