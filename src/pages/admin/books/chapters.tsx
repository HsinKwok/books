import type { Book, Chapter } from '../../../db';
import { isoDate } from '../../../db';
import { Badge, BulkBar } from '../layout';

/** 章节表本体：批量条 + 表格 + 翻页，AJAX 只替换这一块 */
export function ChapterTable({
  book,
  chapters,
  page,
  pages,
}: {
  book: Book;
  chapters: Chapter[];
  page: number;
  pages: number;
}) {
  const href = (n: number) => `/admin/books/${book.id}?chapterPage=${n}`;
  const volumeName = (id: number | null) => {
    if (id === null) return '';
    const volume = book.volumes.find((v) => v.id === id);
    return volume ? volume.title || `第 ${volume.idx} 卷` : '';
  };

  return (
    <>
      <table class="admin-table">
        <thead>
          <tr>
            <th class="admin-check-cell" aria-label="选择" />
            <th>#</th>
            <th>标题</th>
            {book.volumes.length ? <th>卷</th> : null}
            <th>字数</th>
            <th>状态</th>
            <th>更新</th>
            <th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {chapters.map((chapter) => (
            <tr>
              <td class="admin-check-cell">
                <input
                  class="admin-check-item"
                  type="checkbox"
                  value={String(chapter.idx)}
                  data-bulk-item
                  aria-label={`选择 ${chapter.title}`}
                />
              </td>
              <td class="admin-num">{chapter.idx}</td>
              <td>
                <a class="admin-cell-title" href={`/admin/books/${book.id}/chapters/${chapter.idx}`}>
                  {chapter.title}
                </a>
              </td>
              {book.volumes.length ? (
                <td class="admin-cell-sub">
                  {chapter.volumeId
                    ? `${volumeName(chapter.volumeId)} · 第 ${chapter.volumeNo} 章`
                    : '未分卷'}
                </td>
              ) : null}
              <td class="admin-num">{chapter.words.toLocaleString('en-US')}</td>
              <td>
                <Badge status={chapter.status} />
              </td>
              <td class="admin-cell-sub">{isoDate(chapter.updatedAt)}</td>
              <td class="admin-row-actions">
                <a class="admin-mini" href={`/b/${book.slug}/${chapter.idx}`} target="_blank" rel="noreferrer">
                  预览
                </a>
                <form
                  method="post"
                  action={`/admin/books/${book.id}/chapters/${chapter.idx}/delete`}
                  data-confirm="确定删除这一章？这一章的讨论和阅读进度会一并清除。"
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
      {chapters.length ? null : <p class="admin-empty">还没有章节，可以手动新增或导入 TXT。</p>}
      {pages > 1 ? (
        <nav class="admin-pager" aria-label="章节翻页">
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

/** 章节面板：标题栏 + 可局部刷新的表格容器 */
export function ChapterPanel({
  book,
  chapters,
  page,
  pages,
  total,
  canImport,
}: {
  book: Book;
  chapters: Chapter[];
  page: number;
  pages: number;
  total: number;
  canImport: boolean;
}) {
  return (
    <section class="admin-panel" id="chapters-panel" data-book-id={String(book.id)}>
      <div class="admin-panel-head">
        <h2>章节 · {total}</h2>
        <BulkBar unit="章" actions={[{ key: 'delete', label: '删除', danger: true }]} />
        <span class="admin-panel-actions">
          {canImport ? (
            <a class="admin-mini" href={`/admin/books/${book.id}/import`}>
              TXT 拆章导入
            </a>
          ) : null}
          <a class="admin-mini" href={`/admin/books/${book.id}/chapters/new`}>
            新增章节
          </a>
        </span>
      </div>

      <div id="chapters-table" data-book-id={String(book.id)}>
        <ChapterTable book={book} chapters={chapters} page={page} pages={pages} />
      </div>
    </section>
  );
}
