import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Env, Variables } from './env';
import { getSettings, readerDefaults } from './settings';
import { GatePage } from './pages/gate';

export const ACCESS_COOKIE = 'read_access';

/** 后台、登录注册、口令页和静态资源不受访问限制 */
const SKIP: RegExp[] = [
  /^\/admin(?:$|\/)/,
  /^\/gate(?:$|\/)/,
  /^\/login$/,
  /^\/register$/,
  /^\/logout$/,
  /^\/css\//,
  /^\/js\//,
  /^\/fonts\//,
  /^\/favicon/,
  /^\/cover\//,
];

export function splitSecret(secret: string) {
  const at = secret.indexOf(':');
  if (at < 1) return null;
  return { hash: secret.slice(0, at), salt: secret.slice(at + 1) };
}

/** 口令 cookie 的值：由口令哈希派生，避免 cookie 直接等于库里的哈希 */
export async function accessToken(secret: string) {
  const data = new TextEncoder().encode(`access|${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const accessGate: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next,
) => {
  const path = c.req.path;
  if (SKIP.some((re) => re.test(path))) return next();

  const settings = await getSettings(c.env.DB);
  const mode = settings['access.mode'];

  if (mode === 'closed') {
    return c.html(
      String(
        <GatePage
          mode="closed"
          siteName={settings['site.name']}
          mark={settings['site.mark']}
          note={settings['access.closedNote']}
          theme={readerDefaults(settings).theme}
        />,
      ),
      503,
    );
  }

  if (mode !== 'password') return next();
  if (!splitSecret(settings['access.password'])) {
    // 开了口令模式却没设口令，按关闭处理，避免直接裸奔
    return c.html(
      String(
        <GatePage
          mode="closed"
          siteName={settings['site.name']}
          mark={settings['site.mark']}
          note={settings['access.closedNote']}
          theme={readerDefaults(settings).theme}
        />,
      ),
      503,
    );
  }

  const token = await accessToken(settings['access.password']);
  if (getCookie(c, ACCESS_COOKIE) === token) return next();

  const url = new URL(c.req.url);
  const nextPath = url.pathname + url.search;

  return c.html(
    String(
      <GatePage
        mode="password"
        siteName={settings['site.name']}
        mark={settings['site.mark']}
        note={settings['access.passwordNote']}
        theme={readerDefaults(settings).theme}
        next={nextPath}
      />,
    ),
  );
};
