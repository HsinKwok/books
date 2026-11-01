import type { Role } from '../env';

export type BookStatus = 'draft' | 'published';

export type SerialStatus = 'serializing' | 'finished' | 'paused';

export const SERIAL_LABELS: Record<SerialStatus, string> = {
  serializing: '连载中',
  finished: '已完结',
  paused: '暂停更新',
};

export type Chapter = {
  id: number;
  idx: number;
  title: string;
  body: string;
  /** 预渲染的正文 HTML；bodyHash 与当前正文摘要一致时才可直接复用 */
  bodyHtml: string | null;
  bodyHash: string | null;
  paragraphs: string[];
  words: number;
  status: BookStatus;
  updatedAt: number;
  /** 所属卷，null 表示未分卷 */
  volumeId: number | null;
  /** 卷内序号（按位置计算，1 起）；未分卷时为 0 */
  volumeNo: number;
};

export type Volume = {
  id: number;
  idx: number;
  title: string;
  intro: string;
};

export type Book = {
  id: number;
  slug: string;
  title: string;
  author: string;
  category: string;
  summary: string;
  status: BookStatus;
  sort: number;
  allowDiscussion: boolean;
  featured: boolean;
  serialStatus: SerialStatus;
  coverUrl: string;
  ownerId: number | null;
  createdAt: number;
  updatedAt: string;
  chapters: Chapter[];
  volumes: Volume[];
};

export type BookRow = {
  id: number;
  slug: string;
  title: string;
  author: string;
  category: string;
  summary: string;
  status: BookStatus;
  sort: number;
  allow_discussion: number;
  featured: number;
  serial_status: SerialStatus;
  cover_url: string;
  owner_id: number | null;
  created_at: number;
  updated_at: number;
};

export type ChapterRow = {
  id: number;
  book_id: number;
  idx: number;
  title: string;
  body: string;
  body_html: string | null;
  body_hash: string | null;
  words: number;
  status: BookStatus;
  updated_at: number;
  volume_id: number | null;
};

export type DiscussionItem = {
  id: number;
  name: string;
  body: string;
  likes: number;
  status: 'pending' | 'approved' | 'spam';
  createdAt: number;
  date: string;
  liked?: boolean;
};

export type User = {
  id: number;
  email: string;
  name: string;
  role: Role;
  status: 'active' | 'banned';
  createdAt: number;
  lastLoginAt: number | null;
};

export type Stats = { books: number; chapters: number; words: number };

export const BOOK_COLS =
  'id, slug, title, author, category, summary, status, sort, allow_discussion, featured, serial_status, cover_url, owner_id, created_at, updated_at';
export const CHAPTER_COLS =
  'id, book_id, idx, volume_id, title, body, body_html, body_hash, words, status, updated_at';
/** 列表/目录用：不取正文，避免整本书的 body 被读进 Worker */
export const CHAPTER_COLS_LITE = 'id, book_id, idx, volume_id, title, words, status, updated_at';

export const DAY = 86400;

/** 把秒级时间戳转成东八区的 YYYY-MM-DD */
export function isoDate(ts: number) {
  const d = new Date(ts * 1000 + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

/** 讨论列表里用的「10月27日」 */
export function dateLabel(ts: number) {
  const d = new Date(ts * 1000 + 8 * 3600 * 1000);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

export function countWords(text: string) {
  return text.replace(/\s/g, '').length;
}

/** 纯文本按空行分段 */
export function toParagraphs(body: string) {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** 行首带 Markdown 结构的行，保留换行；其余段落按纯文本合并 */
const MD_LINE = /^\s*(?:#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|```)/;

/**
 * 把编辑框里的文本整理成统一格式：
 * 纯文本段内换行合并、段间留一个空行；
 * 带 Markdown 结构的段落（列表、引用、代码块等）保留原始换行。
 */
export function normalizeBody(text: string) {
  const out: string[] = [];
  let buf: string[] = [];
  let inFence = false;

  const flush = () => {
    if (!buf.length) return;
    const structured = buf.some((line) => MD_LINE.test(line));
    out.push(
      structured
        ? buf.join('\n')
        : buf
            .map((line) => line.trim())
            .filter(Boolean)
            .join(''),
    );
    buf = [];
  };

  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      buf.push(line);
      continue;
    }
    if (!inFence && !line.trim()) {
      flush();
      out.push('');
      continue;
    }
    buf.push(line);
  }
  flush();

  return out
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
    .replace(/\n{3,}/g, '\n\n');
}
