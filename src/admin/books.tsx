import { Hono } from 'hono';
import type { AppContext, Env, Variables } from '../env';
import {
  categoryNames,
  createBook,
  deleteBook,
  deleteBooks,
  getBookById,
  getBookMetaById,
  getBookMetasByIds,
  getChaptersPage,
  listBooksPage,
  listCategories,
  logAudit,
  slugExists,
  updateBook,
  type BookInput,
} from '../db';
import { can, canEditBook } from '../permissions';
import { eachChunk, CHUNK_SIZE } from '../db/sql';
import { BookFormPage, BooksPage, BookTable, ChapterTable, filterQuery } from '../pages/admin/books';
import { formString } from '../forms';
import {
  adminTheme,
  adminUser,
  bookFromInput,
  html,
  notice,
  nowBook,
  parseBookForm,
  validateBook,
} from './shared';
import { readBatch } from './guard';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/** 有上传文件就进 R2，否则沿用表单里的外链；返回错误文案 */
async function applyCover(env: Env, form: FormData, input: BookInput): Promise<string | null> {
  if (formString(form, 'removeCover') === '1') input.coverUrl = '';

  const file = form.get('cover');
  if (!file || typeof file === 'string' || !file.size) return null;

  if (!env.COVERS) {
    return '封面存储还没配置（R2），可以先用外链填写封面。';
  }
  const name = (file.name || 'cover').toLowerCase();
  const ext = (name.includes('.') ? name.split('.').pop()! : 'jpg').replace(/[^a-z0-9]/g, '') || 'jpg';
  const key = `covers/${input.slug}-${Date.now().toString(36)}.${ext}`;
  await env.COVERS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  });
  input.coverUrl = `/cover/${key}`;
  return null;
}

/** 删书时顺带清掉 R2 里的封面；外链封面和没配 R2 的情况直接跳过 */
async function removeCover(env: Env, coverUrl: string) {
  const prefix = '/cover/';
  if (!coverUrl.startsWith(prefix) || !env.COVERS) return;
  try {
    await env.COVERS.delete(decodeURIComponent(coverUrl.slice(prefix.length)));
  } catch {
    // 封面文件删不掉不影响删书
  }
}

/** 分类下拉：分类表 + 书里实际出现的分类 + 兜底「未分类」
 *  改名不会同步 books.category，所以 categoryNames 会把书里出现的旧分类也列出来 */
async function filterCategories(db: D1Database): Promise<string[]> {
  const names = await categoryNames(db);
  if (!names.includes('未分类')) names.push('未分类');
  return names;
}

/** 后台列表的公共查询：整页渲染和 ajax 筛选共用同一套条件 */
async function loadBooks(c: AppContext) {
  const user = adminUser(c);
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  const raw = c.req.query('status') ?? '';
  const status = raw === 'draft' || raw === 'published' ? raw : '';
  const category = (c.req.query('category') ?? '').trim().slice(0, 40);

  // 书多时一次全读会很慢，后台按 50 本一页取
  const data = await listBooksPage(c.env.DB, {
    includeDrafts: true,
    ownerId: user.role === 'author' ? user.id : undefined,
    q: q || undefined,
    status: status || undefined,
    category: category || undefined,
    page: Number(c.req.query('page')) || 1,
    perPage: 50,
    order: 'recent',
  });
  return { user, q, status, category, data };
}

app.get('/books', async (c) => {
  const { user, q, status, category, data } = await loadBooks(c);
  const categories = await filterCategories(c.env.DB);
  return html(
    c,
    <BooksPage
      user={user}
      books={data.books}
      total={data.total}
      page={data.page}
      pages={data.pages}
      q={q}
      status={status}
      category={category}
      categories={categories}
      notice={notice(c)}
      theme={await adminTheme(c)}
    />,
  );
});

/** 书籍列表筛选 / 翻页：只回表格那一块，前端原地替换 */
app.get('/api/books', async (c) => {
  const { q, status, category, data } = await loadBooks(c);
  return c.json(
    {
      html: String(
        <BookTable
          books={data.books}
          page={data.page}
          pages={data.pages}
          query={filterQuery(q, status, category)}
        />,
      ),
      total: data.total,
      page: data.page,
      pages: data.pages,
    },
    200,
    { 'cache-control': 'no-store' },
  );
});

app.get('/books/new', async (c) => {
  const user = adminUser(c);
  const categories = await listCategories(c.env.DB);
  return html(
    c,
    <BookFormPage
      user={user}
      book={nowBook()}
      categories={categories}
      canPublish={can(user, 'book.publish')}
      canImport={can(user, 'book.import')}
      isNew
      theme={await adminTheme(c)}
    />,
  );
});

app.post('/books', async (c) => {
  const user = adminUser(c);
  const canPublish = can(user, 'book.publish');
  const form = await c.req.formData();
  const input = parseBookForm(form, `book-${Date.now().toString(36)}`);
  if (!canPublish) input.status = 'draft';
  let error = validateBook(input);
  const categories = await listCategories(c.env.DB);

  if (!error) error = await applyCover(c.env, form, input);
  if (!error && (await slugExists(c.env.DB, input.slug))) {
    error = '这个链接已经被占用了，换一个。';
  }

  if (error) {
    c.status(400);
    return html(
      c,
      <BookFormPage
        user={user}
        book={bookFromInput(input)}
        categories={categories}
        canPublish={canPublish}
        canImport={can(user, 'book.import')}
        isNew
        error={error}
        theme={await adminTheme(c)}
      />,
    );
  }

  const ownerId = user.role === 'author' ? user.id : null;
  const id = await createBook(c.env.DB, input, ownerId);
  await logAudit(c.env.DB, user.id, 'book.create', input.title);
  return c.redirect(`/admin/books/${id}?m=created`, 303);
});

