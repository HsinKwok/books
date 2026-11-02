import { Hono } from 'hono';
import type { AppContext, Env, Variables } from '../env';
import {
  createVolume,
  deleteChapter,
  deleteChapters,
  deleteVolume,
  deleteVolumes,
  getBookMetaById,
  getChapter,
  getChaptersPage,
  getChapterStats,
  getVolumes,
  insertChapter,
  logAudit,
  moveVolume,
  nextChapterIdx,
  saveChapter,
  updateVolume,
  type Book,
  type BookStatus,
} from '../db';
import { can, canEditBook } from '../permissions';
import { ChapterFormPage } from '../pages/admin/chapters';
import { ChapterTable, VolumePanelBody } from '../pages/admin/books';
import { formString } from '../forms';
import { adminTheme, adminUser, html } from './shared';
import { readBatch } from './guard';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get('/books/:id/chapters/new', async (c) => {
  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')), { volumes: true });
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  const idx = await nextChapterIdx(c.env.DB, book.id);
  const chapter = {
    id: 0,
    idx,
    title: '',
    body: '',
    bodyHtml: null,
    bodyHash: null,
    paragraphs: [],
    words: 0,
    status: 'draft' as BookStatus,
    updatedAt: Math.floor(Date.now() / 1000),
    volumeId: book.volumes.length ? book.volumes[book.volumes.length - 1].id : null,
    volumeNo: 0,
  };
  return html(
    c,
    <ChapterFormPage
      user={user}
      book={book}
      chapter={chapter}
      canPublish={can(user, 'book.publish')}
      isNew
      theme={await adminTheme(c)}
    />,
  );
});

app.get('/books/:id/chapters/:idx', async (c) => {
  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')), { volumes: true });
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  const chapter = await getChapter(c.env.DB, book.id, Number(c.req.param('idx')), {
    includeDrafts: true,
  });
  if (!chapter) return c.notFound();
  return html(
    c,
    <ChapterFormPage
      user={user}
      book={book}
      chapter={chapter}
      canPublish={can(user, 'book.publish')}
      isNew={false}
      theme={await adminTheme(c)}
    />,
  );
});

app.post('/books/:id/chapters', async (c) => {
  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')), { volumes: true });
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  const canPublish = can(user, 'book.publish');
  const form = await c.req.formData();
  const idx = Number(formString(form, 'idx'));
  const title = formString(form, 'title');
  const body = String(form.get('body') ?? '');
  const volumeId = Number(formString(form, 'volumeId')) || null;
  const isNew = formString(form, 'mode') === 'new';
  // 只有「非发布者编辑」才需要继承原章状态，其余情况不必多查一次库
  const status: BookStatus = canPublish
    ? formString(form, 'status') === 'published'
      ? 'published'
      : 'draft'
    : isNew
      ? 'draft'
      : ((await getChapter(c.env.DB, book.id, idx, { includeDrafts: true }))?.status ?? 'draft');

  if (!Number.isInteger(idx) || idx < 1) {
    c.status(400);
    return html(
      c,
      <ChapterFormPage
        user={user}
        book={book}
        chapter={{
          id: 0,
          idx: 1,
          title,
          body,
          bodyHtml: null,
          bodyHash: null,
          paragraphs: [],
          words: 0,
          status,
          updatedAt: Math.floor(Date.now() / 1000),
          volumeId,
          volumeNo: 0,
        }}
        canPublish={canPublish}
        isNew={isNew}
        error="章节序号必须是正整数。"
        theme={await adminTheme(c)}
      />,
    );
  }

  if (!title) {
    c.status(400);
    return html(
      c,
      <ChapterFormPage
        user={user}
        book={book}
        chapter={{
          id: 0,
          idx,
          title,
          body,
          bodyHtml: null,
          bodyHash: null,
          paragraphs: [],
          words: 0,
          status,
          updatedAt: Math.floor(Date.now() / 1000),
          volumeId,
          volumeNo: 0,
        }}
        canPublish={canPublish}
        isNew={isNew}
        error="标题不能为空。"
        theme={await adminTheme(c)}
      />,
    );
  }

  // 新增按序号插入（同序号章节整体后移），编辑仍按序号覆盖
  if (isNew) await insertChapter(c.env.DB, book.id, idx, title, body, status, volumeId);
  else await saveChapter(c.env.DB, book.id, idx, title, body, status, volumeId);
  return c.redirect(`/admin/books/${book.id}?m=saved`, 303);
});

app.post('/books/:id/chapters/:idx/delete', async (c) => {
  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')));
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  await deleteChapter(c.env.DB, book.id, Number(c.req.param('idx')));
  return c.redirect(`/admin/books/${book.id}?m=deleted`, 303);
});

