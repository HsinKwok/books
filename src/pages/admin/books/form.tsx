import type { Book, Category } from '../../../db';
import type { SessionUser } from '../../../env';
import { AdminHead, AdminLayout } from '../layout';
import { ChapterPanel } from './chapters';
import { VolumePanel } from './volumes';

/** 书籍基本信息表单：新建与编辑共用 */
function BookInfoForm({
  book,
  categories,
  canPublish,
  isNew,
}: {
  book: Book;
  categories: Category[];
  canPublish: boolean;
  isNew: boolean;
}) {
  const categoryOptions = categories.some((c) => c.name === book.category)
    ? categories
    : book.category
      ? [{ id: 0, name: book.category, slug: '', sort: 0, hidden: false, description: '' }, ...categories]
      : categories;

  return (
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>书籍信息</h2>
      </div>
      <div class="admin-panel-body">
        <form
          class="admin-form"
          method="post"
          enctype="multipart/form-data"
          action={isNew ? '/admin/books' : `/admin/books/${book.id}`}
        >
          <div class="admin-form-grid">
            <label class="admin-field">
              <span>书名</span>
              <input name="title" value={book.title} maxlength={80} required />
            </label>
            <label class="admin-field">
              <span>作者</span>
              <input name="author" value={book.author} maxlength={40} required />
            </label>
            <label class="admin-field">
              <span>分类</span>
              <select name="category" required>
                {categoryOptions.map((cat) => (
                  <option value={cat.name} selected={cat.name === book.category}>
                    {cat.name}
                    {cat.hidden ? '（隐藏）' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label class="admin-field">
              <span>链接（slug）</span>
              <input name="slug" value={book.slug} maxlength={60} placeholder="留空自动生成" />
            </label>
            {canPublish ? (
              <label class="admin-field">
                <span>状态</span>
                <select name="status">
                  <option value="draft" selected={book.status === 'draft'}>
                    草稿
                  </option>
                  <option value="published" selected={book.status === 'published'}>
                    已发布
                  </option>
                </select>
              </label>
            ) : (
              <div class="admin-field">
                <span>状态</span>
                <p class="admin-cell-sub">
                  {book.status === 'published' ? '已发布，由编辑负责上下架。' : '草稿，发布由编辑完成。'}
                </p>
              </div>
            )}
            <label class="admin-field">
              <span>排序（小的在前）</span>
              <input name="sort" type="number" value={String(book.sort)} step="1" />
            </label>
            <label class="admin-field">
              <span>连载状态</span>
              <select name="serialStatus">
                <option value="serializing" selected={book.serialStatus === 'serializing'}>
                  连载中
                </option>
                <option value="finished" selected={book.serialStatus === 'finished'}>
                  已完结
                </option>
                <option value="paused" selected={book.serialStatus === 'paused'}>
                  暂停更新
                </option>
              </select>
            </label>
          </div>

          <div class="admin-checks">
            <label class="admin-check">
              <input type="checkbox" name="allowDiscussion" value="1" checked={book.allowDiscussion} />
              <span>允许读者讨论</span>
            </label>
            {canPublish ? (
              <label class="admin-check">
                <input type="checkbox" name="featured" value="1" checked={book.featured} />
                <span>首页推荐（排在书库前面）</span>
              </label>
            ) : null}
          </div>

          <label class="admin-field">
            <span>简介（支持 Markdown）</span>
            <textarea name="summary" rows={3} maxlength={300} data-markdown>
              {book.summary}
            </textarea>
          </label>

          <div class="admin-field">
            <span>封面</span>
            {book.coverUrl ? (
              <img class="admin-cover-preview" src={book.coverUrl} alt="当前封面" />
            ) : (
              <p class="admin-cell-sub">现在用排版生成的文字封面。</p>
            )}
            <label class="admin-field-inline">
              <span>上传图片</span>
              <input type="file" name="cover" accept="image/*" />
            </label>
            <label class="admin-field-inline">
              <span>或填外链</span>
              <input name="coverUrl" value={book.coverUrl} maxlength={300} placeholder="https://…" />
            </label>
            {book.coverUrl ? (
              <label class="admin-check">
                <input type="checkbox" name="removeCover" value="1" />
                <span>移除当前封面</span>
              </label>
            ) : null}
          </div>

          <div class="admin-form-foot">
            <button class="btn" type="submit">
              {isNew ? '创建书籍' : '保存修改'}
            </button>
            <a class="admin-mini" href="/admin/books">
              取消
            </a>
          </div>
        </form>
      </div>
    </section>
  );
}

export function BookFormPage({
  user,
  theme,
  book,
  categories,
  error,
  isNew,
  canPublish,
  canImport,
  chapterPage = 1,
  chapterPages = 1,
  chapterTotal = book.chapterCount,
  volumeCounts,
}: {
  user: SessionUser;
  theme?: string;
  book: Book;
  categories: Category[];
  error?: string;
  isNew: boolean;
  canPublish: boolean;
  canImport: boolean;
  /** 章节表当前页与总页数（无 JS 时靠地址栏参数） */
  chapterPage?: number;
  chapterPages?: number;
  /** 全书章节总数，分页后 book.chapters 只是当前页 */
  chapterTotal?: number;
  /** 每卷章数（键为 `v${id}`），分页后由后端统计传入 */
  volumeCounts?: Record<string, number>;
}) {
  return (
    <AdminLayout
      title={isNew ? '新建书籍 · 后台' : `编辑 ${book.title} · 后台`}
      active="books"
      sub={isNew ? 'new' : undefined}
      user={user}
      theme={theme}
    >
      <AdminHead
        kicker={isNew ? 'New book' : 'Edit book'}
        title={isNew ? '新建一本书' : book.title}
        note={
          <>
            <a class="inline-link" href="/admin/books">
              ← 返回书籍列表
            </a>
          </>
        }
        action={
          isNew ? null : (
            <a class="admin-mini" href={`/b/${book.slug}`} target="_blank" rel="noreferrer">
              查看前台
            </a>
          )
        }
      />

      {error ? <p class="form-error">{error}</p> : null}

      <BookInfoForm book={book} categories={categories} canPublish={canPublish} isNew={isNew} />

      {isNew ? null : (
        <>
          <VolumePanel book={book} counts={volumeCounts} />
          <ChapterPanel
            book={book}
            chapters={book.chapters}
            page={chapterPage}
            pages={chapterPages}
            total={chapterTotal}
            canImport={canImport}
          />

          <section class="admin-panel">
            <div class="admin-panel-head">
              <h2>删除书籍</h2>
            </div>
            <div class="admin-panel-body">
              <p class="admin-page-note">删除后这本书和它的全部章节都会消失，无法恢复。</p>
              <form
                class="admin-form-foot"
                method="post"
                action={`/admin/books/${book.id}/delete`}
                data-confirm={`确定删除《${book.title}》及其全部章节？`}
              >
                <button class="admin-mini admin-danger" type="submit">
                  删除这本书
                </button>
              </form>
            </div>
          </section>
        </>
      )}
    </AdminLayout>
  );
}
