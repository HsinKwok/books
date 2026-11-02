import type { Book, Volume } from '../../../db';
import { BulkBar } from '../layout';

const titleOf = (volume: Volume) => volume.title || `第 ${volume.idx} 卷`;

/** 上移 / 下移只有方向不同，共用一个表单 */
function MoveButton({ bookId, volumeId, dir }: { bookId: number; volumeId: number; dir: 'up' | 'down' }) {
  return (
    <form method="post" action={`/admin/books/${bookId}/volumes/${volumeId}/move`}>
      <input type="hidden" name="dir" value={dir} />
      <button class="admin-mini" type="submit">
        {dir === 'up' ? '↑' : '↓'}
      </button>
    </form>
  );
}

type VolumePanelProps = {
  book: Book;
  /** 每卷章数（键为 `v${id}`）；章节表分页后由后端统计传入 */
  counts?: Record<string, number>;
};

/** 卷管理：排序、改名、删除，以及新增一卷；勾选后可批量删除 */
export function VolumePanel(props: VolumePanelProps) {
  return (
    <section class="admin-panel" id="volumes" data-book-id={String(props.book.id)}>
      <VolumePanelBody {...props} />
    </section>
  );
}

/** 面板内容：卷增删改后 ajax 只换这一块，section 本身和批量逻辑保留 */
export function VolumePanelBody({ book, counts }: VolumePanelProps) {
  const countOf = (volumeId: number) =>
    counts?.[`v${volumeId}`] ?? book.chapters.filter((chapter) => chapter.volumeId === volumeId).length;

  return (
    <>
      <div class="admin-panel-head">
        <h2>卷 · {book.volumes.length}</h2>
        {book.volumes.length ? (
          <BulkBar unit="卷" actions={[{ key: 'delete', label: '删除选中', danger: true }]} />
        ) : null}
      </div>
      <div class="admin-panel-body">
        {book.volumes.length ? (
          <ul class="admin-volume-list">
            {book.volumes.map((volume, i) => (
              <li class="admin-volume-item">
                <div class="admin-volume-head">
                  <input
                    class="admin-check-item"
                    type="checkbox"
                    value={String(volume.id)}
                    data-bulk-item
                    aria-label={`选择 ${titleOf(volume)}`}
                  />
                  <span class="admin-volume-name">{titleOf(volume)}</span>
                  <span class="admin-cell-sub">{countOf(volume.id)} 章</span>
                  <span class="admin-row-actions">
                    {i > 0 ? <MoveButton bookId={book.id} volumeId={volume.id} dir="up" /> : null}
                    {i < book.volumes.length - 1 ? <MoveButton bookId={book.id} volumeId={volume.id} dir="down" /> : null}
                    <form
                      method="post"
                      action={`/admin/books/${book.id}/volumes/${volume.id}/delete`}
                      data-confirm="删除这一卷？卷里的章节会归到其他卷或「未分卷」，章节本身不会删除。"
                    >
                      <button class="admin-mini admin-danger" type="submit">
                        删除
                      </button>
                    </form>
                  </span>
                </div>
                <form
                  class="admin-volume-edit"
                  method="post"
                  action={`/admin/books/${book.id}/volumes/${volume.id}`}
                >
                  <input name="title" value={volume.title} maxlength={100} placeholder="第一卷" />
                  <input name="intro" value={volume.intro} maxlength={2000} placeholder="卷首语（可选）" />
                  <button class="admin-mini" type="submit">
                    保存
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p class="admin-empty">还没有分卷。整本书保持「章」的平铺目录。</p>
        )}

        <form class="admin-form-foot" method="post" action={`/admin/books/${book.id}/volumes`}>
          <input name="title" maxlength={100} placeholder="第一卷 / 上卷 / 风起篇" />
          <input name="intro" maxlength={2000} placeholder="卷首语（可选）" />
          <button class="admin-mini" type="submit">
            新增一卷
          </button>
        </form>
      </div>
    </>
  );
}
