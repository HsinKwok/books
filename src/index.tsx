import { Hono } from 'hono';
import { Layout } from './layout';
import { NotFound } from './pages/info';
import { accessGate } from './access';
import { edgeCache } from './edge';
import adminApp from './admin/index';
import type { Env, Variables } from './env';
import { getSettings } from './settings';
import { sessionMiddleware } from './auth';
import siteApp from './routes/site';
import authApp from './routes/auth';
import apiApp from './routes/api';
import feedsApp from './routes/feeds';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use('*', sessionMiddleware);
app.use('*', accessGate);
// 匿名 HTML 边缘缓存：只对无 Cookie 的 GET 页面生效，/admin /api /cover 自动跳过
app.use('*', edgeCache);
app.route('/admin', adminApp);
// 前台按领域拆成子应用，统一挂在根路径
app.route('/', siteApp);
app.route('/', authApp);
app.route('/', apiApp);
app.route('/', feedsApp);

app.notFound(async (c) => {
  c.status(404);
  return c.html(
    String(
      <Layout
        title="404 · 书架"
        stats={{ books: 0, chapters: 0, words: 0 }}
        categories={[]}
        settings={await getSettings(c.env.DB)}
        user={c.get('user')}
      >
        <NotFound />
      </Layout>,
    ),
  );
});

export default app;
