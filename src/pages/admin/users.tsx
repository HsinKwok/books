import type { User } from '../../db';
import { isoDate } from '../../db';
import type { SessionUser } from '../../env';
import { ROLE_LABELS, ROLES } from '../../permissions';
import { AdminHead, AdminLayout, BulkBar } from './layout';

export function UsersPage({
  user,
  users,
  notice,
  theme,
  q = '',
}: {
  user: SessionUser;
  users: User[];
  notice?: string;
  theme?: string;
  /** 当前搜索词 */
  q?: string;
}) {
  return (
    <AdminLayout title="读者 · 后台" active="users" user={user} notice={notice} theme={theme}>
      <AdminHead
        kicker="Readers"
        title="读者与权限"
        note="站长 / 编辑 / 作者 / 读者，四种角色能力依次收窄。改角色会立即销毁该账号的登录会话；至少要保留一位站长，也不能修改或封禁自己。批量封禁会自动跳过站长，站长如需封禁请在行内单独操作。"
      />

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>全部账号</h2>
          <span class="admin-panel-count">{users.length}</span>
        </div>

        {/* 没有 JS 时表单照常提交，有 JS 时只换成下面的表格 */}
        <form class="admin-filter" id="users-filter" method="get" action="/admin/users">
          <input
            name="q"
            type="search"
            value={q}
            maxlength={40}
            placeholder="昵称 / 邮箱"
            aria-label="搜索读者"
          />
          <button class="admin-mini" type="submit">
            筛选
          </button>
          {q ? (
            <a class="admin-mini" href="/admin/users">
              清空
            </a>
          ) : null}
        </form>

        <div id="users-table">
          <UsersPanel users={users} meId={user.id} q={q} />
        </div>
      </section>
    </AdminLayout>
  );
}

/** 账号表格 + 空态：整页渲染与 ajax 筛选共用 */
export function UsersPanel({ users, meId, q = '' }: { users: User[]; meId: number; q?: string }) {
  if (!users.length) {
    return <p class="admin-empty">{q ? '没有匹配的账号。' : '还没有注册的读者。'}</p>;
  }

  return (
    <>
      {/* 批量条：勾选后统一封禁 / 解封，自己不可选 */}
      <BulkBar
        unit="个账号"
        actions={[
          { key: 'ban', label: '封禁', danger: true },
          { key: 'unban', label: '解封' },
        ]}
      />

      <table class="admin-table">
        <thead>
          <tr>
            <th class="admin-check-cell" aria-label="选择" />
            <th>昵称</th>
            <th>邮箱</th>
            <th>角色</th>
            <th>状态</th>
            <th>注册</th>
            <th>最近登录</th>
            <th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {users.map((item) => {
            const self = item.id === meId;
            return (
              <tr>
                <td class="admin-check-cell">
                  <input
                    class="admin-check-item"
                    type="checkbox"
                    value={String(item.id)}
                    data-bulk-item
                    disabled={self}
                    aria-label={`选择 ${item.name}`}
                  />
                </td>
                <td class="admin-cell-title">
                  {item.name}
                  {self ? <span class="admin-cell-sub">（你）</span> : null}
                </td>
                <td>{item.email}</td>
                <td>
                  {self ? (
                    <span>{ROLE_LABELS[item.role]}</span>
                  ) : (
                    <form
                      class="admin-role-form"
                      method="post"
                      action={`/admin/users/${item.id}/role`}
                      data-name={item.name}
                    >
                      <select name="role" data-initial={item.role} aria-label={`${item.name} 的角色`}>
                        {ROLES.map((role) => (
                          <option value={role} selected={item.role === role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                      <button class="admin-mini" type="submit">
                        保存
                      </button>
                    </form>
                  )}
                </td>
                <td>
                  <span class={item.status === 'active' ? 'badge badge-published' : 'badge badge-spam'}>
                    {item.status === 'active' ? '正常' : '已封禁'}
                  </span>
                </td>
                <td class="admin-cell-sub">{isoDate(item.createdAt)}</td>
                <td class="admin-cell-sub">{item.lastLoginAt ? isoDate(item.lastLoginAt) : '—'}</td>
                <td class="admin-row-actions">
                  {self ? (
                    <span class="admin-cell-sub">—</span>
                  ) : (
                    <form
                      method="post"
                      action={`/admin/users/${item.id}/status`}
                      data-confirm={item.status === 'active' ? '封禁后对方会立即退出登录，确定？' : undefined}
                    >
                      <input type="hidden" name="status" value={item.status === 'active' ? 'banned' : 'active'} />
                      <button
                        class={item.status === 'active' ? 'admin-mini admin-danger' : 'admin-mini'}
                        type="submit"
                      >
                        {item.status === 'active' ? '封禁' : '解封'}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
