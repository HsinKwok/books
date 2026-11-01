import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { hashPassword, startSession } from '../auth';
import { countOwners, createUser, findUserByEmail } from '../db';
import { requireCap, requireStaff } from '../permissions';
import { SetupPage } from '../pages/admin/setup';
import books from './books';
import categories from './categories';
import chapters from './chapters';
import dashboard from './dashboard';
import discussions from './discussions';
import importRoutes from './import';
import ops from './ops';
import { adminTheme, html } from './shared';
import { formString } from '../forms';
import settings from './settings';
import users from './users';

const admin = new Hono<{ Bindings: Env; Variables: Variables }>();

const guard = requireStaff();

admin.use('*', async (c, next) => {
  if (c.req.path === '/admin/setup') {
    if ((await countOwners(c.env.DB)) > 0) return c.notFound();
    return next();
  }
  return guard(c, next);
});

/* 站长专属 */
admin.use('/users', requireCap('user.manage'));
admin.use('/users/*', requireCap('user.manage'));
admin.use('/api/users', requireCap('user.manage'));
admin.use('/api/users/*', requireCap('user.manage'));
admin.use('/settings', requireCap('settings.site'));
admin.use('/settings/*', requireCap('settings.site'));
admin.use('/api/settings', requireCap('settings.site'));
admin.use('/api/settings/*', requireCap('settings.site'));
admin.use('/ops', requireCap('ops.view'));
admin.use('/ops/*', requireCap('ops.view'));

/* 编辑与站长 */
admin.use('/discussions', requireCap('discussion.review'));
admin.use('/discussions/*', requireCap('discussion.review'));
admin.use('/api/discussions', requireCap('discussion.review'));
admin.use('/api/discussions/*', requireCap('discussion.review'));
admin.use('/categories', requireCap('category.manage'));
admin.use('/categories/*', requireCap('category.manage'));
admin.use('/api/categories', requireCap('category.manage'));
admin.use('/api/categories/*', requireCap('category.manage'));

admin.route('/', dashboard);
admin.route('/', books);
admin.route('/', chapters);
admin.route('/', importRoutes);
admin.route('/', discussions);
admin.route('/', users);
admin.route('/', categories);
admin.route('/', ops);
admin.route('/', settings);

/* ---------- 首次初始化 ---------- */

admin.get('/setup', async (c) => html(c, <SetupPage theme={await adminTheme(c)} />));

admin.post('/setup', async (c) => {
  if ((await countOwners(c.env.DB)) > 0) return c.notFound();

  const form = await c.req.formData();
  const name = formString(form, 'name');
  const email = formString(form, 'email').toLowerCase();
  const password = String(form.get('password') ?? '');

  if (!name || !email || !password) {
    c.status(400);
    return html(c, <SetupPage error="昵称、邮箱和密码都要填。" values={{ name, email }} theme={await adminTheme(c)} />);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    c.status(400);
    return html(c, <SetupPage error="邮箱格式不对。" values={{ name, email }} theme={await adminTheme(c)} />);
  }
  if (password.length < 8) {
    c.status(400);
    return html(c, <SetupPage error="密码至少 8 位。" values={{ name, email }} theme={await adminTheme(c)} />);
  }
  if (await findUserByEmail(c.env.DB, email)) {
    c.status(400);
    return html(c, <SetupPage error="这个邮箱已经注册过了。" values={{ name, email }} theme={await adminTheme(c)} />);
  }

  const secret = await hashPassword(password);
  const id = await createUser(c.env.DB, {
    email,
    name,
    role: 'owner',
    passHash: secret.hash,
    salt: secret.salt,
  });
  await startSession(c, id);
  return c.redirect('/admin', 303);
});

export default admin;
