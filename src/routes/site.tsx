import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { Home } from '../pages/home';
import { CategoryPage, AuthorPage } from '../pages/list';
import { BookDetail } from '../pages/book';
import { ChapterPage } from '../pages/chapter';
import { SearchPage } from '../pages/search';
import { InfoPage } from '../pages/info';
import { ShelfPage } from '../pages/shelf';
import { GatePage } from '../pages/gate';
import { ACCESS_COOKIE, accessToken, splitSecret } from '../access';
import type { Env, Variables } from '../env';
import { getSettings, isOn, readerDefaults } from '../settings';
import { markdownText } from '../markdown';
import { safeNext, verifyPassword } from '../auth';
import { LIST_PER_PAGE, pageParam, render, shell } from '../render';
import { formString } from '../forms';
import {
  createDiscussion,
  firstParagraph,
  getApprovedCountForSlug,
  getApprovedCounts,
  getBookForPage,
  getBookMetaBySlug,
  getCategory,
  getChapterPage,
  getReadingProgress,
  hasChapter,
  listBooksPage,
  searchChapters,
} from '../db';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get('/', async (c) => {
  // 最近更新交给 /api/recent，首屏先把书库和统计发出去
  const [data, list, talks] = await Promise.all([
    shell(c),
    listBooksPage(c.env.DB, { page: pageParam(c), perPage: LIST_PER_PAGE, order: 'featured' }),
    getApprovedCounts(c.env.DB),
  ]);
  return render(
    c,
    {
      title: data.settings['seo.title'],
      description: data.settings['seo.description'],
      active: 'home',
    },
    <Home
      books={list.books}
      total={list.total}
      page={list.page}
      pages={list.pages}
      perPage={LIST_PER_PAGE}
      stats={data.stats}
      talks={talks}
      settings={data.settings}
    />,
    data,
  );
});

app.get('/c/:cat', async (c) => {
  const db = c.env.DB;
  const key = c.req.param('cat');
  const [data, talks, cat] = await Promise.all([
    shell(c),
    getApprovedCounts(db),
    getCategory(db, key),
  ]);
  if (!cat || cat.hidden) return c.notFound();

  // 分类过滤和分页都交给 SQL，只取当前页的书与章节
  const list = await listBooksPage(db, {
    category: cat.name,
    page: pageParam(c),
    perPage: LIST_PER_PAGE,
  });
  if (!list.total) return c.notFound();

  return render(
    c,
    {
      title: `${cat.name} · 书库`,
      description: cat.description || `书库里 ${cat.name} 分类的书。`,
      active: 'home',
      category: cat.name,
    },
    <CategoryPage
      category={cat.name}
      description={cat.description}
      books={list.books}
      talks={talks}
      total={list.total}
      page={list.page}
      pages={list.pages}
      base={`/c/${encodeURIComponent(key)}`}
    />,
    data,
  );
});

app.get('/a/:author', async (c) => {
  const author = c.req.param('author');
  // 和分类页一样分页，作者作品再多也只渲染当前这一页
  const [list, data] = await Promise.all([
    listBooksPage(c.env.DB, {
      author,
      page: pageParam(c),
      perPage: LIST_PER_PAGE,
    }),
    shell(c),
  ]);
  if (!list.total) return c.notFound();

  return render(
    c,
    { title: `${author} · 书库`, description: `${author}在书架上的全部作品。`, active: 'home' },
    <AuthorPage
      author={author}
      books={list.books}
      total={list.total}
      page={list.page}
      pages={list.pages}
      base={`/a/${encodeURIComponent(author)}`}
    />,
    data,
  );
});

