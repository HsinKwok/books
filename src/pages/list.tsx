import type { Book } from '../db';
import { bookWords, formatWords, shortDate } from '../format';
import { markdownText } from '../markdown';
import { Cover, PageHead } from './ui';

/** 书籍 slug → 讨论条数，列表页按需传，不查就传空对象 */
export type Talks = Record<string, number>;

export function BookFeed({
  books,
  talks,
  startNo = 0,
}: {
  books: Book[];
  talks: Talks;
  /** 追加下一页时封面序号接着上一页往下排 */
  startNo?: number;
}) {
  return (
    <div class="feed">
      {books.map((book, i) => {
        const count = talks[book.slug] ?? 0;
        return (
          <a class="feed-item" href={`/b/${book.slug}`}>
            <span class="feed-text">
              <span class="feed-meta">
                <span class="feed-date">{shortDate(book.updatedAt)}</span>
                <span> · {book.category}</span>
                <span> · {book.chapters.length} 章</span>
                {count ? <span> · {count} 条讨论</span> : null}
              </span>
              <span class="feed-title">{book.title}</span>
              <span class="feed-desc">{markdownText(book.summary)}</span>
              <span class="feed-more">开始阅读 →</span>
            </span>
            <Cover book={book} no={startNo + i + 1} />
          </a>
        );
      })}
    </div>
  );
}

export function BookCards({
  books,
  talks,
  startNo = 0,
}: {
  books: Book[];
  talks: Talks;
  /** 分页时封面序号接着上一页往下排 */
  startNo?: number;
}) {
  return (
    <div class="book-cards">
      {books.map((book, i) => {
        const count = talks[book.slug] ?? 0;
        return (
          <a class="book-card" href={`/b/${book.slug}`}>
            <Cover book={book} no={startNo + i + 1} card />
            <span class="book-card-title">{book.title}</span>
            <span class="book-card-meta">
              {book.category} · {book.chapters.length} 章
              {count ? ` · ${count} 条讨论` : ''}
            </span>
          </a>
        );
      })}
    </div>
  );
}

/** 前台列表翻页：首页 / 分类页 / 作者页共用，页码链接只加 ?page= */
export function Pager({ page, pages, base }: { page: number; pages: number; base: string }) {
  if (pages <= 1) return null;

  const href = (n: number) => (n === 1 ? base : `${base}?page=${n}`);
  const from = Math.max(1, page - 2);
  const to = Math.min(pages, page + 2);
  const nums: number[] = [];
  for (let n = from; n <= to; n += 1) nums.push(n);

  return (
    <nav class="pager" aria-label="翻页" data-page={page} data-pages={pages} data-base={base}>
      {page > 1 ? (
        <a class="pager-step" href={href(page - 1)} rel="prev">
          上一页
        </a>
      ) : (
        <span class="pager-step is-off">上一页</span>
      )}
      {from > 1 ? (
        <>
          <a class="pager-num" href={href(1)}>
            1
          </a>
          {from > 2 ? <span class="pager-gap">…</span> : null}
        </>
      ) : null}
      {nums.map((n) =>
        n === page ? (
          <span class="pager-num is-active" aria-current="page">
            {n}
          </span>
        ) : (
          <a class="pager-num" href={href(n)}>
            {n}
          </a>
        ),
      )}
      {to < pages - 1 ? <span class="pager-gap">…</span> : null}
      {to < pages ? (
        <a class="pager-num" href={href(pages)}>
          {pages}
        </a>
      ) : null}
      {page < pages ? (
        <a class="pager-step" href={href(page + 1)} rel="next">
          下一页
        </a>
      ) : (
        <span class="pager-step is-off">下一页</span>
      )}
    </nav>
  );
}

export function CategoryPage({
  category,
  description,
  books,
  talks,
  total,
  page,
  pages,
  base,
}: {
  category: string;
  description?: string;
  books: Book[];
  talks: Talks;
  total: number;
  page: number;
  pages: number;
  base: string;
}) {
  const chapters = books.reduce((n, book) => n + book.chapters.length, 0);

  return (
    <div class="page">
      <PageHead
        kicker="分类"
        title={category}
        lede={description}
        note={
          <>
            {total} 本在架 · 本页 {books.length} 本 {chapters} 章 ·{' '}
            <a class="inline-link" href="/">
              看全部
            </a>
          </>
        }
      />

      <BookFeed books={books} talks={talks} />
      <Pager page={page} pages={pages} base={base} />
    </div>
  );
}

/** 作者页：和分类页同一套分页与列表样式，只是换一种筛选条件 */
export function AuthorPage({
  author,
  books,
  total,
  page,
  pages,
  base,
}: {
  author: string;
  books: Book[];
  total: number;
  page: number;
  pages: number;
  base: string;
}) {
  const chapters = books.reduce((n, book) => n + book.chapters.length, 0);
  const words = books.reduce((n, book) => n + bookWords(book), 0);

  return (
    <div class="page">
      <PageHead
        kicker="作者"
        title={author}
        note={
          <>
            {total} 部作品 · 本页 {books.length} 部 · 共 {chapters} 章 · {formatWords(words)}
          </>
        }
      />

      <BookFeed books={books} talks={{}} />
      <Pager page={page} pages={pages} base={base} />
    </div>
  );
}
