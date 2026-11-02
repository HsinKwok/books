import type { Book, Volume } from '../../db';
import type { SessionUser } from '../../env';
import type { ParsedChapter, ParsedVolume } from '../../txt';
import { AdminHead, AdminLayout } from './layout';

export function ImportPage({
  user,
  theme,
  book,
  volumes,
  nextIdx,
  error,
}: {
  user: SessionUser;
  theme?: string;
  book: Book;
  /** 已有卷：可选作导入的目的卷 */
  volumes: Volume[];
  nextIdx: number;
  error?: string;
}) {
  return (
    <AdminLayout title={`导入 TXT · ${book.title}`} active="books" user={user} theme={theme}>
      <AdminHead
        kicker="Import"
        title="整本 TXT 拆章导入"
        note={
          <>
            <a class="inline-link" href={`/admin/books/${book.id}`}>
              ← 返回《{book.title}》
            </a>
            <span class="admin-page-sep">·</span><br />
            标题要求整行很短，带问号、感叹号也行，但要独立成行、编号接得上前一章，正文里提到的「第N章 / 第N卷」不会被误当标题；没认到
            标题时按字数切分。TXT 支持 UTF-8 / GBK（ANSI）等编码，会自动识别后再解码。先预览再入库。
          </>
        }
      />

      {error ? <p class="form-error">{error}</p> : null}

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>TXT 文件</h2>
        </div>
        <div class="admin-panel-body">
          <form
            class="admin-form"
            id="import-form"
            method="post"
            action={`/admin/books/${book.id}/import`}
          >
            <div class="admin-form-grid">
              <label class="admin-field">
                <span>TXT 文件</span>
                <input type="file" accept=".txt,text/plain" id="import-file" />
                <span class="admin-hint" id="import-encoding-hint" hidden></span>
              </label>
              <label class="admin-field">
                <span>文件编码</span>
                <select id="import-encoding">
                  <option value="auto">自动识别（推荐）</option>
                  <option value="utf-8">UTF-8</option>
                  <option value="gb18030">GBK / GB2312 / ANSI</option>
                  <option value="big5">Big5（繁体）</option>
                  <option value="shift_jis">Shift_JIS（日文）</option>
                </select>
              </label>
              <label class="admin-field">
                <span>起始章节号</span>
                <input name="startIdx" type="number" min="1" value={String(nextIdx)} required />
              </label>
              <label class="admin-field">
                <span>导入状态</span>
                <select name="status">
                  <option value="published" selected>
                    已发布（读者可见）
                  </option>
                  <option value="draft">草稿（仅后台可见）</option>
                </select>
              </label>
              <label class="admin-field">
                <span>已有章节</span>
                <select name="mode">
                  <option value="append">保留，从起始号续写</option>
                  <option value="replace">清空本书章节后导入</option>
                </select>
              </label>
              <label class="admin-field">
                <span>导入到</span>
                <select name="volume">
                  <option value="auto">按 TXT 里的卷标题分卷</option>
                  {volumes.map((volume) => (
                    <option value={`v${volume.id}`}>
                      并入「{volume.title || `第 ${volume.idx} 卷`}」
                    </option>
                  ))}
                  <option value="none">不分卷（章节全部平铺）</option>
                  <option value="new">新建一卷…</option>
                </select>
              </label>
              <label class="admin-field">
                <span>新卷名称</span>
                <input name="volumeTitle" maxlength={100} placeholder="选择「新建一卷」时填写" />
                <span class="admin-hint">并入已有卷或新建卷时，TXT 里的卷标题会被忽略。</span>
              </label>
              <label class="admin-field">
                <span>切分方式</span>
                <select name="splitMode">
                  <option value="auto">自动（认标题，认不到按字数）</option>
                  <option value="headings">只按章节标题</option>
                  <option value="size">只按字数</option>
                </select>
              </label>
              <label class="admin-field">
                <span>每节字数</span>
                <input name="chunkChars" type="number" min="500" max="20000" step="500" value="3000" />
                <span class="admin-hint">按字数切分时使用；自动模式认不到标题时也用它。</span>
              </label>
            </div>

            <label class="admin-field">
              <span>或直接粘贴正文</span>
              <textarea name="raw" id="import-raw" rows={16} placeholder="第一章 ……" required />
            </label>

            <div class="admin-form-foot">
              <button class="btn" type="submit" name="stage" value="preview">
                解析并预览
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

/** 预览表的一行：卷分组标题，或一章 */
type PreviewRow =
  | { kind: 'group'; label: string }
  | { kind: 'chapter'; chapter: ParsedChapter; no: number };

export function ImportPreviewPage({
  user,
  theme,
  book,
  volumes,
  chapters,
  note,
  raw,
  startIdx,
  status,
  mode,
  splitMode,
  chunkChars,
  volume,
  volumeTitle,
  volumeLabel,
}: {
  user: SessionUser;
  theme?: string;
  book: Book;
  volumes: ParsedVolume[];
  chapters: ParsedChapter[];
  note?: string;
  raw: string;
  startIdx: number;
  status: string;
  mode: string;
  splitMode: string;
  chunkChars: number;
  /** 目的卷表单值：auto / none / v<id> / new */
  volume: string;
  volumeTitle: string;
  /** 目的卷展示名，由后端解析 */
  volumeLabel?: string;
}) {
  const destMode = volume !== 'auto';
  const destLabel = volumeLabel || '目标卷';
  const all = [...volumes.flatMap((item) => item.chapters), ...chapters];
  const rows: PreviewRow[] = [];
  let no = startIdx;

  if (destMode) {
    // 指定目的卷时忽略 TXT 卷标题，按原顺序全部归入同一卷（或全部未分卷）
    if (volume !== 'none') {
      rows.push({ kind: 'group', label: `${destLabel} · ${all.length} 章` });
    }
    for (const chapter of all) rows.push({ kind: 'chapter', chapter, no: no++ });
  } else {
    for (const item of volumes) {
      rows.push({ kind: 'group', label: `${item.title || '未命名卷'} · ${item.chapters.length} 章` });
      for (const chapter of item.chapters) rows.push({ kind: 'chapter', chapter, no: no++ });
    }
    if (chapters.length) {
      if (volumes.length) rows.push({ kind: 'group', label: `未分卷 · ${chapters.length} 章` });
      for (const chapter of chapters) rows.push({ kind: 'chapter', chapter, no: no++ });
    }
  }

  const totalChapters = rows.filter((row) => row.kind === 'chapter').length;
  const totalWords = rows.reduce((n, row) => n + (row.kind === 'chapter' ? row.chapter.words : 0), 0);
  const title = destMode
    ? volume === 'none'
      ? `导入 ${totalChapters} 章（不分卷）`
      : `导入 ${totalChapters} 章到「${destLabel}」`
    : volumes.length
      ? `识别到 ${volumes.length} 卷 · ${totalChapters} 章`
      : `识别到 ${totalChapters} 章`;

  return (
    <AdminLayout title={`导入预览 · ${book.title}`} active="books" user={user} theme={theme}>
      <AdminHead
        kicker="Preview"
        title={title}
        note={
          <>
            从第 {startIdx} 章开始
            {mode === 'replace' ? '，并清空已有章节和卷' : '，保留已有章节'} · 共{' '}
            {totalWords.toLocaleString('en-US')} 字。
            {destMode ? (
              <>
                <span class="admin-page-sep">·</span>
                {volume === 'none'
                  ? '全部章节保持未分卷'
                  : `章节将追加到「${destLabel}」，TXT 里的卷标题不再建卷`}
              </>
            ) : null}
            {note ? <span class="admin-page-sep">·</span> : null}
            {note}
            <a class="inline-link" href={`/admin/books/${book.id}/import`}>
              重新选择
            </a>
          </>
        }
      />

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>章节预览</h2>
        </div>
        <table class="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>章节标题</th>
              <th>字数</th>
              <th>开头</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.kind === 'chapter' ? (
                <tr>
                  <td class="admin-num">{row.no}</td>
                  <td class="admin-cell-title">{row.chapter.title}</td>
                  <td class="admin-num">{row.chapter.words.toLocaleString('en-US')}</td>
                  <td class="admin-cell-sub">{row.chapter.body.slice(0, 40)}…</td>
                </tr>
              ) : (
                <tr class="admin-volume-row">
                  <td colSpan={4}>{row.label}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </section>

      <form
        class="admin-form"
        method="post"
        action={`/admin/books/${book.id}/import`}
        data-confirm={
          mode === 'replace'
            ? `确定清空本书已有的全部章节和卷，再导入 ${totalChapters} 章？旧章节的讨论和阅读进度会一并清除，无法恢复。`
            : undefined
        }
      >
        <textarea name="raw" hidden>
          {raw}
        </textarea>
        <input type="hidden" name="startIdx" value={String(startIdx)} />
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="splitMode" value={splitMode} />
        <input type="hidden" name="chunkChars" value={String(chunkChars)} />
        <input type="hidden" name="volume" value={volume} />
        <input type="hidden" name="volumeTitle" value={volumeTitle} />
        <div class="admin-form-foot">
          <button class="btn" type="submit" name="stage" value="commit">
            确认导入 {totalChapters} 章
          </button>
          <a class="admin-mini" href={`/admin/books/${book.id}/import`}>
            返回
          </a>
        </div>
      </form>
    </AdminLayout>
  );
}
