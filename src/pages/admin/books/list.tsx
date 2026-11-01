import type { Book } from '../../../db';
import { formatWords } from '../../../format';
import type { SessionUser } from '../../../env';
import { can } from '../../../permissions';
import { AdminHead, AdminLayout, Badge, BulkBar } from '../layout';

/** 筛选条件拼成地址栏参数，翻页链接和 ajax 都按这套走 */
export function filterQuery(q: string, status: string, category = ''): string {
  const parts: string[] = [];
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (status) parts.push(`status=${status}`);
  if (category) parts.push(`category=${encodeURIComponent(category)}`);
  return parts.join('&');
}

/** 表格 + 空态 + 翻页：整页渲染和 ajax 筛选共用同一份标记 */
export function BookTable({
  books,
  page,
  pages,
  query,
}: {
  books: Book[];
  page: number;
  pages: number;
  /** 当前筛选条件（已编码），翻页时要带上 */
  query: string;
}) {
  const href = (n: number) => `/admin/books?${query ? `${query}&` : ''}page=${n}`;
  return (
    <>
      {/* 批量条：勾选后一次删除，前端脚本负责提交和刷新 */}
      <BulkBar unit="本" actions={[{ key: 'delete', label: '删除', danger: true }]} />
      <table class="admin-table">
        <thead>
          <tr>
            <th class="admin-check-cell" aria-label="选择" />
            <th>书名</th>
            <th>作者 / 分类</th>
            <th>章节</th>
            <th>字数</th>
            <th>状态</th>
            <th>更新</th>
            <th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {books.map((book) => (
            <tr>
              <td class="admin-check-cell">
                <input
                  class="admin-check-item"
                  type="checkbox"
                  value={String(book.id)}
                  data-bulk-item
                  aria-label={`选择《${book.title}》`}
                />
              </td>
              <td>
                <a class="admin-cell-title" href={`/admin/books/${book.id}`}>
                  {book.title}
                </a>
                <span class="admin-cell-sub">/{book.slug}</span>
              </td>
              <td>
                {book.author}
                <span class="admin-cell-sub">{book.category}</span>
              </td>
              <td class="admin-num">{book.chapters.length}</td>
              <td class="admin-num">{formatWords(book.chapters.reduce((n, c) => n + c.words, 0))}</td>
              <td>
                <Badge status={book.status} />
              </td>
              <td class="admin-cell-sub">{book.updatedAt}</td>
              <td class="admin-row-actions">
                <a class="admin-mini" href={`/admin/books/${book.id}`}>
                  编辑
                </a>
                <a class="admin-mini" href={`/admin/books/${book.id}/chapters/new`}>
                  加章
                </a>
                <form
                  method="post"
                  action={`/admin/books/${book.id}/delete`}
                  data-confirm={`确定删除《${book.title}》？章节和讨论会一并删除。`}
                >
                  <button class="admin-mini admin-danger" type="submit">
                    删除
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {books.length ? null : <p class="admin-empty">{query ? '没有符合条件的书。' : '书架还空着。'}</p>}
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

export function BooksPage({
  user,
  books,
  total,
  page,
  pages,
  notice,
  theme,
  q = '',
  status = '',
  category = '',
  categories = [],
}: {
  user: SessionUser;
  books: Book[];
  total: number;
  page: number;
  pages: number;
  notice?: string;
  theme?: string;
  /** 当前搜索词 */
  q?: string;
  /** '' | 'draft' | 'published' */
  status?: string;
  /** 当前筛选的分类名，空串表示不限 */
  category?: string;
  /** 分类下拉的可选项（含兜底「未分类」） */
  categories?: string[];
}) {
  return (
    <AdminLayout title="书籍 · 后台" active="books" sub="list" user={user} notice={notice} theme={theme}>
      <AdminHead
        kicker="Books"
        title="书籍与章节"
        note={`共 ${total} 本，草稿不会出现在前台。`}
        action={
          <a class="btn" href="/admin/books/new">
            新建书籍
          </a>
        }
      />

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>{can(user, 'book.edit.any') ? '全部书籍' : '我的书籍'}</h2>
          {can(user, 'discussion.review') ? (
            <span class="admin-panel-actions">
              <a class="inline-link" href="/admin/discussions?status=pending">
                待审讨论
              </a>
            </span>
          ) : null}
        </div>

        {/* 没有 JS 时表单照常提交，有 JS 时只换成下面的表格 */}
        <form class="admin-filter" id="books-filter" method="get" action="/admin/books">
          <input
            name="q"
            type="search"
            value={q}
            maxlength={40}
            placeholder="书名 / 作者 / 链接"
            aria-label="搜索书籍"
          />
          <select name="status" aria-label="按状态筛选">
            <option value="" selected={!status}>
              全部状态
            </option>
            <option value="published" selected={status === 'published'}>
              已发布
            </option>
            <option value="draft" selected={status === 'draft'}>
              草稿
            </option>
          </select>
          <select name="category" aria-label="按分类筛选">
            <option value="" selected={!category}>
              全部分类
            </option>
            {categories.map((name) => (
              <option value={name} selected={name === category}>
                {name}
              </option>
            ))}
          </select>
          <button class="admin-mini" type="submit">
            筛选
          </button>
          {q || status || category ? (
            <a class="admin-mini" href="/admin/books">
              清空
            </a>
          ) : null}
        </form>

        <div id="books-table">
          <BookTable books={books} page={page} pages={pages} query={filterQuery(q, status, category)} />
        </div>
      </section>
    </AdminLayout>
  );
}
