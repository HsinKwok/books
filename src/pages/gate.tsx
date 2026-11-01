import { renderMarkdown } from '../markdown';
import { themeScript } from '../theme';
import { asset } from '../assets.generated';

export function GatePage({
  mode,
  siteName,
  mark,
  note,
  theme = 'light',
  next = '/',
  error = false,
}: {
  mode: 'password' | 'closed';
  siteName: string;
  mark: string;
  note: string;
  theme?: string;
  next?: string;
  error?: boolean;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>
          {mode === 'password' ? '需要访问口令' : '暂时关闭'} · {siteName}
        </title>
        <meta name="robots" content="noindex" />
        <meta name="color-scheme" content="light dark" />
        <link rel="stylesheet" href={asset('/css/base.css')} />
        <link rel="stylesheet" href={asset('/css/site.css')} />
        <script dangerouslySetInnerHTML={{ __html: themeScript(theme) }} />
      </head>
      <body class="gate-body">
        <main class="gate">
          <p class="gate-site">
            {siteName}
            <sup>{mark}</sup>
          </p>
          <h1 class="gate-title">{mode === 'password' ? '需要访问口令' : '暂时关闭'}</h1>

          <div class="gate-note" dangerouslySetInnerHTML={{ __html: renderMarkdown(note) }} />

          {mode === 'password' ? (
            <form class="gate-form" method="post" action="/gate">
              <input type="hidden" name="next" value={next} />
              <input
                class="gate-input"
                type="password"
                name="password"
                placeholder="访问口令"
                autocomplete="current-password"
                required
                autofocus
              />
              <button class="btn" type="submit">
                进入
              </button>
            </form>
          ) : null}

          {error ? <p class="gate-error">口令不对，再试一次。</p> : null}

          <p class="gate-foot">Read slowly</p>
        </main>
      </body>
    </html>
  );
}
