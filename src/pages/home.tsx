import type { Book, RecentChapter, Stats } from '../db';
import type { Settings } from '../settings';
import { shortDate } from '../format';
import { renderInline } from '../markdown';
import { BookCards, Pager, type Talks } from './list';

export function Home({
  books,
  total,
  page,
  pages,
  perPage,
  stats,
  talks,
  settings,
}: {
  books: Book[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
  stats: Stats;
  talks: Talks;
  settings: Settings;
}) {
  const lead = books[0];
  const showUpdates = settings['home.showUpdates'] === '1';

  return (
    <div class="page page-home">
      <header class="home-head">
        <div class="home-head-main">
          <p class="eyebrow">{settings['home.eyebrow']}</p>
          <h1 class="home-title">
            {settings['home.title1']}
            <br />
            {settings['home.title2']}
          </h1>
        </div>
        <div class="home-head-side">
          <p
            class="home-lede"
            dangerouslySetInnerHTML={{ __html: renderInline(settings['home.lede']) }}
          />
          <p class="home-stats">
            共 <i class="stat">{stats.books}</i> 本 · <i class="stat">{stats.chapters}</i> 章 ·{' '}
            <i class="stat">{stats.words.toLocaleString('en-US')}</i> 字
          </p>
        </div>
      </header>

      <div class={showUpdates ? 'home-grid' : 'home-grid home-grid-solo'}>
        <section class="col-main">
          <div class="section-head">
            <h2 class="section-label">书库</h2>
            <span class="section-note">{total} 本在架</span>
          </div>

          {/* 书卡和翻页条包在一起，ajax 翻页时整块替换 */}
          <div id="home-books">
            <HomeBooks books={books} talks={talks} page={page} pages={pages} perPage={perPage} />
          </div>

          <div class="home-panels">
            {settings['home.showStats'] === '1' ? (
              <section class="panel">
                <h2 class="panel-title">阅读统计</h2>
                <dl class="stat-list">
                  <div>
                    <dt>在架</dt>
                    <dd>{stats.books} 本</dd>
                  </div>
                  <div>
                    <dt>章节</dt>
                    <dd>{stats.chapters} 章</dd>
                  </div>
                  <div>
                    <dt>总字数</dt>
                    <dd>{stats.words.toLocaleString('en-US')}</dd>
                  </div>
                  <div>
                    <dt>你已读完</dt>
                    <dd>
                      <span class="js-read-total">0</span> 章
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}

            {settings['home.showResume'] === '1' ? (
              <section class="panel" id="resume">
                <h2 class="panel-title">继续阅读</h2>
                {lead ? (
                  <a class="resume-link" id="resume-link" href={`/b/${lead.slug}/1`}>
                    <span class="resume-book" id="resume-book">
                      {lead.title}
                    </span>
                    <span class="resume-chapter" id="resume-chapter">
                      {lead.chapters[0]?.title}
                    </span>
                    <span class="resume-note">
                      {lead.chapters.length} 章 · {lead.category}
                    </span>
                    <span class="resume-go">接着读 →</span>
                  </a>
                ) : (
                  <p class="empty-note">书库还空着。</p>
                )}
              </section>
            ) : null}

            {settings['home.showNotes'] === '1' ? (
              <section class="panel">
                <h2 class="panel-title">怎么读</h2>
                <ul class="note-list">
                  <li>
                    <b>方向键切章。</b> ← → 直接翻上一章、下一章。
                  </li>
                  <li>
                    <b>自动记进度。</b>关掉页面，回来还能接着读。
                  </li>
                  <li>
                    <b>调到你舒服。</b>Aa 里可选字号、行距与夜间主题。
                  </li>
                </ul>
              </section>
            ) : null}
          </div>
        </section>

        {showUpdates ? (
          <aside class="home-side">
            <section class="panel">
              <h2 class="panel-title">最近更新</h2>
              {/* 首屏先出骨架，列表由 /api/recent 稍后补 */}
              <div id="home-recent">
                <ul class="updates">
                  <li>
                    <span class="update-book">正在加载…</span>
                  </li>
                </ul>
              </div>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** 首页书库：整页渲染与 /api/home 翻页共用同一段列表 */
export function HomeBooks({
  books,
  talks,
  page,
  pages,
  perPage,
}: {
  books: Book[];
  talks: Talks;
  page: number;
  pages: number;
  perPage: number;
}) {
  return (
    <>
      <BookCards books={books} talks={talks} startNo={(page - 1) * perPage} />
      <Pager page={page} pages={pages} base="/" />
    </>
  );
}

/** 首页「最近更新」的列表，整页与 /api/recent 共用 */
export function RecentUpdates({ items }: { items: RecentChapter[] }) {
  return (
    <ul class="updates">
      {items.map((chapter) => (
        <li>
          <a class="update-row" href={`/b/${chapter.slug}/${chapter.idx}`}>
            <span class="update-book">
              {chapter.bookTitle} · {shortDate(chapter.updatedAt)}
            </span>
            <span class="update-title">
              <i>*{chapter.idx}*</i>
              {chapter.title}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
