/**
 * 站点设置：存在 D1 的 settings 键值表里，没写过的键用这里给的默认值。
 * 后台「设置」页负责写入，前台读取后渲染。
 */

import { stripInline } from './markdown';

export type FriendLink = { name: string; url: string };

export const SETTING_DEFAULTS = {
  // 站点身份
  'site.name': '书架',
  'site.mark': '*',
  'site.tagline': 'Read slowly',
  // 首页文案
  'home.eyebrow': '一个人的在线书架',
  'home.title1': '好好排字，',
  'home.title2': '慢慢读书。',
  'home.lede':
    '这里没有推荐算法，没有签到弹窗，也没有「猜你喜欢」。只有把行距、字距、留白都认真调过的正文，和一条能记住你读到哪里的书签。',
  // 首页模块开关
  'home.showUpdates': '1',
  'home.showStats': '1',
  'home.showNotes': '1',
  'home.showResume': '1',
  // 关于 / 隐私
  'about.title': '关于这个书架',
  'about.body':
    '这是一个人的在线阅读站，用来放自己写的东西，也放愿意慢慢读的人。\n\n页面没有推荐算法，没有签到弹窗。正文的字号、行距和留白都反复调过，希望读起来不累。\n\n如果你也想在这里放一本书，可以先注册一个读者账号，或者直接写信给我。',
  'privacy.title': '隐私说明',
  'privacy.body':
    '这个站点只收集维持功能所必需的信息：注册时的昵称、邮箱，以及登录会话。\n\n阅读进度默认保存在你自己的浏览器里；登录后才会同步到服务器，方便换设备接着读。\n\n没有第三方统计脚本，没有广告，也不会把数据卖给任何人。',
  // SEO
  'seo.title': '书架 · 好好排字，慢慢读书',
  'seo.description': '一个按 Anyway.FM 风格排版的在线阅读站。',
  // 页脚（{books} {chapters} {words} / {readChapters} {readWords} 会被替换）
  'footer.note': '据不完全统计，本站已收录 {books} 本书、{chapters} 章、共 {words} 字。',
  'footer.read': '你已读完 {readChapters} 章、共 {readWords} 字——不多，但总比昨天多。',
  // 阅读器默认值（读者本地的 localStorage 会覆盖）
  'reader.size': '20',
  'reader.leading': '1.9',
  'reader.theme': 'light',
  // 开关
  'registration.open': '1',
  'discussion.enabled': '1',
  'discussion.mode': 'review', // review | auto
  // 访问控制：open | password | closed
  'access.mode': 'open',
  'access.password': '', // PBKDF2 哈希与盐，格式 hash:salt
  'access.passwordNote':
    '这个书架暂时只对朋友开放。如果你有访问口令，请在下面输入。\n\n没有的话，可以过一阵再来看看。',
  'access.closedNote': '书架正在整理，过一阵子再来。\n\n谢谢你还记得这里。',
  // 发信（忘记密码的重置邮件）
  'mail.enabled': '0',
  'mail.host': '',
  'mail.port': '465',
  'mail.secure': 'tls', // tls（465）| starttls（587）
  'mail.user': '',
  'mail.pass': '',
  'mail.from': '',
  'mail.fromName': '书架',
  'mail.resetTtl': '60', // 重置链接有效分钟数
  // 公告
  'announcement.text': '',
  'announcement.url': '',
  // 友情链接：JSON 数组 [{ name, url }]
  'links.friends': '[]',
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type Settings = Record<SettingKey, string>;

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

/**
 * 同一 Worker 实例内复用设置，避免每个请求都查一次表。
 * 不按 db 对象做 key：一个 Worker 只有一个 DB，绑定对象却可能每请求重建。
 */
let cache: { at: number; data: Settings } | null = null;
const CACHE_TTL = 30_000;

export async function getSettings(db: D1Database): Promise<Settings> {
  const hit = cache;
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;
  const data = await loadSettings(db);
  cache = { at: Date.now(), data };
  return data;
}

async function loadSettings(db: D1Database): Promise<Settings> {
  const out = { ...SETTING_DEFAULTS } as Settings;
  try {
    const { results } = await db
      .prepare('SELECT key, value FROM settings')
      .all<{ key: string; value: string }>();
    for (const row of results) {
      if (row.key in out) out[row.key as SettingKey] = row.value;
    }
  } catch {
    // 还没跑 0003 迁移时退回默认值，站点照常可用
  }
  return out;
}

export async function saveSettings(db: D1Database, patch: Partial<Settings>) {
  const now = Math.floor(Date.now() / 1000);
  const statements = Object.entries(patch)
    .filter(([key]) => key in SETTING_DEFAULTS)
    .map(([key, value]) =>
      db
        .prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .bind(key, String(value ?? ''), now),
    );
  if (statements.length) await db.batch(statements);
  cache = null;
}

export function isOn(settings: Settings, key: SettingKey) {
  return settings[key] === '1';
}

/** 原样读出保存的友链，供后台编辑回填 */
function readFriendLinks(settings: Settings): FriendLink[] {
  const raw = settings['links.friends'];
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && typeof item.name === 'string' && typeof item.url === 'string')
      .map((item) => ({ name: String(item.name), url: String(item.url) }))
      .filter((item) => item.name && item.url);
  } catch {
    return [];
  }
}

/** 前台渲染用：名称允许写 Markdown，显示时去掉标记 */
export function friendLinks(settings: Settings): FriendLink[] {
  return readFriendLinks(settings)
    .map((item) => ({ name: stripInline(item.name), url: item.url }))
    .filter((item) => item.name && item.url);
}

/** 后台编辑用：一行一条「名称 | 链接」 */
export function friendLinksText(settings: Settings) {
  return readFriendLinks(settings)
    .map((item) => `${item.name} | ${item.url}`)
    .join('\n');
}

export function parseFriendLinks(text: string): string {
  const list: FriendLink[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [name, ...rest] = trimmed.split('|');
    const url = rest.join('|').trim();
    if (!name.trim() || !url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    list.push({ name: name.trim(), url });
  }
  return JSON.stringify(list);
}

export function readerDefaults(settings: Settings) {
  const size = Number(settings['reader.size']);
  const leading = Number(settings['reader.leading']);
  // 早期版本存的是 dark，统一返回前台使用的 night
  const theme = ['night', 'dark'].includes(settings['reader.theme']) ? 'night' : 'light';
  return {
    size: [18, 20, 22].includes(size) ? size : 20,
    leading: Number.isFinite(leading) ? leading : 1.9,
    theme,
  };
}
