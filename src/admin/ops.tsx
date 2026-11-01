import { Hono } from 'hono';
import type { Env, Variables } from '../env';
import { exportBackup, isoDate, listAudit, logAudit } from '../db';
import { OpsPage } from '../pages/admin/ops';
import { adminTheme, adminUser, html, notice } from './shared';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get('/ops', async (c) => {
  const logs = await listAudit(c.env.DB, 100);
  return html(
    c,
    <OpsPage
      user={adminUser(c)}
      logs={logs}
      notice={notice(c)}
      r2={!!c.env.COVERS}
      theme={await adminTheme(c)}
    />,
  );
});

app.get('/backup', async (c) => {
  const data = await exportBackup(c.env.DB);
  await logAudit(c.env.DB, adminUser(c).id, 'backup.export', '导出 JSON 备份');
  const name = `book-backup-${isoDate(Math.floor(Date.now() / 1000))}.json`;
  return c.body(JSON.stringify(data, null, 2), 200, {
    'content-type': 'application/json; charset=UTF-8',
    'content-disposition': `attachment; filename="${name}"`,
  });
});

export default app;
