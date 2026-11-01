import type { Book, Chapter, ChapterLink } from '../../db';

/** 底部阅读条：书名 / 进度 / 上下章 / 目录·书架·设置按钮 */
export function ReaderBar({
  book,
  chapter,
  total,
  prev,
  next,
}: {
  book: Book;
  chapter: Chapter;
  /** 全书已发布章节总数 */
  total: number;
  prev?: ChapterLink;
  next?: ChapterLink;
}) {
  return (
    <div class="read-bar">
      <a class="read-bar-book" href={`/b/${book.slug}`}>
        <i>{book.title}</i>
        <span>
          第 {chapter.idx} / {total} 章
        </span>
      </a>
      <div class="read-bar-track">
        <span id="progress-bar" />
      </div>
      <span class="read-bar-percent" id="progress-text">
        0%
      </span>
      <div class="read-bar-nav">
        {prev ? (
          <a data-nav="prev" href={`/b/${book.slug}/${prev.idx}`}>
            ← 上一章
          </a>
        ) : (
          <span class="is-disabled">← 上一章</span>
        )}
        {next ? (
          <a data-nav="next" href={`/b/${book.slug}/${next.idx}`}>
            下一章 →
          </a>
        ) : (
          <span class="is-disabled">下一章 →</span>
        )}
      </div>
      <div class="read-bar-tools">
        <button
          class="bar-btn bar-btn-icon"
          id="toc-btn"
          type="button"
          aria-expanded="false"
          aria-controls="toc-panel"
          aria-label="目录"
          data-tip="目录"
        >
          <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
            <path d="M2 3.5h10M2 7h10M2 10.5h10" />
          </svg>
        </button>
        <button
          class="bar-btn bar-btn-icon"
          id="shelf-btn"
          type="button"
          aria-pressed="false"
          aria-label="加入书架"
          data-tip="加入书架"
          data-slug={book.slug}
          data-title={book.title}
        >
          <svg class="icon-add" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
            <path d="M7 2.5v9M2.5 7h9" />
          </svg>
          <svg class="icon-done" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
            <path d="M2.5 7.5l3 3 6-6.5" />
          </svg>
        </button>
        <button class="settings-btn" id="settings-btn" type="button" aria-label="阅读设置" data-tip="字体调整">
          Aa
        </button>
      </div>
    </div>
  );
}

/** 目录面板：章节列表由 /api/toc 补 */
export function TocPanel({ book, chapter }: { book: Book; chapter: Chapter }) {
  return (
    <div class="toc-panel" id="toc-panel" hidden>
      <p class="settings-title">
        目录 · <a href={`/b/${book.slug}`}>{book.title}</a>
      </p>
      <ol class="toc-panel-list" data-toc={book.slug} data-current={String(chapter.idx)} />
      <noscript>
        <p class="toc-panel-note">
          <a href={`/b/${book.slug}`}>查看完整目录</a>
        </p>
      </noscript>
    </div>
  );
}

/** 客户端续读进度：JSON 内联，尖括号转义避免提前闭合 script */
export function ReadProgressScript({
  book,
  progress,
}: {
  book: Book;
  progress?: { idx: number; ratio: number } | null;
}) {
  return (
    <script
      type="application/json"
      id="read-progress"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(progress ? { slug: book.slug, ...progress } : null).replace(/</g, '\\u003c'),
      }}
    />
  );
}
