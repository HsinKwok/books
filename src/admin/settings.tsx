import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { hashPassword, startSession, verifyPassword } from '../auth';
import { deleteUserSessions, findUserByEmail, logAudit, updateUserPassword } from '../db';
import { SettingsPage, SettingsTabPanel } from '../pages/admin/settings';
import { findSettingsTab, settingsTab } from '../pages/admin/settings/schema';
import {
  getSettings,
  parseFriendLinks,
  saveSettings,
  type Settings,
} from '../settings';
import { adminTheme, adminUser, html, notice } from './shared';
import { formString } from '../forms';
import { splitSecret } from '../access';
import { mailReady, sendMail } from '../mail';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/** 按当前 tab 收字段：文本原样、开关转 0/1、密码留空不改、友链先解析 */
function readTabFields(tab: string, form: FormData): Partial<Settings> {
  const def = findSettingsTab(settingsTab(tab));
  const patch: Partial<Settings> = {};

  for (const key of def.fields) patch[key] = formString(form, key);
  for (const key of def.toggles ?? []) patch[key] = form.get(key) ? '1' : '0';
  for (const key of def.lists ?? []) patch[key] = parseFriendLinks(String(form.get(key) ?? ''));
  for (const key of def.secrets ?? []) {
    const value = String(form.get(key) ?? '');
    if (value) patch[key] = value;
  }
  return patch;
}

app.get('/settings', async (c) => {
  const tab = settingsTab(c.req.query('tab'));
  const settings = await getSettings(c.env.DB);
  return html(
    c,
    <SettingsPage
      user={adminUser(c)}
      settings={settings}
      tab={tab}
      notice={notice(c)}
      theme={await adminTheme(c)}
    />,
  );
});

/** 切换标签页时只取当前面板，避免整页重载 */
app.get('/api/settings/panel', async (c) => {
  const tab = settingsTab(c.req.query('tab'));
  const settings = await getSettings(c.env.DB);
  return c.json(
    {
      html: String(<SettingsTabPanel tab={tab} settings={settings} email={adminUser(c).email} />),
      tab,
    },
    200,
    { 'cache-control': 'no-store' },
  );
});

