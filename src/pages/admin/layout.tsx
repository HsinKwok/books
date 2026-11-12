import type { Child } from 'hono/jsx';
import type { SessionUser } from '../../env';
import { can, type Cap } from '../../permissions';
import { themeScript } from '../../theme';
import { asset } from '../../assets.generated';

export type AdminNav = 'dashboard' | 'books' | 'discussions' | 'users' | 'categories' | 'settings' | 'ops';

const NAV: { key: AdminNav; href: string; num: string; label: string; cap: Cap }[] = [
  { key: 'dashboard', href: '/admin', num: '01', label: '概览', cap: 'admin.access' },
  { key: 'books', href: '/admin/books', num: '02', label: '书籍', cap: 'book.create' },
  { key: 'discussions', href: '/admin/discussions', num: '03', label: '讨论', cap: 'discussion.review' },
  { key: 'users', href: '/admin/users', num: '04', label: '读者', cap: 'user.manage' },
  { key: 'categories', href: '/admin/categories', num: '05', label: '分类', cap: 'category.manage' },
  { key: 'settings', href: '/admin/settings', num: '06', label: '设置', cap: 'settings.site' },
  { key: 'ops', href: '/admin/ops', num: '07', label: '运维', cap: 'ops.view' },
];

const CRUMB: Record<AdminNav, string> = {
  dashboard: '概览',
  books: '书籍',
  discussions: '讨论',
  users: '读者',
  categories: '分类',
  settings: '设置',
  ops: '运维',
};

export function AdminLayout({
  title,
  active,
  sub,
  user,
  notice,
  theme = 'light',
  children,
}: {
  title: string;
  active: AdminNav;
  sub?: 'list' | 'new';
  user: SessionUser;
  notice?: string;
  theme?: string;
  children: Child;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta name="color-scheme" content="light dark" />
        <link rel="stylesheet" href={asset('/css/base.css')} />
        <link rel="stylesheet" href={asset('/css/admin.css')} />
        <script dangerouslySetInnerHTML={{ __html: themeScript(theme) }} />
      </head>
      <body class="admin-body" data-user="1">
        <header class="admin-bar">
          <button class="admin-menu-btn" id="admin-menu" type="button" aria-controls="admin-side" aria-expanded="false">
            菜单
          </button>
          <a class="admin-bar-brand" href="/admin">
            书架<sup>*</sup>
            <span>后台</span>
          </a>
          <span class="admin-bar-crumb">{CRUMB[active]}</span>
          <div class="admin-bar-side">
            <a href="/" target="_blank" rel="noreferrer">
              查看前台
            </a>
            <span class="admin-bar-user">{user.name}</span>
            <a href="/logout">退出</a>
          </div>
        </header>

        <div class="admin-shell">
          <aside class="admin-side" id="admin-side">
            <nav class="admin-menu">
              <p class="admin-menu-label">内容</p>
              {NAV.filter((item) => can(user, item.cap)).map((item) => (
                <div class={active === item.key ? 'admin-menu-group is-open' : 'admin-menu-group'}>
                  {item.key === 'settings' ? <p class="admin-menu-label">站点</p> : null}
                  <a class={active === item.key ? 'admin-menu-item is-active' : 'admin-menu-item'} href={item.href}>
                    <i>{item.num}</i>
                    {item.label}
                  </a>
                  {item.key === 'books' && active === 'books' ? (
                    <div class="admin-sub">
                      <a class={sub === 'list' ? 'is-current' : undefined} href="/admin/books">
                        全部书籍
                      </a>
                      <a class={sub === 'new' ? 'is-current' : undefined} href="/admin/books/new">
                        新建书籍
                      </a>
                    </div>
                  ) : null}
                </div>
              ))}
            </nav>
            <p class="admin-side-foot">
              Anyway 后台
              <br />
              Cloudflare Workers · D1
            </p>
          </aside>

          <main class="admin-content" id="admin-content">
            <div class="admin-main">
              {notice ? <p class="admin-notice">{notice}</p> : null}
              {children}
            </div>
          </main>
        </div>

        <script type="module" src={asset('/js/admin.js')} />
      </body>
    </html>
  );
}

export function AdminHead({
  kicker,
  title,
  note,
  action,
}: {
  kicker: string;
  title: string;
  note?: Child;
  action?: Child;
}) {
  return (
    <header class="admin-page-head">
      <div class="admin-page-heading">
        <p class="kicker">{kicker}</p>
        <h1 class="admin-title">{title}</h1>
        {note ? <p class="admin-page-note">{note}</p> : null}
      </div>
      {action ? <div class="admin-page-action">{action}</div> : null}
    </header>
  );
}

export function Badge({ status }: { status: string }) {
  const label = status === 'published' ? '已发布' : status === 'draft' ? '草稿' : status;
  return <span class={`badge badge-${status}`}>{label}</span>;
}

/** 批量操作条：全选 + 已选计数 + 操作按钮，脚本按 data-bulk-* 接管 */
export function BulkBar({
  unit,
  actions,
}: {
  /** 已选数量的量词，例如「本」「章」 */
  unit: string;
  actions: { key: string; label: string; danger?: boolean }[];
}) {
  return (
    <div class="admin-bulk">
      <label class="admin-check">
        <input type="checkbox" data-bulk-all />
        <span>全选本页</span>
      </label>
      <span class="admin-bulk-count" data-bulk-count>
        已选 0 {unit}
      </span>
      <span class="admin-bulk-actions">
        {actions.map((item) => (
          <button
            class={item.danger ? 'admin-mini admin-danger' : 'admin-mini'}
            type="button"
            data-bulk-action={item.key}
            disabled
          >
            {item.label}
          </button>
        ))}
      </span>
    </div>
  );
}
