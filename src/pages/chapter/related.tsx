import type { Book, Chapter } from '../../db';

/** 同书其他章节：列表由 /api/related 补，页面不再下发整本目录 */
export function RelatedChapters({ book, chapter }: { book: Book; chapter: Chapter }) {
  return (
    <section class="related">
      <div class="section-head">
        <h2 class="section-label">同书其他章节</h2>
        <a class="section-note" href={`/b/${book.slug}`}>
          全部目录 →
        </a>
      </div>
      <div class="related-grid" data-related={book.slug} data-current={String(chapter.idx)} />
      <noscript>
        <p class="related-note">
          <a href={`/b/${book.slug}`}>查看完整目录</a>
        </p>
      </noscript>
    </section>
  );
}
