import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { renderMarkdown } from '../markdown';
import { BookFeed, Pager } from '../pages/list';
import { HomeBooks, RecentUpdates } from '../pages/home';
import { SearchNote, SearchResults } from '../pages/search';
import { LIST_PER_PAGE } from '../render';
import {
  SEARCH_PAGE,
  getApprovedCounts,
  getApprovedDiscussions,
  getBookMetas,
  getBookMetaBySlug,
  getChapterIndexBySlug,
  getRecentBookDiscussions,
  getRecentChapters,
  getRelatedChapters,
  getWordsByChapter,
  listBooksPage,
  saveReadingProgress,
  searchChapters,
  toggleDiscussionLike,
} from '../db';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.post('/api/progress', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ ok: false, error: 'login' }, 401);

  let payload: { slug?: unknown; idx?: unknown; ratio?: unknown };
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false }, 400);
  }

  const slug = typeof payload.slug === 'string' ? payload.slug : '';
  const idx = Number(payload.idx);
  const ratio = Number(payload.ratio);
  if (!slug || !Number.isInteger(idx) || !Number.isFinite(ratio)) {
    return c.json({ ok: false }, 400);
  }

  const ok = await saveReadingProgress(c.env.DB, user.id, slug, idx, ratio);
  if (!ok) return c.json({ ok: false }, 404);
  return c.json({ ok: true });
});

app.post('/talks/:id/like', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ ok: false, error: 'login' }, 401);

  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || id <= 0) return c.json({ ok: false }, 400);

  try {
    const result = await toggleDiscussionLike(c.env.DB, id, user.id);
    return c.json({ ok: true, ...result });
  } catch {
    return c.json({ ok: false }, 500);
  }
});


app.get('/api/books', async (c) => {
  const slugs = (c.req.query('slugs') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100);
  if (!slugs.length) return c.json({ books: [] });

  const books = await getBookMetas(c.env.DB, slugs);
  return c.json({ books }, 200, { 'cache-control': 'private, max-age=30' });
});

/** 章节字数表：页脚「已读字数」需要时才拉，只取读过的书 */
app.get('/api/words', async (c) => {
  const slugs = (c.req.query('slugs') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const map = await getWordsByChapter(c.env.DB, slugs);
  return c.json(map, 200, { 'cache-control': 'public, max-age=300' });
});

/** 目录索引：章节页抽屉、书页按卷展开时按需拉，避免每页都内联全本目录 */
app.get('/api/toc/:slug', async (c) => {
  const data = await getChapterIndexBySlug(c.env.DB, c.req.param('slug'));
  if (!data) return c.json({ error: 'not_found' }, 404);

  // ?v=v12 / ?v=none 只回该卷：书页展开单卷时不再拉整本目录
  const volume = c.req.query('v');
  const chapters = volume
    ? data.chapters.filter((ch) => (ch.volumeId ? `v${ch.volumeId}` : 'none') === volume)
    : data.chapters;

  return c.json(
    {
      slug: data.book.slug,
      title: data.book.title,
      chapters: chapters.map((ch) => ({
        i: ch.idx,
        t: ch.title,
        w: ch.words,
        v: ch.volumeId,
        n: ch.volumeNo || ch.idx,
      })),
    },
    200,
    { 'cache-control': 'public, max-age=60' },
  );
});

/** 章节页「同书其他章节」：只回 4 条，不再把整本目录塞进 HTML */
app.get('/api/related/:slug/:idx', async (c) => {
  const book = await getBookMetaBySlug(c.env.DB, c.req.param('slug'));
  if (!book) return c.json({ items: [] }, 404);

  const idx = Number(c.req.param('idx'));
  const items = await getRelatedChapters(
    c.env.DB,
    book.id,
    Number.isInteger(idx) ? idx : 0,
    4,
  );
  return c.json(
    { items: items.map((ch) => ({ i: ch.idx, t: ch.title, w: ch.words })) },
    200,
    { 'cache-control': 'public, max-age=60' },
  );
});

/** 分类页 / 作者页「加载更多」：服务端把下一页的列表和翻页条渲染好，前端直接换 */
app.get('/api/feed', async (c) => {
  const page = Math.max(1, Math.trunc(Number(c.req.query('page')) || 1));
  const category = (c.req.query('cat') ?? '').trim().slice(0, 40);
  const author = (c.req.query('author') ?? '').trim().slice(0, 40);
  if (!category && !author) return c.json({ feed: '', pager: '', page: 1, pages: 0 }, 400);

  const list = await listBooksPage(c.env.DB, {
    category: category || undefined,
    author: author || undefined,
    page,
    perPage: LIST_PER_PAGE,
  });
  // 超过最后一页就返回空，避免把上一页的内容再追加一遍
  if (page > list.pages) {
    return c.json({ feed: '', pager: '', page: list.pages, pages: list.pages });
  }

  // 分类页原本就带「N 条讨论」，作者页没有，这里保持一致
  const talks = category ? await getApprovedCounts(c.env.DB) : {};
  const base = category
    ? `/c/${encodeURIComponent(category)}`
    : `/a/${encodeURIComponent(author)}`;
  return c.json(
    {
      feed: String(
        <BookFeed books={list.books} talks={talks} startNo={(list.page - 1) * LIST_PER_PAGE} />,
      ),
      pager: String(<Pager page={list.page} pages={list.pages} base={base} />),
      page: list.page,
      pages: list.pages,
    },
    200,
    { 'cache-control': 'public, max-age=30' },
  );
});

/** 章节页讨论：正文先出，留言列表等这页读完再补 */
app.get('/api/talks/:slug/:idx', async (c) => {
  const book = await getBookMetaBySlug(c.env.DB, c.req.param('slug'));
  const idx = Number(c.req.param('idx'));
  if (!book || !Number.isInteger(idx)) return c.json({ count: 0, items: [] }, 404);

  const talks = await getApprovedDiscussions(c.env.DB, book.id, idx, c.get('user')?.id);
  return c.json(
    {
      count: talks.length,
      items: talks.map((d) => ({
        id: d.id,
        name: d.name,
        date: d.date,
        // 正文在服务端转好 HTML，前端不用再带一套 Markdown 解析
        html: renderMarkdown(d.body),
        likes: d.likes,
        liked: d.liked,
      })),
    },
    200,
    { 'cache-control': 'private, max-age=30' },
  );
});

/** 书页「最新讨论」：跨章节取最近几条，首屏不等它 */
app.get('/api/book-talks/:slug', async (c) => {
  const book = await getBookMetaBySlug(c.env.DB, c.req.param('slug'));
  if (!book) return c.json({ count: 0, items: [] }, 404);

  const items = await getRecentBookDiscussions(c.env.DB, book.id, 5);
  return c.json(
    {
      count: items.length,
      items: items.map((d) => ({
        id: d.id,
        name: d.name,
        date: d.date,
        html: renderMarkdown(d.body),
        likes: d.likes,
        idx: d.idx,
        chapterTitle: d.chapterTitle,
      })),
    },
    200,
    { 'cache-control': 'public, max-age=30' },
  );
});

/** 搜索联想：只回前 6 条，输入框防抖后调用 */
app.get('/api/suggest', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  if (q.length < 1) return c.json({ hits: [] });

  const { hits } = await searchChapters(c.env.DB, q, { limit: 6 });
  return c.json(
    { hits: hits.map((h) => ({ slug: h.slug, book: h.bookTitle, idx: h.idx, title: h.title })) },
    200,
    { 'cache-control': 'public, max-age=30' },
  );
});

