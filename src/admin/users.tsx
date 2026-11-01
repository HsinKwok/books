import { Hono } from 'hono';
import type { AppContext, Env, Role, Variables } from '../env';
import {
  countOwners,
  deleteUserSessions,
  getUserById,
  listOwnerIds,
  listUsers,
  logAudit,
  setUsersStatus,
  updateUserRole,
  updateUserStatus,
} from '../db';
import { ROLE_LABELS, ROLES } from '../permissions';
import { UsersPage, UsersPanel } from '../pages/admin/users';
import { formString } from '../forms';
import { adminTheme, adminUser, html, notice } from './shared';
import { readBatch } from './guard';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/** 读者列表的公共查询：整页渲染和 ajax 筛选共用 */
async function loadUsers(c: AppContext) {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  const users = await listUsers(c.env.DB, q);
  return { q, users };
}

app.get('/users', async (c) => {
  const { q, users } = await loadUsers(c);
  return html(
    c,
    <UsersPage user={adminUser(c)} users={users} q={q} notice={notice(c)} theme={await adminTheme(c)} />,
  );
});

/** 按昵称 / 邮箱筛选：只回表格那一块，前端原地替换 */
app.get('/api/users', async (c) => {
  const { q, users } = await loadUsers(c);
  return c.json(
    { html: String(<UsersPanel users={users} meId={adminUser(c).id} q={q} />), count: users.length },
    200,
    { 'cache-control': 'no-store' },
  );
});

/** 批量封禁 / 解封：勾选后一次提交，自己永远跳过 */
app.post('/api/users/batch', async (c) => {
  const guard = await readBatch(c);
  if (guard instanceof Response) return guard;
  const { body, ids: rawIds } = guard;

  const action = String(body.action ?? '');
  if (action !== 'ban' && action !== 'unban') {
    return c.json({ ok: false, error: 'bad-action' }, 400);
  }

  const me = adminUser(c);
  let ids = rawIds.filter((id) => id !== me.id);
  if (!ids.length) return c.json({ ok: true, count: 0, skipped: 0 });

  // 批量封禁跳过站长：防止「全选本页」误把站长封光；确需封禁站长请走行内单条入口
  let skipped = 0;
  if (action === 'ban') {
    const owners = new Set(await listOwnerIds(c.env.DB));
    const before = ids.length;
    ids = ids.filter((id) => !owners.has(id));
    skipped = before - ids.length;
    if (!ids.length) return c.json({ ok: true, count: 0, skipped });
  }

  const status = action === 'ban' ? 'banned' : 'active';
  await setUsersStatus(c.env.DB, ids, status);

  const sample = `#${ids.slice(0, 20).join(',')}${ids.length > 20 ? '…' : ''}`;
  await logAudit(
    c.env.DB,
    me.id,
    `user.batch.${action}`,
    `批量${action === 'ban' ? '封禁' : '解封'} ${ids.length} 个账号：${sample}`,
  );
  return c.json({ ok: true, count: ids.length, skipped });
});

app.post('/users/:id/role', async (c) => {
  const id = Number(c.req.param('id'));
  const me = adminUser(c);
  if (!Number.isInteger(id) || id === me.id) return c.redirect('/admin/users?m=self', 303);

  const form = await c.req.formData();
  const role = formString(form, 'role') as Role;
  if (!ROLES.includes(role)) return c.redirect('/admin/users?m=updated', 303);

  const target = await getUserById(c.env.DB, id);
  if (!target || target.role === role) return c.redirect('/admin/users?m=updated', 303);

  if (target.role === 'owner' && (await countOwners(c.env.DB)) <= 1) {
    return c.redirect('/admin/users?m=lastOwner', 303);
  }

  await updateUserRole(c.env.DB, id, role);
  await deleteUserSessions(c.env.DB, id);
  await logAudit(
    c.env.DB,
    me.id,
    'role.change',
    `${target.email}: ${ROLE_LABELS[target.role]} → ${ROLE_LABELS[role]}`,
  );
  return c.redirect('/admin/users?m=updated', 303);
});

app.post('/users/:id/status', async (c) => {
  const id = Number(c.req.param('id'));
  const me = adminUser(c);
  if (!Number.isInteger(id) || id === me.id) return c.redirect('/admin/users?m=self', 303);

  const form = await c.req.formData();
  const status = formString(form, 'status') === 'banned' ? 'banned' : 'active';
  await updateUserStatus(c.env.DB, id, status);
  await logAudit(c.env.DB, me.id, status === 'banned' ? 'user.ban' : 'user.unban', `#${id}`);
  return c.redirect('/admin/users?m=updated', 303);
});

export default app;
