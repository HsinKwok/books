import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import {
  categoryBookCounts,
  categoryExists,
  createCategory,
  deleteCategories,
  deleteCategory,
  getCategoryById,
  listCategories,
  logAudit,
  updateCategory,
} from '../db';
import { CategoriesPage, CategoryFormPage, CategoryTable } from '../pages/admin/categories';
import { formString } from '../forms';
import { adminTheme, adminUser, html, notice } from './shared';
import { readBatch } from './guard';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

function parseCategory(form: FormData) {
  const name = formString(form, 'name');
  const sort = Number(formString(form, 'sort'));
  return {
    name,
    slug: formString(form, 'slug') || name,
    sort: Number.isFinite(sort) ? Math.trunc(sort) : 0,
    hidden: formString(form, 'hidden') === '1',
    description: formString(form, 'description'),
  };
}

function validateCategory(input: { name: string; slug: string }) {
  if (!input.name) return '分类名称不能为空。';
  if (!input.slug || /[\s/?#]/.test(input.slug)) {
    return '链接不能为空，也不能包含空格、斜杠或问号。';
  }
  return null;
}

app.get('/categories', async (c) => {
  const [categories, counts] = await Promise.all([
    listCategories(c.env.DB),
    categoryBookCounts(c.env.DB),
  ]);
  return html(
    c,
    <CategoriesPage
      user={adminUser(c)}
      categories={categories}
      counts={counts}
      notice={notice(c)}
      theme={await adminTheme(c)}
    />,
  );
});

app.post('/categories', async (c) => {
  const input = parseCategory(await c.req.formData());
  const error = validateCategory(input);
  if (
    error ||
    (await categoryExists(c.env.DB, 'name', input.name)) ||
    (await categoryExists(c.env.DB, 'slug', input.slug))
  ) {
    c.status(400);
    const [categories, counts] = await Promise.all([
      listCategories(c.env.DB),
      categoryBookCounts(c.env.DB),
    ]);
    return html(
      c,
      <CategoriesPage
        user={adminUser(c)}
        categories={categories}
        counts={counts}
        notice={error ?? '名称或链接已经存在。'}
        theme={await adminTheme(c)}
      />,
    );
  }

  await createCategory(c.env.DB, input);
  await logAudit(c.env.DB, adminUser(c).id, 'category.create', input.name);
  return c.redirect('/admin/categories?m=created', 303);
});

app.get('/categories/:id', async (c) => {
  const category = await getCategoryById(c.env.DB, Number(c.req.param('id')));
  if (!category) return c.notFound();
  const counts = await categoryBookCounts(c.env.DB);
  return html(
    c,
    <CategoryFormPage
      user={adminUser(c)}
      category={category}
      counts={counts[category.name] ?? 0}
      theme={await adminTheme(c)}
    />,
  );
});

app.post('/categories/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const category = await getCategoryById(c.env.DB, id);
  if (!category) return c.notFound();

  const input = parseCategory(await c.req.formData());
  const error = validateCategory(input);

  if (
    error ||
    (await categoryExists(c.env.DB, 'name', input.name, id)) ||
    (await categoryExists(c.env.DB, 'slug', input.slug, id))
  ) {
    c.status(400);
    const counts = await categoryBookCounts(c.env.DB);
    return html(
      c,
      <CategoryFormPage
        user={adminUser(c)}
        category={{ ...category, ...input }}
        counts={counts[category.name] ?? 0}
        error={error ?? '名称或链接已经存在。'}
        theme={await adminTheme(c)}
      />,
    );
  }

  await updateCategory(c.env.DB, id, input);
  await logAudit(c.env.DB, adminUser(c).id, 'category.update', input.name);
  return c.redirect(`/admin/categories/${id}?m=saved`, 303);
});

/** 批量删除分类：书回落到「未分类」，回最新表格片段让前端原地替换 */
app.post('/api/categories/batch', async (c) => {
  const guard = await readBatch(c);
  if (guard instanceof Response) return guard;
  const { body, ids } = guard;

  const action = String(body.action ?? '');
  if (action !== 'delete') return c.json({ ok: false, error: 'bad-action' }, 400);

  const count = await deleteCategories(c.env.DB, ids);
  if (count) {
    await logAudit(c.env.DB, adminUser(c).id, 'category.batch.delete', `批量删除 ${count} 个分类`);
  }

  const [categories, counts] = await Promise.all([
    listCategories(c.env.DB),
    categoryBookCounts(c.env.DB),
  ]);
  return c.json(
    {
      ok: true,
      count,
      total: categories.length,
      html: String(<CategoryTable categories={categories} counts={counts} />),
    },
    200,
    { 'cache-control': 'no-store' },
  );
});

app.post('/categories/:id/delete', async (c) => {
  const id = Number(c.req.param('id'));
  const category = await getCategoryById(c.env.DB, id);
  if (category && (await deleteCategory(c.env.DB, id))) {
    await logAudit(c.env.DB, adminUser(c).id, 'category.delete', category.name);
  }
  return c.redirect('/admin/categories?m=deleted', 303);
});

export default app;
