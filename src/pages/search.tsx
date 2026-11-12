import type { SearchHit } from '../db';

export function SearchPage({
  q,
  chapters,
  hits,
}: {
  q: string;
  chapters: number;
  hits: SearchHit[];
}) {
  const query = q.trim();
  return (
    <div class="page">
      <section class="page-head">
        <p class="kicker">全文搜索</p>
        <h1 class="page-title">找一句话</h1>
        <form class="search-form" method="get" action="/search">
          <input
            id="search-input"
            type="search"
            name="q"
            value={q}
            placeholder="输入书名、章节名或正文里的几个字"
            autocomplete="off"
            autofocus
          />
          <button type="submit">搜索</button>
          {/* 输入时由 /api/suggest 填充 */}
          <div class="search-suggest" id="search-suggest" hidden />
        </form>
        <p class="page-note" id="search-note">
          {query ? (
            <SearchNote query={query} count={hits.length} />
          ) : (
            `索引覆盖 ${chapters} 章正文，中文按字串匹配。`
          )}
        </p>
      </section>

      {/* 有 JS 时换关键词只替换这一块，页面其余部分不动 */}
      <div id="search-results">
        <SearchResults query={query} hits={hits} />
      </div>
    </div>
  );
}

/** 结果数量提示：整页渲染与 ajax 替换共用 */
export function SearchNote({ query, count }: { query: string; count: number }) {
  return (
    <>
      「{query}」找到 <span id="search-count">{count}</span> 条结果。
    </>
  );
}

/** 结果列表 + 空态 + 加载更多，整页渲染与 /api/search/html 共用 */
export function SearchResults({ query, hits }: { query: string; hits: SearchHit[] }) {
  if (!hits.length) {
    return (
      <section class="empty">
        <p class="empty-line">{query ? '没有找到相关文字。' : '还没有结果。'}</p>
        <p class="empty-note">
          {query ? '换个词试试，或者回书库翻一翻。' : '输入几个字，在全部章节里找一找。'}
        </p>
      </section>
    );
  }

  return (
    <>
      <ol class="search-list">
        {hits.map((hit) => (
          <li>
            <a class="search-hit" href={`/b/${hit.slug}/${hit.idx}`}>
              <span class="search-hit-book">
                {hit.bookTitle} · 第 {hit.idx} 章
              </span>
              <span class="search-hit-title">{hit.title}</span>
              <span class="search-hit-snippet">{hit.snippet}</span>
            </a>
          </li>
        ))}
      </ol>
      {hits.length >= 30 ? (
        // 有 JS 时由 /api/search 追加，没有 JS 就停在第一页
        <div class="search-more" id="search-more" data-q={query} data-page="1" hidden>
          <button type="button">加载更多</button>
        </div>
      ) : null}
    </>
  );
}
