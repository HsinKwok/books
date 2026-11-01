import type { AuditItem } from '../../db';
import type { SessionUser } from '../../env';
import { AdminHead, AdminLayout } from './layout';

function moment(ts: number) {
  const d = new Date(ts * 1000 + 8 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}`;
}

const ACTIONS: Record<string, string> = {
  'book.create': '新建书籍',
  'book.update': '更新书籍',
  'book.delete': '删除书籍',
  'category.create': '新建分类',
  'category.update': '更新分类',
  'category.delete': '删除分类',
  'settings.save': '保存设置',
  'admin.password': '修改密码',
  'backup.export': '导出备份',
};

export function OpsPage({
  user,
  logs,
  notice,
  r2,
  theme,
}: {
  user: SessionUser;
  logs: AuditItem[];
  notice?: string;
  r2: boolean;
  theme?: string;
}) {
  return (
    <AdminLayout title="运维 · 后台" active="ops" user={user} notice={notice} theme={theme}>
      <AdminHead
        kicker="Ops"
        title="运维与内容"
        note="导出备份、查看最近的后台操作。日志最多保留最近 100 条展示。"
      />

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>数据备份</h2>
        </div>
        <div class="admin-panel-body">
          <p class="admin-page-note">
            导出书籍（含草稿）、章节、分类、讨论、读者（不含密码）与站点设置为一个 JSON 文件。
          </p>
          <p class="admin-page-note">
            封面存储：{r2 ? '已配置 R2，可上传封面。' : '未配置 R2，封面目前只能用外链。'}
          </p>
          <div class="admin-form-foot">
            <a class="btn" href="/admin/backup">
              下载 JSON 备份
            </a>
          </div>
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>操作日志 · {logs.length}</h2>
        </div>
        <table class="admin-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>操作人</th>
              <th>动作</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr>
                <td class="admin-cell-sub">{moment(log.createdAt)}</td>
                <td>{log.userName || '—'}</td>
                <td>{ACTIONS[log.action] || log.action}</td>
                <td class="admin-cell-sub">{log.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length ? null : <p class="admin-empty">还没有操作记录。</p>}
      </section>
    </AdminLayout>
  );
}
