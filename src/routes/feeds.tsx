import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { markdownText } from '../markdown';
import { SITEMAP_BOOKS } from '../render';
import { getSettings } from '../settings';
import {
  countPublishedBooks,
  getCategories,
  getRssChapters,
  listBookAuthors,
  listSitemapBooks,
  listSitemapChapters,
} from '../db';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/** 站点图标：取站点名的第一个字画成 SVG，不用维护图片文件 */
app.get('/favicon.ico', async (c) => {
  const settings = await getSettings(c.env.DB);
  const chars = [...(settings['site.name'] || '').trim()];
  const char = chars[0] || '书';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="8" fill="#141414"/>
<text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="Songti SC, Noto Serif CJK SC, serif" font-size="40" font-weight="600" fill="#f7f6f3">${esc(char)}</text>
</svg>`;

  return c.body(svg, 200, {
    'content-type': 'image/svg+xml; charset=UTF-8',
    'cache-control': 'public, max-age=3600',
  });
});

app.get('/sitemap.xml', async (c) => {
  // 索引页：按书籍数切分片，每片只渲染自己那部分 URL
  const total = await countPublishedBooks(c.env.DB);
  const shards = Math.max(1, Math.ceil(total / SITEMAP_BOOKS));
  const items = Array.from(
    { length: shards },
    (_, i) => `  <sitemap><loc>${new URL(`/sitemap-${i + 1}.xml`, c.req.url).href}</loc></sitemap>`,
  ).join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`;
  return c.body(body, 200, {
    'content-type': 'application/xml; charset=UTF-8',
    'cache-control': 'public, max-age=600',
  });
});

// 分片页形如 /sitemap-1.xml；Hono 不支持段内参数，用通配路由接住再校验
app.get('/sitemap-*', async (c) => {
  const matched = /^\/sitemap-(\d+)\.xml$/.exec(c.req.path);
  const n = matched ? Number(matched[1]) : 0;
  if (!n) return c.notFound();

  const offset = (n - 1) * SITEMAP_BOOKS;
  const [books, chapters] = await Promise.all([
    listSitemapBooks(c.env.DB, offset, SITEMAP_BOOKS),
    listSitemapChapters(c.env.DB, offset, SITEMAP_BOOKS),
  ]);
  if (!books.length) return c.notFound();

  const urls = new Set<string>();
  if (n === 1) {
    urls.add('/');
    urls.add('/search');
    for (const name of await getCategories(c.env.DB)) {
      urls.add(`/c/${encodeURIComponent(name)}`);
    }
    for (const author of await listBookAuthors(c.env.DB)) {
      urls.add(`/a/${encodeURIComponent(author)}`);
    }
  }

  const chaptersByBook = new Map<number, number[]>();
  for (const row of chapters) {
    const list = chaptersByBook.get(row.book_id) ?? [];
    list.push(row.idx);
    chaptersByBook.set(row.book_id, list);
  }

  for (const book of books) {
    urls.add(`/b/${book.slug}`);
    for (const idx of chaptersByBook.get(book.id) ?? []) urls.add(`/b/${book.slug}/${idx}`);
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls].map((u) => `  <url><loc>${new URL(u, c.req.url).href}</loc></url>`).join('\n')}
</urlset>`;
  return c.body(body, 200, {
    'content-type': 'application/xml; charset=UTF-8',
    'cache-control': 'public, max-age=600',
  });
});

app.get('/rss.xml', async (c) => {
  const chapters = await getRssChapters(c.env.DB);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const items = chapters
    .map((ch) => ({
      title: `${ch.title} · ${ch.bookTitle}`,
      link: new URL(`/b/${ch.slug}/${ch.idx}`, c.req.url).href,
      desc: markdownText(ch.excerpt),
    }))
    .map(
      (i) => `    <item>
      <title>${esc(i.title)}</title>
      <link>${i.link}</link>
      <description>${esc(i.desc)}</description>
    </item>`,
    )
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>书架</title>
    <link>${new URL('/', c.req.url).href}</link>
    <description>好好排字，慢慢读书。</description>
${items}
  </channel>
</rss>`;
  return c.body(body, 200, { 'content-type': 'application/rss+xml; charset=UTF-8' });
});

export default app;
