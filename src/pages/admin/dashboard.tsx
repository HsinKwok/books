import type { AdminDiscussion, Book } from '../../db';
import { isoDate } from '../../db';
import type { SessionUser } from '../../env';
import { can } from '../../permissions';
import { AdminHead, AdminLayout, Badge } from './layout';

export function Dashboard({
  user,
  recentBooks,
  pending,
  notice,
  theme,
}: {
  user: SessionUser;
  recentBooks: Book[];
  pending: AdminDiscussion[];
  notice?: string;
  theme?: string;
}) {
  const canReview = can(user, 'discussion.review');
  const canUsers = can(user, 'user.manage');
  return (
    <AdminLayout title="概览 · 后台" active="dashboard" user={user} notice={notice} theme={theme}>
      <AdminHead
        kicker="Dashboard"
        title="今天也从字数开始"
        note={<span data-stat="head-note">正在统计……</span>}
      />

      {/* 数字由 /admin/api/overview 异步补，骨架先出 */}
      <section class="admin-stats" id="admin-overview">
        <div class="admin-stat">
          <span>书籍</span>
          <b data-stat="books">—</b>
          <em data-stat="books-meta">—</em>
        </div>
        <div class="admin-stat">
          <span>章节</span>
          <b data-stat="chapters">—</b>
          <em data-stat="chapters-meta">—</em>
        </div>
        <div class="admin-stat">
          <span>总字数</span>
          <b data-stat="words">—</b>
          <em>不含空白字符</em>
        </div>
        {canReview ? (
          <div class="admin-stat">
            <span>待审讨论</span>
            <b data-stat="pending">—</b>
            <em>
              <a class="inline-link" href="/admin/discussions?status=pending">
                去审核
              </a>
            </em>
          </div>
        ) : null}
        {canUsers ? (
          <div class="admin-stat">
            <span>读者账号</span>
            <b data-stat="users">—</b>
            <em>
              <a class="inline-link" href="/admin/users">
                管理
              </a>
            </em>
          </div>
        ) : null}
      </section>

      <div class="admin-columns">
        <section class="admin-panel">
          <div class="admin-panel-head">
            <h2>最近更新的书</h2>
            <a class="inline-link" href="/admin/books">
              全部书籍
            </a>
          </div>
          {recentBooks.length ? (
            <ul class="admin-list">
              {recentBooks.map((book) => (
                <li>
                  <a class="admin-row" href={`/admin/books/${book.id}`}>
                    <span class="admin-row-title">
                      {book.title} <Badge status={book.status} />
                    </span>
                    <span class="admin-row-meta">
                      {book.author} · {book.chapters.length} 章 · {isoDate(book.createdAt)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p class="admin-empty">还没有书，先新建一本。</p>
          )}
        </section>

        {canReview ? (
          <section class="admin-panel">
            <div class="admin-panel-head">
              <h2>待审讨论</h2>
              <a class="inline-link" href="/admin/discussions?status=pending">
                全部待审
              </a>
            </div>
            {pending.length ? (
              <ul class="admin-list">
                {pending.map((item) => (
                  <li class="admin-quote">
                    <p class="admin-quote-meta">
                      {item.name} · {item.bookTitle} · 第 {item.chapterIdx} 章 · {item.date}
                    </p>
                    <p class="admin-quote-body">{item.body}</p>
                    <form method="post" action={`/admin/discussions/${item.id}/approved`}>
                      <button class="admin-mini" type="submit">
                        通过
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p class="admin-empty">没有待审内容，清静。</p>
            )}
          </section>
        ) : null}
      </div>
    </AdminLayout>
  );
}
