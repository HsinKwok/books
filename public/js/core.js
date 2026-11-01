export const root = document.documentElement;

export const $ = (sel, el = document) => el.querySelector(sel);

export const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

/** 书架相关的本地键：登录后按用户隔离，游客放会话存储（关掉标签页即清空） */
const SHELF_KEYS = new Set([
  'read.shelf',
  'read.shelves',
  'read.done',
  'read.progress',
  'read.shelfGroup',
]);

const uid = (document.body && document.body.dataset.uid) || '';

const bucket = (key) => (SHELF_KEYS.has(key) && !uid ? sessionStorage : localStorage);
const nsKey = (key) => (SHELF_KEYS.has(key) && uid ? `u${uid}:${key}` : key);

export const readText = (key, fallback = '') => {
  try {
    const raw = bucket(key).getItem(nsKey(key));
    return raw == null ? fallback : raw;
  } catch {
    return fallback;
  }
};

export const writeText = (key, value) => {
  try {
    bucket(key).setItem(nsKey(key), String(value));
  } catch {}
};

export const readJSON = (key, fallback) => {
  const raw = readText(key, null);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

export const writeJSON = (key, value) => writeText(key, JSON.stringify(value));

/** 旧版书架直接写在 localStorage 的裸键里：先挪进本次会话，再按新规则处理 */
function migrateLegacyShelf() {
  for (const key of SHELF_KEYS) {
    let raw = null;
    try {
      raw = localStorage.getItem(key);
      if (raw == null) continue;
      localStorage.removeItem(key);
    } catch {
      continue;
    }
    try {
      if (sessionStorage.getItem(key) == null) sessionStorage.setItem(key, raw);
    } catch {}
  }
}

/** 注册 / 登录后，把这次浏览里攒下的游客书架并进当前账号，并清空游客数据 */
function adoptGuestShelf() {
  if (!uid) return;

  const take = (key) => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw == null) return null;
      sessionStorage.removeItem(key);
      return raw;
    } catch {
      return null;
    }
  };

  const merge = (key, idOf) => {
    const raw = take(key);
    if (raw == null) return;
    let guest;
    try {
      guest = JSON.parse(raw);
    } catch {
      return;
    }
    if (!Array.isArray(guest) || !guest.length) return;

    const mine = readJSON(key, []);
    const list = Array.isArray(mine) ? mine : [];
    const seen = new Set(list.map(idOf));
    const extra = guest.filter((item) => item != null && !seen.has(idOf(item)));
    if (extra.length) writeJSON(key, list.concat(extra));
  };

  merge('read.shelf', (b) => b && b.slug);
  merge('read.shelves', (g) => g && g.id);
  merge('read.done', (k) => k);

  // 进度只保留一份：账号里已有就沿用，没有才接手游客的
  const progress = take('read.progress');
  if (progress != null && readJSON('read.progress', null) == null) {
    try {
      writeJSON('read.progress', JSON.parse(progress));
    } catch {}
  }

  const group = take('read.shelfGroup');
  if (group != null && readText('read.shelfGroup') === '') writeText('read.shelfGroup', group);
}

migrateLegacyShelf();
adoptGuestShelf();

/** 千分位数字，全站统一 */
export const fmtNum = (value) => Number(value || 0).toLocaleString('en-US');

/** 简单防抖：合并短时间内的连续触发 */
export const debounce = (fn, wait = 200) => {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};

/** fetch 薄封装：自动带 cookie，非 2xx 抛错并带回服务端提示 */
export async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error((data && data.error) || `请求失败（${response.status}）`);
  }
  return data;
}

export const mk = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};
