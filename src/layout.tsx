import type { Child } from 'hono/jsx';
import type { SessionUser } from './env';
import type { Stats } from './db';
import { asset } from './assets.generated';
import { friendLinks, readerDefaults, type Settings } from './settings';
import { isStaff } from './permissions';
import { markdownText, renderInline } from './markdown';
import { themeScript } from './theme';

type Props = {
  title: string;
  description?: string;
  bodyClass?: string;
  bodyAttrs?: Record<string, string>;
  minimal?: boolean;
  active?: 'home' | 'search' | 'shelf' | 'login';
  category?: string;
  stats: Stats;
  categories: string[];
  settings: Settings;
  user?: SessionUser | null;
  /** 页面级的额外 head 内容（预取、结构化数据等） */
  head?: Child;
  children: Child;
};

/** 公告内容的短哈希：内容一改，关闭状态自然失效，会重新显示 */
function noticeKey(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

export type LayoutProps = Props;

/** 把页脚文案里的 {books} 之类换成带样式的数字 */
function fillTemplate(template: string, stats: Stats): Child[] {
  return template.split(/(\{(?:books|chapters|words|readChapters|readWords)\})/g).map((part) => {
    switch (part) {
      case '{books}':
        return <i class="stat">{stats.books}</i>;
      case '{chapters}':
        return <i class="stat">{stats.chapters}</i>;
      case '{words}':
        return <i class="stat">{stats.words.toLocaleString('en-US')}</i>;
      case '{readChapters}':
        return <i class="stat js-read-total">0</i>;
      case '{readWords}':
        return <i class="stat js-read-words">0</i>;
      default:
        return <span dangerouslySetInnerHTML={{ __html: renderInline(part) }} />;
    }
  });
}

function Rail({
  active,
  category,
  categories,
  settings,
  user,
}: {
  active?: Props['active'];
  category?: string;
  categories: string[];
  settings: Settings;
  user?: SessionUser | null;
}) {
  const cls = (key: NonNullable<Props['active']>) =>
    key === active ? 'rail-link is-active' : 'rail-link';
  const siteName = settings['site.name'];
  const mark = settings['site.mark'];

  return (
    <aside class="rail">
      <a class="rail-brand" href="/">
        <span class="rail-logo">
          {siteName}
          {mark ? <sup>{mark}</sup> : null}
        </span>
        <span class="rail-tag">{settings['site.tagline']}</span>
      </a>

      <nav class="rail-nav">
        <div class="rail-group is-open">
          <a class={cls('home')} href="/">
            <i>01</i>书库
          </a>
          <button
            class="rail-toggle"
            type="button"
            aria-expanded="true"
            aria-controls="rail-sub"
            aria-label="展开或收起书籍分类"
          >
            <span class="rail-caret" aria-hidden="true" />
          </button>
          <ul class="rail-sub" id="rail-sub">
            {categories.map((name) => (
              <li>
                <a
                  class={name === category ? 'is-current' : undefined}
                  href={`/c/${encodeURIComponent(name)}`}
                >
                  {name}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <a class={cls('search')} href="/search">
          <i>02</i>搜索
        </a>
        <a class={cls('shelf')} href="/shelf">
          <i>03</i>
          {user ? '我的书架' : '游客书架'}
        </a>
      </nav>

      <div class="rail-foot">
        <p class="rail-auth">
          {user ? (
            <span class="rail-auth-user">
              <i class="rail-auth-name">{user.name}</i>
              {isStaff(user) ? <a href="/admin">后台</a> : null}
              <a class="rail-auth-out" href="/logout">
                注销
              </a>
            </span>
          ) : (
            <span class="rail-auth-guest">
              <a href="/login">登录</a>
              {settings['registration.open'] === '1' ? (
                <>
                  <span aria-hidden="true">/</span>
                  <a href="/register">注册</a>
                </>
              ) : null}
            </span>
          )}
          <ThemeToggle />
        </p>
        <a href="/rss.xml">RSS</a>
        <a href="/sitemap.xml">Sitemap</a>
        <span>© 2026</span>
      </div>
    </aside>
  );
}

function ThemeToggle() {
  return (
    <button class="theme-toggle" type="button" data-theme-toggle aria-label="切换夜间模式">
      <svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>
    </button>
  );
}


export function Layout({
  title,
  description,
  bodyClass,
  bodyAttrs,
  minimal,
  active,
  category,
  stats,
  categories,
  settings,
  user,
  head,
  children,
}: Props) {
  const siteName = settings['site.name'];
  const announcement = settings['announcement.text'];
  const announcementUrl = settings['announcement.url'];
  const friends = friendLinks(settings);

  return (
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <meta
          name="description"
          content={markdownText(description || settings['seo.description'])}
        />
        <meta name="color-scheme" content="light dark" />
        <link rel="stylesheet" href={asset('/css/base.css')} />
        <link rel="stylesheet" href={asset('/css/site.css')} />
        {/* 阅读页专属样式单独加载，其它页面不再下载这部分 */}
        {bodyClass === 'is-reading' ? (
          <link rel="stylesheet" href={asset('/css/reading.css')} />
        ) : null}
        {/* 图标由站点名首字实时生成，见 /favicon.ico */}
        <link rel="icon" href="/favicon.ico" type="image/svg+xml" sizes="any" />
        {bodyClass === 'is-reading' ? (
          <>
            {/* 章节页脚本合并为一条入口，依赖在这里一起预载，避免串行发现 */}
            <link rel="modulepreload" href={asset('/js/chapter-page.js')} />
            <link rel="modulepreload" href={asset('/js/reading.js')} />
            <link rel="modulepreload" href={asset('/js/related.js')} />
            <link rel="modulepreload" href={asset('/js/talks.js')} />
            <link rel="modulepreload" href={asset('/js/discuss.js')} />
          </>
        ) : null}
        {head}
        <script
          dangerouslySetInnerHTML={{ __html: themeScript(readerDefaults(settings).theme) }}
        />
      </head>
      <body
        class={bodyClass}
        data-user={user ? '1' : undefined}
        data-uid={user ? String(user.id) : undefined}
        {...bodyAttrs}
      >
        <Rail active={active} category={category} categories={categories} settings={settings} user={user} />

        <header class="mobile-head">
          <a class="brand" href="/">
            {siteName}
            {settings['site.mark'] ? <sup>{settings['site.mark']}</sup> : null}
          </a>
          <div class="mobile-tools">
            <nav class="mobile-nav">
              <a href="/">书库</a>
              <a href="/search">搜索</a>
              <a href="/shelf">书架</a>
            </nav>
            <ThemeToggle />
          </div>
        </header>

        <div class="main">
          {announcement ? (
            <>
              <p class="site-notice" data-notice={noticeKey(announcement + announcementUrl)}>
                {announcementUrl ? (
                  <a
                    href={announcementUrl}
                    dangerouslySetInnerHTML={{ __html: renderInline(announcement) }}
                  />
                ) : (
                  <span dangerouslySetInnerHTML={{ __html: renderInline(announcement) }} />
                )}
                <button class="site-notice-close" type="button" aria-label="关闭公告" title="关闭公告">
                  ×
                </button>
              </p>
              {/* 同步执行，已关闭的公告在首屏绘制前就移除，避免闪一下 */}
              <script
                dangerouslySetInnerHTML={{
                  __html:
                    "(function(){var el=document.currentScript.previousElementSibling;if(!el||!el.dataset.notice)return;var k='notice.dismissed';try{if(localStorage.getItem(k)===el.dataset.notice){el.remove();return}}catch(e){}var b=el.querySelector('.site-notice-close');if(b)b.addEventListener('click',function(){try{localStorage.setItem(k,el.dataset.notice)}catch(e){}el.remove()})})();",
                }}
              />
            </>
          ) : null}

          {children}

          {minimal ? null : (
            <footer class="site-foot">
              <div class="foot-inner">
                <p class="foot-line">
                  {fillTemplate(settings['footer.note'], stats)}
                  <span class="js-read-block" hidden>
                    {fillTemplate(settings['footer.read'], stats)}
                  </span>
                </p>
                {friends.length ? (
                  <p class="foot-links">
                    <span class="foot-links-label">友链</span>
                    {friends.map((item) => (
                      <a href={item.url} target="_blank" rel="noreferrer noopener">
                        {item.name}
                      </a>
                    ))}
                  </p>
                ) : null}
                <p class="foot-meta">
                  <span>
                    © 2026 {siteName}
                  </span>
                  <a href="/about">关于</a>
                  <a href="/privacy">隐私</a>
                  <a href="/rss.xml">RSS</a>
                  <a href="/sitemap.xml">Sitemap</a>
                </p>
              </div>
            </footer>
          )}
        </div>

        <script
          type="application/json"
          id="read-defaults"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(readerDefaults(settings)) }}
        />
        <script type="module" src={asset('/app.js')} />
      </body>
    </html>
  );
}