app.get('/b/:slug', async (c) => {
  // 详情页只取前若干章做目录，长书的其余章节由前端按卷补
  const [detail, data, talks] = await Promise.all([
    getBookForPage(c.env.DB, c.req.param('slug')),
    shell(c),
    getApprovedCountForSlug(c.env.DB, c.req.param('slug')),
  ]);
  if (!detail) return c.notFound();
  const { book } = detail;

  // 首章已在目录里，提前预取，点开即读
  const first = book.chapters[0];

  return render(
    c,
    {
      title: `${book.title} · 书架`,
      description: book.summary,
      active: 'home',
      head: first ? <link rel="prefetch" href={`/b/${book.slug}/${first.idx}`} /> : null,
    },
    <BookDetail
      book={book}
      talks={talks}
      total={detail.total}
      words={detail.words}
      volumeCounts={detail.volumeCounts}
    />,
    data,
  );
});

app.get('/b/:slug/:idx', async (c) => {
  const db = c.env.DB;
  const slug = c.req.param('slug');
  const idx = Number(c.req.param('idx'));
  if (!Number.isInteger(idx) || idx <= 0) return c.notFound();
  const user = c.get('user');

  // 章节（含书籍信息）、页面骨架、阅读进度互不依赖，一次并发拿齐
  const [page, data, progress] = await Promise.all([
    getChapterPage(db, slug, idx),
    shell(c),
    user ? getReadingProgress(db, user.id, slug) : Promise.resolve(null),
  ]);
  if (!page) return c.notFound();
  const { book, chapter, volume, total, prev, next } = page;

  return render(
    c,
    {
      title: `${chapter.title} · ${book.title}`,
      description: markdownText(firstParagraph(chapter.body)).slice(0, 80),
      bodyClass: 'is-reading',
      bodyAttrs: {
        'data-book': book.slug,
        'data-chapter': String(chapter.idx),
        'data-words': String(chapter.words),
        'data-book-title': book.title,
        'data-chapter-title': chapter.title,
      },
      minimal: true,
      // 预取下一章；上一章通常刚读过，浏览器还有缓存，不必重复预取
      head: next ? <link rel="prefetch" href={`/b/${book.slug}/${next.idx}`} /> : null,
    },
    <ChapterPage
      book={book}
      chapter={chapter}
      volume={volume ?? undefined}
      total={total}
      prev={prev}
      next={next}
      user={data.user}
      sent={c.req.query('sent') === '1'}
      discussEnabled={isOn(data.settings, 'discussion.enabled') && book.allowDiscussion}
      autoApprove={data.settings['discussion.mode'] === 'auto'}
      progress={progress}
    />,
    data,
  );
});

app.post('/b/:slug/:idx/discuss', async (c) => {
  const slug = c.req.param('slug');
  const idx = Number(c.req.param('idx'));
  const back = `/b/${encodeURIComponent(slug)}/${idx}`;

  const book = await getBookMetaBySlug(c.env.DB, slug);
  if (!book) return c.notFound();
  if (!(await hasChapter(c.env.DB, book.id, idx))) return c.notFound();

  const user = c.get('user');
  if (!user) {
    return c.redirect(`/login?next=${encodeURIComponent(back)}`, 303);
  }

  const settings = await getSettings(c.env.DB);
  if (!isOn(settings, 'discussion.enabled') || !book.allowDiscussion) {
    return c.redirect(back, 303);
  }

  const form = await c.req.formData();
  const body = formString(form, 'body').slice(0, 2000);
  if (!body) return c.redirect(back, 303);

  const parent = Number(formString(form, 'parent'));
  await createDiscussion(c.env.DB, {
    bookId: book.id,
    chapterIdx: idx,
    parentId: Number.isInteger(parent) && parent > 0 ? parent : null,
    userId: user.id,
    name: user.name,
    body,
    status: settings['discussion.mode'] === 'auto' ? 'approved' : 'pending',
  });

  return c.redirect(`${back}?sent=1`, 303);
});

app.get('/search', async (c) => {
  const q = c.req.query('q') ?? '';
  const [data, result] = await Promise.all([shell(c), searchChapters(c.env.DB, q)]);
  return render(
    c,
    { title: '搜索 · 书架', active: 'search' },
    <SearchPage q={q} chapters={data.stats.chapters} hits={result.hits} />,
    data,
  );
});

