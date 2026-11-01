import type { AdminDiscussion } from '../../db';
import { dateLabel } from '../../db';
import type { SessionUser } from '../../env';
import { renderMarkdown } from '../../markdown';
import { AdminHead, AdminLayout, BulkBar } from './layout';

export function DiscussionsPage({
  user,
  items,
  status,
  counts,
  page = 1,
  pages = 1,
  notice,
  theme,
}: {
  user: SessionUser;
  items: AdminDiscussion[];
  status: 'pending' | 'approved' | 'spam';
  counts: Record<'pending' | 'approved' | 'spam', number>;
  page?: number;
  pages?: number;
  notice?: string;
  theme?: string;
}) {
  const tabs: { key: 'pending' | 'approved' | 'spam'; label: string }[] = [
    { key: 'pending', label: '待审' },
    { key: 'approved', label: '已通过' },
    { key: 'spam', label: '已屏蔽' },
  ];

  return (
    <AdminLayout title="讨论 · 后台" active="discussions" user={user} notice={notice} theme={theme}>
      <AdminHead
        kicker="Discussions"
        title="讨论审核"
        note="前台只显示「已通过」的讨论。屏蔽的内容不会删除，随时可以恢复。"
      />

      <div class="admin-tabs">
        {tabs.map((tab) => (
          <a
            class={tab.key === status ? 'admin-tab is-active' : 'admin-tab'}
            href={`/admin/discussions?status=${tab.key}`}
          >
            {tab.label}
            <em>{counts[tab.key]}</em>
          </a>
        ))}
      </div>

      <div id="discuss-panel">
        <DiscussionList items={items} status={status} page={page} pages={pages} />
      </div>
    </AdminLayout>
  );
}

/** 讨论列表 + 空态：整页渲染与 ajax 切换栏目共用 */
export function DiscussionList({
  items,
  status = 'pending',
  page = 1,
  pages = 1,
}: {
  items: AdminDiscussion[];
  status?: 'pending' | 'approved' | 'spam';
  page?: number;
  pages?: number;
}) {
  if (!items.length) return <p class="admin-empty">这一栏是空的。</p>;

  const href = (n: number) => `/admin/discussions?status=${status}&page=${n}`;

  return (
    <>
      {/* 批量条：勾选后一次处理，前端脚本负责提交和刷新 */}
      <BulkBar
        unit="条"
        actions={[
          { key: 'approved', label: '通过' },
          { key: 'pending', label: '转待审' },
          { key: 'spam', label: '屏蔽' },
          { key: 'delete', label: '删除', danger: true },
        ]}
      />

      <ul class="admin-discuss">
        {items.map((item) => (
          <li class="admin-discuss-item">
            <div class="admin-discuss-head">
              <input
                class="admin-check-item"
                type="checkbox"
                value={String(item.id)}
                data-bulk-item
                aria-label={`选择 ${item.name} 的讨论`}
              />
              <span class="admin-discuss-who">
                {item.name}
                {item.userName && item.userName !== item.name ? `（${item.userName}）` : ''}
              </span>
              <span class="admin-discuss-meta">
                <a
                  class="inline-link"
                  href={`/b/${item.bookSlug}/${item.chapterIdx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.bookTitle} · 第 {item.chapterIdx} 章
                </a>
                · {dateLabel(item.createdAt)}
              </span>
            </div>
            <div
              class="admin-discuss-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(item.body) }}
            />
            <div class="admin-discuss-actions">
              {item.status !== 'approved' ? (
                <form method="post" action={`/admin/discussions/${item.id}/approved`}>
                  <button class="admin-mini" type="submit">
                    通过
                  </button>
                </form>
              ) : null}
              {item.status !== 'pending' ? (
                <form method="post" action={`/admin/discussions/${item.id}/pending`}>
                  <button class="admin-mini" type="submit">
                    转待审
                  </button>
                </form>
              ) : null}
              {item.status !== 'spam' ? (
                <form method="post" action={`/admin/discussions/${item.id}/spam`}>
                  <button class="admin-mini" type="submit">
                    屏蔽
                  </button>
                </form>
              ) : null}
              <form
                method="post"
                action={`/admin/discussions/${item.id}/delete`}
                data-confirm="确定删除这条讨论？"
              >
                <button class="admin-mini admin-danger" type="submit">
                  删除
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      {pages > 1 ? (
        <nav class="admin-pager" aria-label="翻页">
          {page > 1 ? (
            <a class="admin-mini" href={href(page - 1)} rel="prev">
              上一页
            </a>
          ) : (
            <span class="admin-mini is-off">上一页</span>
          )}
          <span class="admin-pager-count">
            第 {page} / {pages} 页
          </span>
          {page < pages ? (
            <a class="admin-mini" href={href(page + 1)} rel="next">
              下一页
            </a>
          ) : (
            <span class="admin-mini is-off">下一页</span>
          )}
        </nav>
      ) : null}
    </>
  );
}
