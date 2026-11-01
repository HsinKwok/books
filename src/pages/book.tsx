import type { Book, Chapter } from '../db';
import { SERIAL_LABELS } from '../db';
import { formatWords } from '../format';
import { renderMarkdown } from '../markdown';

export function BookDetail({
  book,
  talks,
  total,
  words,
  volumeCounts = {},
}: {
  book: Book;
  talks: number;
  /** 全部已发布章节数；首屏目录可能只渲染了一部分 */
  total: number;
  /** 全书字数 */
  words: number;
  /** 目录被截断时每卷的章节数，键为 `v${id}` 或 'none' */
  volumeCounts?: Record<string, number>;
}) {
  const groups = book.volumes.length
    ? [
        ...book.volumes.map((volume) => ({
          key: `v${volume.id}`,
          title: volume.title || `第 ${volume.idx} 卷`,
          intro: volume.intro,
          chapters: book.chapters.filter((chapter) => chapter.volumeId === volume.id),
        })),
        {
          key: 'none',
          title: '未分卷',
          intro: '',
          chapters: book.chapters.filter((chapter) => chapter.volumeId === null),
        },
      ]
        // 截断时卷内可能一章都没渲染，要用统计出来的卷章数兜底
        .map((group) => ({ ...group, count: volumeCounts[group.key] ?? group.chapters.length }))
        .filter((group) => group.count > 0)
    : [];
  // 第一卷（首屏已渲染的那卷）展开，其余卷点开时再按需拉目录
  const firstOpen = groups.findIndex((group) => group.chapters.length > 0);
  const truncated = total > book.chapters.length;

  const renderRow = (chapter: Chapter, no: number) => (
    <li>
      <a
        class="toc-row"
        href={`/b/${book.slug}/${chapter.idx}`}
        data-book={book.slug}
        data-idx={String(chapter.idx)}
      >
        <span class="row-num">{String(no).padStart(2, '0')}</span>
        <span class="toc-title">{chapter.title}</span>
        <span class="toc-meta">
          {formatWords(chapter.words)}
          <em class="toc-state js-toc-state">未读</em>
        </span>
      </a>
    </li>
  );

  return (
    <div class="page">
      <a class="back" href="/">
        ← 书库
      </a>

      <div class="book-grid">
        <main class="book-main">
          <header class="book-head">
            <p class="eyebrow">
              {book.author} · {book.category} · {SERIAL_LABELS[book.serialStatus]} · 更新于{' '}
              {book.updatedAt}
            </p>
            <h1 class="book-title">{book.title}</h1>
            <div
              class="book-summary"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(book.summary) }}
            />
          </header>

          <section class="toc" data-book={book.slug}>
            <div class="section-head">
              <h2 class="section-label">目录</h2>
              <span class="section-note">
                共 {total} 章
                {book.volumes.length ? ` · ${book.volumes.length} 卷` : ''} · {formatWords(words)}
                {talks ? ` · ${talks} 条讨论` : ''}
              </span>
            </div>

            {groups.length ? (
              <div class="toc-volumes">
                {groups.map((group, i) => {
                  const open = i === firstOpen;
                  // 展开的那卷若在首屏被截断，留一个「加载全部」按钮
                  const missing = open ? group.count - group.chapters.length : 0;
                  return (
                    <section class="toc-volume" data-lazy={open ? undefined : group.key}>
                      <h3 class="toc-volume-title">
                        <button
                          class="toc-volume-toggle"
                          type="button"
                          aria-expanded={open ? 'true' : 'false'}
                        >
                          {group.title}
                          <span class="toc-volume-count">{group.count} 章</span>
                        </button>
                      </h3>
                      {group.intro ? <p class="toc-volume-intro">{group.intro}</p> : null}
                      <ol class="toc-list" hidden={!open}>
                        {open
                          ? group.chapters.map((chapter) => renderRow(chapter, chapter.volumeNo))
                          : null}
                        {missing > 0 ? (
                          <li class="toc-more" data-key={group.key}>
                            <button class="toc-more-btn" type="button">
                              还有 {missing} 章，加载全部
                            </button>
                          </li>
                        ) : null}
                      </ol>
                    </section>
                  );
                })}
              </div>
            ) : (
              <ol class="toc-list">
                {book.chapters.map((chapter) => renderRow(chapter, chapter.idx))}
                {truncated ? (
                  <li class="toc-more">
                    <button class="toc-more-btn" type="button">
                      还有 {total - book.chapters.length} 章，加载全部
                    </button>
                  </li>
                ) : null}
              </ol>
            )}
          </section>

          {book.allowDiscussion || talks ? (
            <section class="book-talks" id="book-talks" data-book={book.slug}>
              <div class="section-head">
                <h2 class="section-label">最新讨论</h2>
                <span class="section-note">{talks ? `${talks} 条` : ''}</span>
              </div>
              {/* 摘要等首屏读完再补，书页首屏不多查一次讨论表 */}
              <ul class="discuss-list" id="book-talks-list" />
              <noscript>
                <p class="discuss-empty">查看讨论需要开启 JavaScript。</p>
              </noscript>
            </section>
          ) : null}
        </main>

        <aside class="book-side">
          {book.coverUrl ? (
            <div class="cover cover-lg cover-img" aria-hidden="true">
              {/* 3:4 与 .cover-lg 的 aspect-ratio 一致，先占位避免图片加载时页面跳动 */}
              <img src={book.coverUrl} alt="" width={360} height={480} decoding="async" />
            </div>
          ) : (
            <div class="cover cover-lg" aria-hidden="true">
              <span class="cover-no">№ {String(total).padStart(2, '0')} 章</span>
              <span class="cover-title">{book.title}</span>
              <span class="cover-author">{book.author}</span>
            </div>
          )}

          <a class="btn btn-full" href={`/b/${book.slug}/${book.chapters[0]?.idx ?? 1}`}>
            开始阅读
          </a>

          <dl class="stat-list book-stats">
            <div>
              <dt>作者</dt>
              <dd>
                <a class="inline-link" href={`/a/${encodeURIComponent(book.author)}`}>
                  {book.author}
                </a>
              </dd>
            </div>
            <div>
              <dt>分类</dt>
              <dd>
                <a class="inline-link" href={`/c/${encodeURIComponent(book.category)}`}>
                  {book.category}
                </a>
              </dd>
            </div>
            <div>
              <dt>章节</dt>
              <dd>
                {total} 章
                {book.volumes.length ? ` · ${book.volumes.length} 卷` : ''}
              </dd>
            </div>
            <div>
              <dt>字数</dt>
              <dd>{formatWords(words)}</dd>
            </div>
            <div>
              <dt>讨论</dt>
              <dd>{book.allowDiscussion ? `${talks} 条` : '未开放'}</dd>
            </div>
          </dl>

          <p class="book-side-note">← → 切章，进度自动保存在这台设备上。</p>
        </aside>
      </div>
    </div>
  );
}
