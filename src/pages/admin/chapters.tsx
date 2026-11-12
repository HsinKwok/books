import type { Book, Chapter } from '../../db';
import type { SessionUser } from '../../env';
import { AdminHead, AdminLayout } from './layout';

export function ChapterFormPage({
  user,
  theme,
  book,
  chapter,
  isNew,
  canPublish,
  error,
}: {
  user: SessionUser;
  theme?: string;
  book: Book;
  chapter: Chapter;
  isNew: boolean;
  canPublish: boolean;
  error?: string;
}) {
  const volume = book.volumes.find((v) => v.id === chapter.volumeId);
  const kicker = isNew
    ? 'New chapter'
    : volume
      ? `${volume.title} · 第 ${chapter.volumeNo || chapter.idx} 章`
      : `Chapter ${chapter.idx}`;

  return (
    <AdminLayout title={`${isNew ? '新增' : '编辑'}章节 · ${book.title}`} active="books" user={user} theme={theme}>
      <AdminHead
        kicker={kicker}
        title={isNew ? `给《${book.title}》加一章` : chapter.title}
        note={
          <>
            <a class="inline-link" href={`/admin/books/${book.id}`}>
              ← 返回《{book.title}》
            </a>
            <span class="admin-page-sep">·</span>
            正文支持 Markdown：空行分段，段内换行会自动合并；列表、引用、代码块保留换行。
          </>
        }
        action={
          <a class="admin-mini" href={`/b/${book.slug}/${chapter.idx}`} target="_blank" rel="noreferrer">
            前台预览
          </a>
        }
      />

      {error ? <p class="form-error">{error}</p> : null}

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>章节内容</h2>
        </div>
        <div class="admin-panel-body">
          <form class="admin-form" method="post" action={`/admin/books/${book.id}/chapters`}>
            <input type="hidden" name="mode" value={isNew ? 'new' : 'edit'} />
            <div class="admin-form-grid">
              <label class="admin-field">
                <span>章节序号</span>
                <input name="idx" type="number" min="1" value={String(chapter.idx)} readonly={!isNew} required />
                {isNew ? (
                  <span class="admin-hint">
                    该序号已有章节时，新章插在它前面，后面的章节序号统一加 1（评论与阅读进度同步后移）。
                  </span>
                ) : null}
              </label>
              <label class="admin-field">
                <span>标题</span>
                <input name="title" value={chapter.title} maxlength={100} required />
              </label>
              {book.volumes.length ? (
                <label class="admin-field">
                  <span>所属卷</span>
                  <select name="volumeId">
                    {book.volumes.map((item) => (
                      <option value={String(item.id)} selected={item.id === chapter.volumeId}>
                        {item.title || `第 ${item.idx} 卷`}
                      </option>
                    ))}
                    <option value="" selected={chapter.volumeId === null}>
                      未分卷
                    </option>
                  </select>
                </label>
              ) : null}
              {canPublish ? (
                <label class="admin-field">
                  <span>状态</span>
                  <select name="status">
                    <option value="draft" selected={chapter.status === 'draft'}>
                      草稿
                    </option>
                    <option value="published" selected={chapter.status === 'published'}>
                      已发布
                    </option>
                  </select>
                </label>
              ) : (
                <div class="admin-field">
                  <span>状态</span>
                  <p class="admin-cell-sub">
                    {chapter.status === 'published'
                      ? '已发布，上下架由编辑负责。'
                      : '草稿，发布由编辑完成。'}
                  </p>
                  <input type="hidden" name="status" value={chapter.status} />
                </div>
              )}
            </div>

            <div class="admin-editor">
              <label class="admin-field admin-editor-input">
                <span>正文（支持 Markdown）</span>
                <textarea name="body" id="chapter-body" rows={26} data-markdown required>
                  {chapter.body}
                </textarea>
              </label>
              <div class="admin-editor-preview">
                <span class="admin-field-label">预览</span>
                <div class="chapter-preview" id="chapter-preview" />
                <p class="admin-counter" id="chapter-counter">
                  0 字
                </p>
              </div>
            </div>

            <div class="admin-form-foot">
              <button class="btn" type="submit">
                保存章节
              </button>
              <a class="admin-mini" href={`/admin/books/${book.id}`}>
                取消
              </a>
            </div>
          </form>
        </div>
      </section>
    </AdminLayout>
  );
}