/** 首页「最近更新」：首屏先出骨架，这里回一小段列表 */
app.get('/api/recent', async (c) => {
  const items = await getRecentChapters(c.env.DB, 8);
  return c.json(
    { html: String(<RecentUpdates items={items} />), count: items.length },
    200,
    { 'cache-control': 'public, max-age=30' },
  );
});

/** 首页书卡翻页：只回列表和翻页条，和整页渲染同一套查询 */
app.get('/api/home', async (c) => {
  const page = Math.max(1, Math.trunc(Number(c.req.query('page')) || 1));
  const [list, talks] = await Promise.all([
    listBooksPage(c.env.DB, { page, perPage: LIST_PER_PAGE, order: 'featured' }),
    getApprovedCounts(c.env.DB),
  ]);
  if (page > Math.max(1, list.pages)) {
    return c.json({ html: '', page: list.pages, pages: list.pages }, 404);
  }

  return c.json(
    {
      html: String(
        <HomeBooks
          books={list.books}
          talks={talks}
          page={list.page}
          pages={list.pages}
          perPage={LIST_PER_PAGE}
        />,
      ),
      page: list.page,
      pages: list.pages,
    },
    200,
    { 'cache-control': 'public, max-age=30' },
  );
});

/** 搜索页换关键词：只回结果区片段，前端原地替换 */
app.get('/api/search/html', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  const result = await searchChapters(c.env.DB, q);
  const count = result.hits.length;
  return c.json(
    {
      html: String(<SearchResults query={q} hits={result.hits} />),
      count,
      note: q ? String(<SearchNote query={q} count={count} />) : '',
    },
    200,
    { 'cache-control': 'public, max-age=30' },
  );
});

/** 搜索结果「加载更多」：每页 30 条，最多 3 页，和首屏用同一套查询 */
app.get('/api/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  if (!q) return c.json({ hits: [], mode: 'like' });

  const page = Math.min(3, Math.max(1, Math.trunc(Number(c.req.query('page')) || 1)));
  const raw = c.req.query('mode');
  const mode = raw === 'like' || raw === 'fts' ? raw : undefined;
  const result = await searchChapters(c.env.DB, q, {
    offset: (page - 1) * SEARCH_PAGE,
    limit: SEARCH_PAGE,
    mode,
  });

  return c.json(
    {
      mode: result.mode,
      hits: result.hits.map((h) => ({
        slug: h.slug,
        book: h.bookTitle,
        idx: h.idx,
        title: h.title,
        snippet: h.snippet,
      })),
    },
    200,
    { 'cache-control': 'public, max-age=30' },
  );
});

export default app;
