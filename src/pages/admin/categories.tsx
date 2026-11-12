import type { Category } from '../../db';
import type { SessionUser } from '../../env';
import { AdminHead, AdminLayout, BulkBar } from './layout';

export function CategoriesPage({
  user,
  categories,
  counts,
  notice,
  theme,
}: {
  user: SessionUser;
  categories: Category[];
  counts: Record<string, number>;
  notice?: string;
  theme?: string;
}) {
  return (
    <AdminLayout title="分类 · 后台" active="categories" user={user} notice={notice} theme={theme}>
      <AdminHead
        kicker="Categories"
        title="分类与导航"
        note="侧栏导航按这里的排序显示；隐藏的分类不会出现在前台导航里，书本身不受影响。"
      />

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>新增分类</h2>
        </div>
        <div class="admin-panel-body">
          <form class="admin-form" method="post" action="/admin/categories">
            <div class="admin-form-grid">
              <label class="admin-field">
                <span>名称</span>
                <input name="name" maxlength={20} required />
              </label>
              <label class="admin-field">
                <span>链接（留空同名称）</span>
                <input name="slug" maxlength={40} placeholder="novel" />
              </label>
              <label class="admin-field">
                <span>排序（小的在前）</span>
                <input name="sort" type="number" value="0" step="1" />
              </label>
            </div>
            <label class="admin-field">
              <span>简介（可留空，支持 Markdown）</span>
              <textarea name="description" rows={2} maxlength={100} data-markdown />
            </label>
            <label class="admin-check">
              <input type="checkbox" name="hidden" value="1" />
              <span>在前台隐藏</span>
            </label>
            <div class="admin-form-foot">
              <button class="btn" type="submit">
                新增分类
              </button>
            </div>
          </form>
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>
            全部分类 · <span data-categories-count>{categories.length}</span>
          </h2>
        </div>
        <div id="categories-table">
          <CategoryTable categories={categories} counts={counts} />
        </div>
      </section>
    </AdminLayout>
  );
}

/** 分类表格 + 批量条：整页渲染和 ajax 批量删除后都复用这份标记 */
export function CategoryTable({
  categories,
  counts,
}: {
  categories: Category[];
  counts: Record<string, number>;
}) {
  if (!categories.length) return <p class="admin-empty">还没有分类。</p>;

  return (
    <>
      {/* 批量条：勾选后一次删除，「未分类」是兜底分类不可选 */}
      <BulkBar unit="个分类" actions={[{ key: 'delete', label: '删除', danger: true }]} />
      <table class="admin-table">
        <thead>
          <tr>
            <th class="admin-check-cell" aria-label="选择" />
            <th>名称</th>
            <th>链接</th>
            <th>书籍</th>
            <th>排序</th>
            <th>状态</th>
            <th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {categories.map((cat) => {
            const fixed = cat.name === '未分类';
            const used = counts[cat.name] ?? 0;
            return (
              <tr data-books-count={String(used)}>
                <td class="admin-check-cell">
                  <input
                    class="admin-check-item"
                    type="checkbox"
                    value={String(cat.id)}
                    data-bulk-item
                    disabled={fixed}
                    aria-label={`选择 ${cat.name}`}
                  />
                </td>
                <td>
                  <a class="admin-cell-title" href={`/admin/categories/${cat.id}`}>
                    {cat.name}
                  </a>
                  {cat.description ? <span class="admin-cell-sub">{cat.description}</span> : null}
                </td>
                <td class="admin-cell-sub">/c/{cat.slug}</td>
                <td class="admin-num">
                  {used > 0 ? (
                    <a
                      class="inline-link"
                      href={`/admin/books?category=${encodeURIComponent(cat.name)}`}
                      title={`查看「${cat.name}」下的书`}
                    >
                      {used}
                    </a>
                  ) : (
                    used
                  )}
                </td>
                <td class="admin-num">{cat.sort}</td>
                <td>{cat.hidden ? '隐藏' : '显示'}</td>
                <td class="admin-row-actions">
                  <a class="admin-mini" href={`/admin/categories/${cat.id}`}>
                    编辑
                  </a>
                  {fixed ? null : (
                    <form
                      method="post"
                      action={`/admin/categories/${cat.id}/delete`}
                      data-confirm={
                        used > 0
                          ? `确定删除分类「${cat.name}」？影响 ${used} 本书，书会回落到「未分类」，不会删书。`
                          : `确定删除分类「${cat.name}」？当前没有书在用。`
                      }
                    >
                      <button class="admin-mini admin-danger" type="submit">
                        删除
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

export function CategoryFormPage({
  user,
  theme,
  category,
  counts,
  error,
}: {
  user: SessionUser;
  theme?: string;
  category: Category;
  counts: number;
  error?: string;
}) {
  return (
    <AdminLayout title={`编辑 ${category.name} · 后台`} active="categories" user={user} theme={theme}>
      <AdminHead
        kicker="Edit category"
        title={category.name}
        note={
          <>
            <a class="inline-link" href="/admin/categories">
              ← 返回分类列表
            </a>
          </>
        }
      />

      {error ? <p class="form-error">{error}</p> : null}

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>分类信息</h2>
          <span class="admin-panel-actions">
            <span class="admin-cell-sub">{counts} 本书在用</span>
          </span>
        </div>
        <div class="admin-panel-body">
          <form class="admin-form" method="post" action={`/admin/categories/${category.id}`}>
            <div class="admin-form-grid">
              <label class="admin-field">
                <span>名称</span>
                <input name="name" value={category.name} maxlength={20} required />
              </label>
              <label class="admin-field">
                <span>链接（slug）</span>
                <input name="slug" value={category.slug} maxlength={40} />
              </label>
              <label class="admin-field">
                <span>排序（小的在前）</span>
                <input name="sort" type="number" value={String(category.sort)} step="1" />
              </label>
            </div>
            <label class="admin-field">
              <span>简介（支持 Markdown）</span>
              <textarea name="description" rows={2} maxlength={100} data-markdown>{category.description}</textarea>
            </label>
            <label class="admin-check">
              <input type="checkbox" name="hidden" value="1" checked={category.hidden} />
              <span>在前台隐藏</span>
            </label>
            <div class="admin-form-foot">
              <button class="btn" type="submit">
                保存修改
              </button>
              <a class="admin-mini" href="/admin/categories">
                取消
              </a>
            </div>
          </form>
        </div>
      </section>
    </AdminLayout>
  );
}
