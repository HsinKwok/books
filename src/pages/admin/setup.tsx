import { themeScript } from '../../theme';
import { asset } from '../../assets.generated';

export function SetupPage({
  error,
  values,
  theme = 'light',
}: {
  error?: string;
  values?: { name?: string; email?: string };
  theme?: string;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>初始化站长 · 后台</title>
        <meta name="color-scheme" content="light dark" />
        <link rel="stylesheet" href={asset('/css/base.css')} />
        <link rel="stylesheet" href={asset('/css/admin.css')} />
        <script dangerouslySetInnerHTML={{ __html: themeScript(theme) }} />
      </head>
      <body class="admin-body">
        <main class="admin-main admin-setup">
          <header class="admin-page-head">
            <div class="admin-page-heading">
              <p class="kicker">First run</p>
              <h1 class="admin-title">先开一个站长</h1>
              <p class="admin-page-note">站上还没有站长时，这个页面才可用。建好后会自动登录并进入后台。</p>
            </div>
          </header>

          {error ? <p class="form-error">{error}</p> : null}

          <form class="form" method="post" action="/admin/setup">
            <label>
              <span>昵称</span>
              <input name="name" value={values?.name ?? ''} maxlength={20} required />
            </label>
            <label>
              <span>邮箱</span>
              <input name="email" type="email" value={values?.email ?? ''} required />
            </label>
            <label>
              <span>密码（至少 8 位）</span>
              <input name="password" type="password" minlength={8} autocomplete="new-password" required />
            </label>
            <button class="btn btn-full" type="submit">
              创建站长
            </button>
          </form>
        </main>
      </body>
    </html>
  );
}
