import { Hono } from 'hono';
import { LoginPage, RegisterPage, ForgotPage, ResetPage } from '../pages/auth';
import type { AppContext, Env, Variables } from '../env';
import { getSettings, isOn, type Settings } from '../settings';
import {
  clearPasswordResets,
  countRecentResets,
  createPasswordReset,
  createUser,
  deleteUserSessions,
  findPasswordReset,
  findUserByEmail,
  logAudit,
  touchLogin,
  updateUserPassword,
  usePasswordReset,
} from '../db';
import {
  endSession,
  hashPassword,
  randomToken,
  safeNext,
  sha256Hex,
  startSession,
  verifyPassword,
} from '../auth';
import { mailReady, resetMail, sendMail } from '../mail';
import { render, shell } from '../render';
import { formString } from '../forms';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get('/login', async (c) => {
  const next = safeNext(c.req.query('next'));
  if (c.get('user')) return c.redirect(next, 303);
  const data = await shell(c);
  return render(
    c,
    { title: '登录 · 书架', active: 'login' },
    <LoginPage next={next} registrationOpen={isOn(data.settings, 'registration.open')} />,
    data,
  );
});

app.post('/login', async (c) => {
  const form = await c.req.formData();
  const email = formString(form, 'email').toLowerCase();
  const password = String(form.get('password') ?? '');
  const next = safeNext(formString(form, 'next'));
  const registrationOpen = isOn(await getSettings(c.env.DB), 'registration.open');

  const fail = async (message: string) => {
    c.status(400);
    return render(
      c,
      { title: '登录 · 书架', active: 'login' },
      <LoginPage next={next} error={message} registrationOpen={registrationOpen} />,
    );
  };

  if (!email || !password) return fail('邮箱和密码都要填。');

  const row = await findUserByEmail(c.env.DB, email);
  if (!row) return fail('邮箱或密码不对。');
  if (!(await verifyPassword(password, row.pass_hash, row.salt))) return fail('邮箱或密码不对。');
  if (row.status !== 'active') return fail('这个账号已被封禁，请联系管理员。');

  await startSession(c, row.id);
  await touchLogin(c.env.DB, row.id);
  return c.redirect(next, 303);
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 重置链接的有效期（分钟），限制在 10–1440 之间 */
function resetMinutes(settings: Settings) {
  const value = Number(settings['mail.resetTtl']);
  if (!Number.isFinite(value)) return 60;
  return Math.min(1440, Math.max(10, Math.trunc(value)));
}

/** 按令牌读出一条仍可用的重置记录 */
async function liveReset(c: AppContext, token: string) {
  if (!token) return null;
  const row = await findPasswordReset(c.env.DB, await sha256Hex(token));
  if (!row || row.used_at || row.expires_at <= Math.floor(Date.now() / 1000)) return null;
  return row;
}

app.get('/forgot', async (c) => {
  if (c.get('user')) return c.redirect('/', 303);
  const settings = await getSettings(c.env.DB);
  return render(
    c,
    { title: '找回密码 · 书架', active: 'login' },
    <ForgotPage ready={mailReady(settings)} minutes={resetMinutes(settings)} />,
  );
});

app.post('/forgot', async (c) => {
  const form = await c.req.formData();
  const email = formString(form, 'email').toLowerCase();
  const settings = await getSettings(c.env.DB);
  const ready = mailReady(settings);
  const minutes = resetMinutes(settings);

  const page = (props: { email?: string; error?: string; sent?: boolean }) =>
    render(
      c,
      { title: '找回密码 · 书架', active: 'login' },
      <ForgotPage ready={ready} minutes={minutes} {...props} />,
    );

  if (!EMAIL_RE.test(email)) {
    c.status(400);
    return page({ email, error: '邮箱格式不对。' });
  }
  if (!ready) {
    c.status(503);
    return page({ email, error: '站长还没有配置发信邮箱，暂时无法自助重置，请联系站长。' });
  }

  const now = Math.floor(Date.now() / 1000);
  const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? '';
  const ipCount = ip ? await countRecentResets(c.env.DB, 'request_ip', ip, now - 3600) : 0;
  if (ipCount >= 5) {
    c.status(429);
    return page({ email, error: '请求太频繁了，请过一阵再试。' });
  }

  const row = await findUserByEmail(c.env.DB, email);
  // 同一邮箱 10 分钟内只发一封；不管有没有发出，都给出同样的提示，避免被用来试探邮箱
  if (row && row.status === 'active' && (await countRecentResets(c.env.DB, 'user_id', row.id, now - 600)) === 0) {
    const token = randomToken();
    await createPasswordReset(c.env.DB, {
      userId: row.id,
      tokenHash: await sha256Hex(token),
      expiresAt: now + minutes * 60,
      requestIp: ip || null,
    });

    const link = new URL(`/reset?token=${token}`, c.req.url).href;
    const message = resetMail(settings['site.name'] || '书架', link, minutes);
    // 发信可能慢，先回页面；失败时把链接写进审计日志，站长可以手动转交
    c.executionCtx.waitUntil(
      sendMail(settings, { to: row.email, ...message })
        .then(() => logAudit(c.env.DB, row.id, 'password.reset.send', `已发送重置邮件到 ${row.email}`))
        .catch((err: unknown) =>
          logAudit(
            c.env.DB,
            row.id,
            'password.reset.fail',
            `重置邮件发送失败：${err instanceof Error ? err.message : String(err)}；链接：${link}`,
          ),
        ),
    );
  }

  return page({ sent: true });
});

app.get('/reset', async (c) => {
  const token = c.req.query('token') ?? '';
  const row = await liveReset(c, token);
  if (!row) {
    c.status(400);
    return render(
      c,
      { title: '重置密码 · 书架', active: 'login' },
      <ResetPage error="这个链接无效或已经过期，请重新申请。" />,
    );
  }
  return render(
    c,
    { title: '重置密码 · 书架', active: 'login' },
    <ResetPage token={token} email={row.email} />,
  );
});

app.post('/reset', async (c) => {
  const form = await c.req.formData();
  const token = formString(form, 'token');
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');

  const row = await liveReset(c, token);
  if (!row) {
    c.status(400);
    return render(
      c,
      { title: '重置密码 · 书架', active: 'login' },
      <ResetPage error="这个链接无效或已经过期，请重新申请。" />,
    );
  }

  const fail = (message: string) => {
    c.status(400);
    return render(
      c,
      { title: '重置密码 · 书架', active: 'login' },
      <ResetPage token={token} email={row.email} error={message} />,
    );
  };

  if (row.status !== 'active') return fail('这个账号已被封禁，请联系管理员。');
  if (password.length < 8) return fail('新密码至少 8 位。');
  if (password !== confirm) return fail('两次输入的新密码不一致。');

  const secret = await hashPassword(password);
  await updateUserPassword(c.env.DB, row.user_id, secret.hash, secret.salt);
  await usePasswordReset(c.env.DB, row.id);
  await clearPasswordResets(c.env.DB, row.user_id);
  await deleteUserSessions(c.env.DB, row.user_id);
  await startSession(c, row.user_id);
  await touchLogin(c.env.DB, row.user_id);
  await logAudit(c.env.DB, row.user_id, 'password.reset', '通过邮件链接重置密码');
  return c.redirect('/', 303);
});

app.get('/register', async (c) => {
  if (c.get('user')) return c.redirect('/', 303);
  if (!isOn(await getSettings(c.env.DB), 'registration.open')) return c.notFound();
  return render(
    c,
    { title: '注册 · 书架', description: '注册读者账号，把书签带着走。', active: 'login' },
    <RegisterPage />,
  );
});

app.post('/register', async (c) => {
  if (!isOn(await getSettings(c.env.DB), 'registration.open')) return c.notFound();
  const form = await c.req.formData();
  const name = formString(form, 'name');
  const email = formString(form, 'email').toLowerCase();
  const password = String(form.get('password') ?? '');

  const fail = async (message: string) => {
    c.status(400);
    return render(
      c,
      { title: '注册 · 书架', active: 'login' },
      <RegisterPage error={message} />,
    );
  };

  if (!name || !email || !password) return fail('昵称、邮箱和密码都要填。');
  if (name.length > 20) return fail('昵称最多 20 个字。');
  if (!EMAIL_RE.test(email)) return fail('邮箱格式不对。');
  if (password.length < 6) return fail('密码至少 6 位。');
  if (await findUserByEmail(c.env.DB, email)) return fail('这个邮箱已经注册过了。');

  const secret = await hashPassword(password);
  const id = await createUser(c.env.DB, {
    email,
    name,
    role: 'reader',
    passHash: secret.hash,
    salt: secret.salt,
  });
  await startSession(c, id);
  return c.redirect('/', 303);
});

app.get('/logout', async (c) => {
  await endSession(c);
  return c.redirect('/', 303);
});

export default app;
