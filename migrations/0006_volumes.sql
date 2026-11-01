-- 卷：一本书可以有 N 卷，每卷下面 N 章；没有卷的书保持原样
CREATE TABLE IF NOT EXISTS volumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  intro TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (book_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_volumes_book ON volumes(book_id, idx);

-- 章节归属的卷；NULL 表示未分卷（没有卷的书全部是 NULL）
-- 章节的 idx 仍保持全书连续，URL / 讨论 / 进度都不受影响
ALTER TABLE chapters ADD COLUMN volume_id INTEGER REFERENCES volumes(id) ON DELETE SET NULL;