app.get('/books/:id', async (c) => {
  const user = adminUser(c);
  const raw = await getBookMetaById(c.env.DB, Number(c.req.param('id')), { volumes: true });
  if (!raw) return c.notFound();
  if (!canEditBook(user, raw)) return c.text('403 · 无权编辑这本书', 403);

  // 章节表按页取，长书不再一次把全部章节读进 Worker
  const data = await getChaptersPage(c.env.DB, raw.id, c.req.query('chapterPage'));
  const categories = await listCategories(c.env.DB);
  return html(
    c,
    <BookFormPage
      user={user}
      book={{ ...raw, chapters: data.chapters }}
      categories={categories}
      canPublish={can(user, 'book.publish')}
      canImport={can(user, 'book.import')}
      isNew={false}
      chapterPage={data.page}
      chapterPages={data.pages}
      chapterTotal={data.stats.total}
      volumeCounts={data.stats.byVolume}
      theme={await adminTheme(c)}
    />,
  );
});

/** 章节表翻页：只回表格那一块，前端原地替换 */
app.get('/api/books/:id/chapters', async (c) => {
  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')), { volumes: true });
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  const data = await getChaptersPage(c.env.DB, book.id, c.req.query('page'));
  return c.json(
    {
      html: String(
        <ChapterTable book={book} chapters={data.chapters} page={data.page} pages={data.pages} />,
      ),
      page: data.page,
      pages: data.pages,
      total: data.stats.total,
    },
    200,
    { 'cache-control': 'no-store' },
  );
});

app.post('/books/:id', async (c) => {
  const user = adminUser(c);
  const canPublish = can(user, 'book.publish');
  const id = Number(c.req.param('id'));
  const existing = await getBookById(c.env.DB, id);
  if (!existing) return c.notFound();
  if (!canEditBook(user, existing)) return c.text('403 · 无权编辑这本书', 403);

  const form = await c.req.formData();
  const input = parseBookForm(form, existing.slug);
  if (!canPublish) {
    input.status = existing.status;
    input.featured = existing.featured;
  }
  let error = validateBook(input);
  const categories = await listCategories(c.env.DB);

  if (!error) error = await applyCover(c.env, form, input);
  if (!error && (await slugExists(c.env.DB, input.slug, id))) {
    error = '这个链接已经被占用了，换一个。';
  }

  if (error) {
    c.status(400);
    return html(
      c,
      <BookFormPage
        user={user}
        book={{ ...bookFromInput(input, id, existing.chapters) }}
        categories={categories}
        canPublish={canPublish}
        canImport={can(user, 'book.import')}
        isNew={false}
        error={error}
        theme={await adminTheme(c)}
      />,
    );
  }

  await updateBook(c.env.DB, id, input);
  await logAudit(c.env.DB, user.id, 'book.update', input.title);
  return c.redirect(`/admin/books/${id}?m=saved`, 303);
});

/** 批量删除：作者只能删自己的书，越权的直接跳过并计入 skipped */
app.post('/api/books/batch', async (c) => {
  const guard = await readBatch(c);
  if (guard instanceof Response) return guard;
  const { body, ids } = guard;

  const action = String(body.action ?? '');
  if (action !== 'delete') return c.json({ ok: false, error: 'bad-action' }, 400);

  const user = adminUser(c);
  // 一次最多 200 条，按 D1 参数上限分块取书
  const metas = await eachChunk(ids, CHUNK_SIZE, (chunk) => getBookMetasByIds(c.env.DB, chunk));
  const allowed = metas.filter((meta) => canEditBook(user, meta));
  if (!allowed.length) return c.json({ ok: true, count: 0, skipped: ids.length });

  await deleteBooks(c.env.DB, allowed.map((meta) => meta.id));
  for (const meta of allowed) await removeCover(c.env, meta.coverUrl);

  const titles = allowed.slice(0, 10).map((meta) => meta.title).join('、');
  await logAudit(
    c.env.DB,
    user.id,
    'book.batch.delete',
    `批量删除 ${allowed.length} 本：${titles}${allowed.length > 10 ? '…' : ''}`,
  );
  return c.json({ ok: true, count: allowed.length, skipped: ids.length - allowed.length });
});

app.post('/books/:id/delete', async (c) => {
  const user = adminUser(c);
  const id = Number(c.req.param('id'));
  const existing = await getBookMetaById(c.env.DB, id);
  if (!existing) return c.notFound();
  if (!canEditBook(user, existing)) return c.text('403 · 无权删除这本书', 403);

  await deleteBook(c.env.DB, id);
  await removeCover(c.env, existing.coverUrl);
  await logAudit(c.env.DB, user.id, 'book.delete', existing.title);
  return c.redirect('/admin/books?m=deleted', 303);
});

export default app;