app.post('/settings', async (c) => {
  const form = await c.req.formData();
  const tab = settingsTab(form.get('tab'));
  const back = (m?: string) => c.redirect(`/admin/settings?tab=${tab}${m ? `&m=${m}` : ''}`, 303);

  // 账号 tab 的密码表单走 /admin/password，这里只兜底
  if (tab === 'account') return back();

  const patch = readTabFields(tab, form);
  const stored = await getSettings(c.env.DB);

  if (tab === 'site') {
    if (!patch['site.name']) patch['site.name'] = '书架';
    if (!['18', '20', '22'].includes(patch['reader.size'] ?? '')) patch['reader.size'] = '20';
    if (!['1.7', '1.9', '2.1'].includes(patch['reader.leading'] ?? '')) patch['reader.leading'] = '1.9';
    patch['reader.theme'] = ['night', 'dark'].includes(patch['reader.theme'] ?? '') ? 'night' : 'light';
  }

  if (tab === 'talk') {
    patch['discussion.mode'] = patch['discussion.mode'] === 'auto' ? 'auto' : 'review';
    patch['discussion.enabled'] = patch['discussion.enabled'] === '0' ? '0' : '1';
    patch['registration.open'] = patch['registration.open'] === '0' ? '0' : '1';
  }

  if (tab === 'mail') {
    patch['mail.enabled'] = patch['mail.enabled'] === '1' ? '1' : '0';
    patch['mail.secure'] = patch['mail.secure'] === 'starttls' ? 'starttls' : 'tls';
    const mailPort = Number(patch['mail.port']);
    patch['mail.port'] = String(
      Number.isInteger(mailPort) && mailPort > 0 && mailPort < 65536
        ? mailPort
        : patch['mail.secure'] === 'starttls'
          ? 587
          : 465,
    );
    const ttl = Number(patch['mail.resetTtl']);
    patch['mail.resetTtl'] = String(
      Number.isFinite(ttl) ? Math.min(1440, Math.max(10, Math.trunc(ttl))) : 60,
    );
    // 本 tab 没有 site.name，发件人名称留空时回落到已存的站名
    patch['mail.fromName'] = patch['mail.fromName'] || stored['site.name'] || '书架';

    if (patch['mail.enabled'] === '1') {
      const hasPass = !!patch['mail.pass'] || !!stored['mail.pass'];
      if (!patch['mail.host'] || !patch['mail.user'] || !patch['mail.from'] || !hasPass) {
        patch['mail.enabled'] = '0';
        await saveSettings(c.env.DB, patch);
        return back('mail');
      }
    }
  }

  if (tab === 'access') {
    const mode = patch['access.mode'] ?? stored['access.mode'];
    patch['access.mode'] = ['open', 'password', 'closed'].includes(mode) ? mode : 'open';

    const gatePassword = String(form.get('access.password') ?? '');
    if (gatePassword) {
      if (gatePassword.length < 4) return back('gateShort');
      const secret = await hashPassword(gatePassword);
      patch['access.password'] = `${secret.hash}:${secret.salt}`;
    }

    if (
      patch['access.mode'] === 'password' &&
      !splitSecret(patch['access.password'] ?? stored['access.password'])
    ) {
      patch['access.mode'] = 'open';
      await saveSettings(c.env.DB, patch);
      return back('gatepw');
    }
  }

  await saveSettings(c.env.DB, patch);
  await logAudit(c.env.DB, adminUser(c).id, 'settings.save', `保存站点设置（${findSettingsTab(tab).label}）`);
  return back('saved');
});

app.post('/settings/mail-test', async (c) => {
  const user = adminUser(c);
  const settings = await getSettings(c.env.DB);
  const form = await c.req.formData();
  const to = formString(form, 'to').toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return c.redirect('/admin/settings?tab=mail&m=mailTo', 303);
  }
  if (!mailReady(settings)) return c.redirect('/admin/settings?tab=mail&m=mail', 303);

  try {
    await sendMail(settings, {
      to,
      subject: `测试邮件 · ${settings['site.name'] || '书架'}`,
      html: '<p>这是一封测试邮件，说明后台里的发信配置可以正常使用。</p>',
    });
    await logAudit(c.env.DB, user.id, 'settings.mailTest', `测试发信到 ${to}`);
    return c.redirect('/admin/settings?tab=mail&m=mailSent', 303);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await logAudit(c.env.DB, user.id, 'settings.mailTest', `测试发信失败：${detail}`);
    return c.redirect('/admin/settings?tab=mail&m=mailFail', 303);
  }
});

app.post('/password', async (c) => {
  const user = adminUser(c);
  const form = await c.req.formData();
  const oldPassword = String(form.get('old') ?? '');
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm') ?? '');
  const keepLogin = formString(form, 'keep') === '1';

  const row = await findUserByEmail(c.env.DB, user.email);
  if (!row || !(await verifyPassword(oldPassword, row.pass_hash, row.salt))) {
    return c.redirect('/admin/settings?tab=account&m=old', 303);
  }
  if (password !== confirm) return c.redirect('/admin/settings?tab=account&m=mismatch', 303);
  if (password.length < 8) return c.redirect('/admin/settings?tab=account&m=short', 303);

  const secret = await hashPassword(password);
  await updateUserPassword(c.env.DB, user.id, secret.hash, secret.salt);
  if (!keepLogin) {
    await deleteUserSessions(c.env.DB, user.id);
    await startSession(c, user.id);
  }
  await logAudit(c.env.DB, user.id, 'admin.password', '修改后台密码');
  return c.redirect('/admin/settings?tab=account&m=pw', 303);
});

export default app;
