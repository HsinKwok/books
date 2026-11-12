import type { Context } from 'hono';
import type { Child } from 'hono/jsx';
import type { Env, Variables } from '../env';
import type { Book, BookInput } from '../db';
import { getSettings, readerDefaults } from '../settings';
import { formString } from '../forms';

export type AdminContext = Context<{ Bindings: Env; Variables: Variables }>;

const NOTICES: Record<string, string> = {
  saved: '已保存。',
  created: '已创建。',
  deleted: '已删除。',
  imported: '导入完成。',
  updated: '已更新。',
  pw: '密码已更新。',
  old: '旧密码不对。',
  mismatch: '两次输入的新密码不一致。',
  short: '新密码至少 8 位。',
  gateShort: '访问口令至少 4 位。',
  gatepw: '口令模式需要先设置访问口令，已保持开放浏览。',
  duplicated: '名称或链接已经存在。',
  self: '不能修改自己的角色或状态。',
  lastOwner: '至少要保留一位站长。',
  mail: '发信信息不完整（主机、账号、授权码、发件地址都要填），已先关闭发信功能。',
  mailTo: '收件邮箱格式不对。',
  mailSent: '测试邮件已发送，请查收。',
  mailFail: '测试邮件发送失败，原因已写进操作日志。',
};

export function notice(c: AdminContext) {
  return NOTICES[c.req.query('m') ?? ''] ?? undefined;
}

export function adminUser(c: AdminContext) {
  return c.get('user')!;
}

export const html = (c: AdminContext, node: Child) => c.html(String(node));

/** 批量接口单次上限：避免一条请求塞进几万条语句 */
export const BATCH_LIMIT = 200;

/**
 * 跨站校验：后台批量接口只有 JSON 请求，没有表单令牌，
 * 用浏览器自带的请求来源信息挡掉外部站点发起的调用。
 */
export function isCrossSite(c: AdminContext) {
  const site = c.req.header('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return true;

  const origin = c.req.header('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(c.req.url).host;
  } catch {
    return true;
  }
}

/** 把前端传来的 id 列表整理成去重、正整数、最多 BATCH_LIMIT 条 */
export function batchIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<number>();
  for (const item of raw) {
    const id = Math.trunc(Number(item));
    if (Number.isFinite(id) && id > 0) out.add(id);
    if (out.size >= BATCH_LIMIT) break;
  }
  return [...out];
}

/** 读 JSON body，格式不对时返回 null 而不是抛错 */
export async function readJson(c: AdminContext): Promise<Record<string, unknown> | null> {
  try {
    const data = await c.req.json();
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 后台首屏主题：跟随后台「设置」里的默认主题 */
export async function adminTheme(c: AdminContext) {
  return readerDefaults(await getSettings(c.env.DB)).theme;
}

export function nowBook(): Book {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: 0,
    slug: '',
    title: '',
    author: '',
    category: '',
    summary: '',
    status: 'draft',
    sort: 0,
    allowDiscussion: true,
    featured: false,
    serialStatus: 'serializing',
    coverUrl: '',
    ownerId: null,
    createdAt: now,
    updatedAt: '',
    chapterCount: 0,
    words: 0,
    firstChapterTitle: '',
    chapters: [],
    volumes: [],
  };
}

export function parseBookForm(form: FormData, fallbackSlug: string): BookInput {
  const status = formString(form, 'status') === 'published' ? 'published' : 'draft';
  const sort = Number(formString(form, 'sort'));
  const serial = formString(form, 'serialStatus');
  const serialStatus = serial === 'finished' || serial === 'paused' ? serial : 'serializing';
  return {
    slug: formString(form, 'slug') || fallbackSlug,
    title: formString(form, 'title'),
    author: formString(form, 'author'),
    category: formString(form, 'category'),
    summary: formString(form, 'summary'),
    status,
    sort: Number.isFinite(sort) ? Math.trunc(sort) : 0,
    allowDiscussion: formString(form, 'allowDiscussion') === '1',
    featured: formString(form, 'featured') === '1',
    serialStatus,
    coverUrl: formString(form, 'coverUrl'),
  };
}

export function validateBook(input: BookInput): string | null {
  if (!input.title) return '书名不能为空。';
  if (!input.author) return '作者不能为空。';
  if (!input.category) return '分类不能为空。';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) {
    return '链接只能用英文小写、数字和连字符，例如 fog-harbor。';
  }
  return null;
}

/** 把表单输入还原成 Book，用于校验失败时回填表单 */
export function bookFromInput(input: BookInput, id = 0, chapters: Book['chapters'] = []): Book {
  return {
    id,
    ...input,
    ownerId: null,
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: '',
    chapterCount: chapters.length,
    words: chapters.reduce((n, c) => n + c.words, 0),
    firstChapterTitle: chapters[0]?.title ?? '',
    chapters,
    volumes: [],
  };
}
