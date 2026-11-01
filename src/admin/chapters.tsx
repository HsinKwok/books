import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import {
  createVolume,
  deleteChapter,
  deleteChapters,
  deleteVolume,
  getBookMetaById,
  getChapter,
  logAudit,
  moveVolume,
  nextChapterIdx,
  nextVolumeIdx,
  saveChapter,
  updateVolume,
  type BookStatus,
} from '../db';
import { can, canEditBook } from '../permissions';
import { ChapterFormPage } from '../pages/admin/chapters';
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
  const current = await getChapter(c.env.DB, book.id, idx, { includeDrafts: true });
  const status: BookStatus = canPublish
    ? formString(form, 'status') === 'published'
      ? 'published'
      : 'draft'
    : (current?.status ?? 'draft');

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
        isNew
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
        isNew={true}
        error="标题不能为空。"
        theme={await adminTheme(c)}
      />,
    );
  }

  await saveChapter(c.env.DB, book.id, idx, title, body, status, volumeId);
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

app.post('/books/:id/volumes', async (c) => {
  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')));
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  const form = await c.req.formData();
  const idx = await nextVolumeIdx(c.env.DB, book.id);
  const title = formString(form, 'title').slice(0, 100) || `第 ${idx} 卷`;
  const intro = String(form.get('intro') ?? '').slice(0, 2000);

  await createVolume(c.env.DB, book.id, title, intro);
  return c.redirect(`/admin/books/${book.id}?m=saved`, 303);
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
  return c.redirect(`/admin/books/${book.id}?m=saved`, 303);
});

app.post('/books/:id/volumes/:vid/move', async (c) => {
  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')));
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  const form = await c.req.formData();
  const dir = formString(form, 'dir') === 'up' ? -1 : 1;
  await moveVolume(c.env.DB, book.id, Number(c.req.param('vid')), dir);
  return c.redirect(`/admin/books/${book.id}?m=saved`, 303);
});

app.post('/books/:id/volumes/:vid/delete', async (c) => {
  const user = adminUser(c);
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')));
  if (!book) return c.notFound();
  if (!canEditBook(user, book)) return c.text('403 · 无权编辑这本书', 403);

  await deleteVolume(c.env.DB, book.id, Number(c.req.param('vid')));
  return c.redirect(`/admin/books/${book.id}?m=deleted`, 303);
});

export default app;
