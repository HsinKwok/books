import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { getBookMetaById, importChapters, nextChapterIdx, type BookStatus } from '../db';
import { can } from '../permissions';
import { ImportPage, ImportPreviewPage } from '../pages/admin/import';
import {
  DEFAULT_CHUNK,
  splitChapters,
  type ParsedChapter,
  type ParsedVolume,
  type SplitMode,
  type SplitOptions,
} from '../txt';
import { adminTheme, adminUser, html, type AdminContext } from './shared';
import { formString } from '../forms';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/** 权限与书籍校验：AJAX 接口和普通表单共用 */
async function importTarget(c: AdminContext) {
  const user = adminUser(c);
  if (!can(user, 'book.import')) return { error: '没有导入权限。', status: 403 as const };
  const book = await getBookMetaById(c.env.DB, Number(c.req.param('id')));
  if (!book) return { error: '书不存在。', status: 404 as const };
  return { user, book };
}

/** 表单里的切分方式：老表单没有这两个字段时按自动切分 */
function splitOptions(form: FormData): SplitOptions {
  const mode = formString(form, 'splitMode');
  return {
    mode: (mode === 'headings' || mode === 'size' ? mode : 'auto') as SplitMode,
    chunkChars: Number(formString(form, 'chunkChars')) || DEFAULT_CHUNK,
  };
}

/** 表单里的导入参数 */
function importParams(form: FormData) {
  return {
    raw: String(form.get('raw') ?? ''),
    startIdx: Math.max(1, Number(formString(form, 'startIdx')) || 1),
    // 导入默认发布，避免整本导完读者端目录还是空的
    status: (formString(form, 'status') === 'draft' ? 'draft' : 'published') as BookStatus,
    replace: formString(form, 'mode') === 'replace',
    split: splitOptions(form),
  };
}

/** 预览只回传标题、字数和开头，避免把整本书再传一遍 */
function previewPayload(parsed: {
  volumes: ParsedVolume[];
  chapters: ParsedChapter[];
  note?: string;
}) {
  const row = (ch: ParsedChapter) => ({
    title: ch.title,
    words: ch.words,
    head: ch.body.slice(0, 40),
  });
  const totalChapters =
    parsed.volumes.reduce((n, volume) => n + volume.chapters.length, 0) + parsed.chapters.length;
  const totalWords = [...parsed.volumes.flatMap((v) => v.chapters), ...parsed.chapters].reduce(
    (n, ch) => n + ch.words,
    0,
  );
  return {
    volumes: parsed.volumes.map((volume) => ({
      title: volume.title,
      chapters: volume.chapters.map(row),
    })),
    chapters: parsed.chapters.map(row),
    totalChapters,
    totalWords,
    note: parsed.note,
  };
}

app.get('/books/:id/import', async (c) => {
  const target = await importTarget(c);
  if ('error' in target) return c.text(`403 · ${target.error}`, target.status);
  const nextIdx = await nextChapterIdx(c.env.DB, target.book.id);
  return html(
    c,
    <ImportPage
      user={target.user}
      book={target.book}
      nextIdx={nextIdx}
      theme={await adminTheme(c)}
    />,
  );
});

app.post('/books/:id/import/preview', async (c) => {
  const target = await importTarget(c);
  if ('error' in target) return c.json({ error: target.error }, target.status);

  const form = await c.req.formData();
  const parsed = splitChapters(String(form.get('raw') ?? ''), splitOptions(form));
  if (parsed.error) return c.json({ error: parsed.error }, 400);
  return c.json(previewPayload(parsed));
});

app.post('/books/:id/import/commit', async (c) => {
  const target = await importTarget(c);
  if ('error' in target) return c.json({ error: target.error }, target.status);

  const params = importParams(await c.req.formData());
  const parsed = splitChapters(params.raw, params.split);
  if (parsed.error) return c.json({ error: parsed.error }, 400);

  await importChapters(
    c.env.DB,
    target.book.id,
    { volumes: parsed.volumes, chapters: parsed.chapters },
    { startIdx: params.startIdx, status: params.status, replace: params.replace },
  );
  return c.json({ ok: true, redirect: `/admin/books/${target.book.id}?m=imported` });
});

/* 没有 JS 时的兜底：整页提交预览，再整页提交入库 */
app.post('/books/:id/import', async (c) => {
  const target = await importTarget(c);
  if ('error' in target) return c.text(`403 · ${target.error}`, target.status);

  const form = await c.req.formData();
  const params = importParams(form);
  const parsed = splitChapters(params.raw, params.split);
  if (parsed.error) {
    c.status(400);
    return html(
      c,
      <ImportPage
        user={target.user}
        book={target.book}
        nextIdx={params.startIdx}
        error={parsed.error}
        theme={await adminTheme(c)}
      />,
    );
  }

  if (formString(form, 'stage') === 'commit') {
    await importChapters(
      c.env.DB,
      target.book.id,
      { volumes: parsed.volumes, chapters: parsed.chapters },
      { startIdx: params.startIdx, status: params.status, replace: params.replace },
    );
    return c.redirect(`/admin/books/${target.book.id}?m=imported`, 303);
  }

  return html(
    c,
    <ImportPreviewPage
      user={target.user}
      book={target.book}
      volumes={parsed.volumes}
      chapters={parsed.chapters}
      note={parsed.note}
      raw={params.raw}
      startIdx={params.startIdx}
      status={params.status}
      mode={params.replace ? 'replace' : 'append'}
      splitMode={params.split.mode ?? 'auto'}
      chunkChars={params.split.chunkChars ?? DEFAULT_CHUNK}
      theme={await adminTheme(c)}
    />,
  );
});

export default app;
