import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppContext, Env, SessionUser, Variables } from './env';
import { createSession, deleteSession, findSessionUser } from './db';

const COOKIE = 'read_session';
const MAX_AGE = 30 * 86400; // 30 天
const ITERATIONS = 100_000;

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomToken(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 重置令牌只存哈希：库被看到也拿不到可用链接 */
export async function sha256Hex(text: string) {
  const bits = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return { hash: bytesToBase64(hash), salt: bytesToBase64(salt) };
}

export async function verifyPassword(password: string, hash: string, salt: string) {
  const derived = await derive(password, base64ToBytes(salt));
  return bytesToBase64(derived) === hash;
}

function isSecure(c: Context) {
  return new URL(c.req.url).protocol === 'https:';
}

export async function startSession(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  userId: number,
) {
  const token = randomToken();
  const expiresAt = Math.floor(Date.now() / 1000) + MAX_AGE;
  await createSession(c.env.DB, token, userId, expiresAt);
  setCookie(c, COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecure(c),
    maxAge: MAX_AGE,
  });
}

export async function endSession(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const token = getCookie(c, COOKIE);
  if (token) await deleteSession(c.env.DB, token);
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function loadUser(c: Context<{ Bindings: Env; Variables: Variables }>): Promise<SessionUser | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  return findSessionUser(c.env.DB, token);
}

/** 只允许站内跳转，避免开放重定向 */
export function safeNext(value: string | undefined, fallback = '/') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

export function currentPath(c: AppContext) {
  const url = new URL(c.req.url);
  return url.pathname + url.search;
}

/** 会话用户注入 c.get('user') */
export async function sessionMiddleware(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: () => Promise<void>,
) {
  c.set('user', await loadUser(c));
  await next();
}

export function requireUser() {
  return async (
    c: Context<{ Bindings: Env; Variables: Variables }>,
    next: () => Promise<void>,
  ) => {
    if (!c.get('user')) {
      const next_ = encodeURIComponent(currentPath(c as AppContext));
      return c.redirect(`/login?next=${next_}`);
    }
    await next();
  };
}
