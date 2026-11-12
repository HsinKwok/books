import type { Book, Chapter, ChapterLink, Volume } from '../../db';
import { contentKey, memoHtml } from '../../cache';
import { formatWords, readingMinutes } from '../../format';
import { renderMarkdown } from '../../markdown';

/** 正文列：章节信息 + 正文 + 章末上下章导航 */
export function ChapterArticle({
  book,
  chapter,
  volume,
  prev,
  next,
}: {
  book: Book;
  chapter: Chapter;
  /** 当前章所属的卷，未分卷时为空 */
  volume?: Volume;
  prev?: ChapterLink;
  next?: ChapterLink;
}) {
  const words = chapter.words;
  // 正文 HTML 不落库：同一章同一版本由 memoHtml 复用，页面本身还有一层边缘缓存
  const bodyHtml = memoHtml(
    `${book.slug}:${chapter.idx}:${contentKey(chapter.body)}`,
    () => renderMarkdown(chapter.body),
  );

  return (
    <article class="article-col">
      <p class="eyebrow">
        № {String(chapter.idx).padStart(2, '0')} ·{' '}
        <a href={`/b/${book.slug}`}>{book.title}</a> ·{' '}
        <a href={`/c/${encodeURIComponent(book.category)}`}>{book.category}</a>
      </p>
      {volume ? (
        <p class="article-volume">
          {volume.title || `第 ${volume.idx} 卷`} · 第 {chapter.volumeNo} 章
        </p>
      ) : null}
      <h1 class="article-title">{chapter.title}</h1>
      <p class="article-byline">
        {book.author} · {formatWords(words)} · 约 {readingMinutes(words)} 分钟
      </p>

      <div
        class="prose"
        id="prose"
        data-book={book.slug}
        data-idx={String(chapter.idx)}
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      <p class="chapter-end">— 本章完 —</p>

      <nav class="chapter-nav">
        {prev ? (
          <a class="chapter-nav-link prev" data-nav="prev" href={`/b/${book.slug}/${prev.idx}`}>
            <span class="chapter-nav-label">上一章</span>
            <span class="chapter-nav-title">{prev.title}</span>
          </a>
        ) : (
          <span class="chapter-nav-link prev is-disabled" data-nav="prev">
            <span class="chapter-nav-label">上一章</span>
            <span class="chapter-nav-title">已经是第一章</span>
          </span>
        )}
        {next ? (
          <a class="chapter-nav-link next" data-nav="next" href={`/b/${book.slug}/${next.idx}`}>
            <span class="chapter-nav-label">下一章</span>
            <span class="chapter-nav-title">{next.title}</span>
          </a>
        ) : (
          <span class="chapter-nav-link next is-disabled" data-nav="next">
            <span class="chapter-nav-label">下一章</span>
            <span class="chapter-nav-title">已读完全书</span>
          </span>
        )}
      </nav>
    </article>
  );
}