app.get('/about', async (c) => {
  const data = await shell(c);
  return render(
    c,
    { title: `${data.settings['about.title']} · 书架`, active: 'home' },
    <InfoPage title={data.settings['about.title']} body={data.settings['about.body']} />,
    data,
  );
});

app.get('/privacy', async (c) => {
  const data = await shell(c);
  return render(
    c,
    { title: `${data.settings['privacy.title']} · 书架`, active: 'home' },
    <InfoPage
      title={data.settings['privacy.title']}
      body={data.settings['privacy.body']}
      kicker="隐私说明"
    />,
    data,
  );
});


app.get('/gate', async (c) => {
  const settings = await getSettings(c.env.DB);
  if (settings['access.mode'] !== 'password' || !splitSecret(settings['access.password'])) {
    return c.redirect('/', 303);
  }

  const next = safeNext(c.req.query('next'), '/');
  const error = c.req.query('e') === '1';

  return c.html(
    String(
      <GatePage
        mode="password"
        siteName={settings['site.name']}
        mark={settings['site.mark']}
        note={settings['access.passwordNote']}
        theme={readerDefaults(settings).theme}
        next={next}
        error={error}
      />,
    ),
    error ? 401 : 200,
  );
});

app.post('/gate', async (c) => {
  const settings = await getSettings(c.env.DB);
  if (settings['access.mode'] !== 'password') return c.redirect('/', 303);

  const form = await c.req.formData();
  const next = safeNext(String(form.get('next') ?? ''), '/');
  const parts = splitSecret(settings['access.password']);
  const input = String(form.get('password') ?? '');

  if (parts && (await verifyPassword(input, parts.hash, parts.salt))) {
    setCookie(c, ACCESS_COOKIE, await accessToken(settings['access.password']), {
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      secure: new URL(c.req.url).protocol === 'https:',
      maxAge: 60 * 60 * 24 * 30,
    });
    return c.redirect(next, 303);
  }

  return c.redirect(`/gate?e=1&next=${encodeURIComponent(next)}`, 303);
});


app.get('/cover/:key{.+}', async (c) => {
  const bucket = c.env.COVERS;
  if (!bucket) return c.notFound();

  const cc = 'public, max-age=31536000, immutable';
  // 封面 key 不可变：放进边缘缓存后，重复访问不再回源 R2
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheable = !c.req.header('range');
  const key = new Request(new URL(c.req.url).toString(), { method: 'GET' });
  if (cacheable) {
    const hit = await cache.match(key);
    if (hit) {
      const cachedEtag = hit.headers.get('etag');
      if (cachedEtag && c.req.header('if-none-match') === cachedEtag) {
        return c.body(null, 304, { etag: cachedEtag, 'cache-control': cc });
      }
      return hit;
    }
  }

  const object = await bucket.get(c.req.param('key'));
  if (!object) return c.notFound();

  const etag = object.httpEtag;
  // 浏览器再次请求时带上 if-none-match，命中就只回 304，省掉图片本体
  if (c.req.header('if-none-match') === etag) {
    return c.body(null, 304, { etag, 'cache-control': cc });
  }

  const res = c.body(object.body, 200, {
    'content-type': object.httpMetadata?.contentType || 'image/jpeg',
    'content-length': String(object.size),
    'cache-control': cc,
    etag,
  });
  if (cacheable) c.executionCtx.waitUntil(cache.put(key, res.clone()));
  return res;
});

app.get('/shelf', async (c) => {
  // 书架内容存在浏览器里：页面只出骨架，书目由 /api/books 按需取
  const data = await shell(c);
  const label = data.user ? '我的书架' : '游客书架';
  return render(
    c,
    {
      title: `${label} · 书架`,
      description: '你加入书架的书，和读到哪里。',
      active: 'shelf',
    },
    <ShelfPage user={data.user} registerOpen={isOn(data.settings, 'registration.open')} />,
    data,
  );
});

export default app;