/** 批量删除章节：前端勾选后调这里，idx 是章节序号 */
app.post('/api/books/:id/chapters/batch', async (c) => {
  const guard = await readBatch(c, 'idxs');
  if (guard instanceof Response) return guard;
  const { body, ids: idxs } = guard;

  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')));
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  const action = String(body.action ?? '');
  if (action !== 'delete') return c.json({ ok: false, error: 'bad-action' }, 400);

  await deleteChapters(c.env.DB, book.id, idxs);
  await logAudit(
    c.env.DB,
    user.id,
    'chapter.batch.delete',
    `《${book.title}》批量删除 ${idxs.length} 章`,
  );
  return c.json({ ok: true, count: idxs.length });
});

/* ---------- 卷 ---------- */

/** 卷改完要换的两块：卷面板（含最新章数）+ 需要时带当前页章节表 */
async function volumePanels(
  db: D1Database,
  book: Book,
  chapterPage: unknown,
  withChapters: boolean,
) {
  // 写操作刚清过卷缓存，这里读到的就是最新的；卷列表和章数统计互不依赖，并发取
  const [volumes, stats] = await Promise.all([
    getVolumes(db, book.id),
    getChapterStats(db, book.id),
  ]);
  const fresh = { ...book, volumes };
  const html = String(<VolumePanelBody book={fresh} counts={stats.byVolume} />);
  if (!withChapters) return { html };

  const data = await getChaptersPage(db, book.id, chapterPage, undefined, stats);
  return {
    html,
    chapters: {
      html: String(
        <ChapterTable book={fresh} chapters={data.chapters} page={data.page} pages={data.pages} />,
      ),
      page: data.page,
      pages: data.pages,
      total: data.stats.total,
    },
  };
}

/** 卷操作：ajax 提交直接把刷新用的 HTML 回过去，普通表单仍走 303 跳转 */
async function back(c: AppContext, book: Book, m: 'saved' | 'deleted', withChapters = true) {
  if (c.req.header('x-admin-ajax') !== '1') {
    return c.redirect(`/admin/books/${book.id}?m=${m}`, 303);
  }
  const panels = await volumePanels(c.env.DB, book, c.req.query('chapterPage'), withChapters);
  return c.json(panels, 200, { 'cache-control': 'no-store' });
}

app.post('/books/:id/volumes', async (c) => {
  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')));
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  const form = await c.req.formData();
  const title = formString(form, 'title').slice(0, 100);
  const intro = String(form.get('intro') ?? '').slice(0, 2000);

  const { adopted } = await createVolume(c.env.DB, book.id, title, intro);
  // 收编了未分卷章节才需要换章节表；新增的空卷不影响章节
  return back(c, book, 'saved', adopted);
});

app.post('/books/:id/volumes/:vid', async (c) => {
  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')), { volumes: true });
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  const volumeId = Number(c.req.param('vid'));
  const volume = book.volumes.find((v) => v.id === volumeId);
  if (!volume) return c.notFound();

  const form = await c.req.formData();
  const title = formString(form, 'title').slice(0, 100) || `第 ${volume.idx} 卷`;
  const intro = String(form.get('intro') ?? '').slice(0, 2000);

  await updateVolume(c.env.DB, book.id, volumeId, { title, intro });
  return back(c, book, 'saved');
});

app.post('/books/:id/volumes/:vid/move', async (c) => {
  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')));
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  const form = await c.req.formData();
  const dir = formString(form, 'dir') === 'up' ? -1 : 1;
  await moveVolume(c.env.DB, book.id, Number(c.req.param('vid')), dir);
  // 只换了卷序，章节的卷归属和卷内章序都没变
  return back(c, book, 'saved', false);
});

app.post('/books/:id/volumes/:vid/delete', async (c) => {
  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')));
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  await deleteVolume(c.env.DB, book.id, Number(c.req.param('vid')));
  return back(c, book, 'deleted');
});

/** 批量删除卷：前端勾选后调这里，卷里的章节退回其他卷，不删章节 */
app.post('/api/books/:id/volumes/batch', async (c) => {
  const guard = await readBatch(c, 'ids');
  if (guard instanceof Response) return guard;
  const { body, ids } = guard;

  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')));
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  const action = String(body.action ?? '');
  if (action !== 'delete') return c.json({ ok: false, error: 'bad-action' }, 400);

  const count = await deleteVolumes(c.env.DB, book.id, ids);
  await logAudit(c.env.DB, user.id, 'volume.batch.delete', `《${book.title}》批量删除 ${count} 卷`);
  const panels = await volumePanels(c.env.DB, book, c.req.query('chapterPage'), true);
  return c.json({ ok: true, count, ...panels }, 200, { 'cache-control': 'no-store' });
});

export default app;
