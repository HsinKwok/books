import type { SessionUser } from '../env';

type Props = {
  user?: SessionUser | null;
  /** 注册开关关闭时不引导注册，只提示登录 */
  registerOpen?: boolean;
};

export function ShelfPage({ user, registerOpen = true }: Props) {
  return (
    <div class="page shelf-page">
      <section class="page-head">
        <p class="kicker">{user ? '我的书架' : '游客书架'}</p>
        <h1 class="page-title">在读的，想读的。</h1>
        <p class="page-note">
          {user ? (
            <>
              {user.name} 的书架：<i class="stat js-shelf-total">0</i> 本在架，已读完{' '}
              <i class="stat js-read-total">0</i> 章。记在这台设备的浏览器里，换设备不会同步。
            </>
          ) : (
            <>
              书架只存在这次浏览里：<i class="stat js-shelf-total">0</i> 本在架，已读完{' '}
              <i class="stat js-read-total">0</i> 章。关掉标签页就会清空，
              {registerOpen ? (
                <>
                  <a href="/register">注册</a>或
                </>
              ) : null}
              <a href="/login">登录</a>后会自动并入你的书架。
            </>
          )}
        </p>
      </section>

      <div class="shelf-tabs" id="shelf-tabs">
        <button class="shelf-tab is-active" type="button" data-group="all">
          全部<em>0</em>
        </button>
        <button class="shelf-tab" type="button" data-group="default">
          默认<em>0</em>
        </button>
        <button class="shelf-tab-add" id="shelf-tab-add" type="button">
          ＋ 新建分组
        </button>
        <form class="shelf-tab-form" id="shelf-tab-form" hidden>
          <input
            id="shelf-tab-input"
            type="text"
            maxlength={12}
            placeholder="分组名字，回车建立"
            autocomplete="off"
          />
          <button type="submit">建立</button>
          <button type="button" id="shelf-tab-cancel">
            取消
          </button>
        </form>
      </div>

      <section class="shelf-block">
        <div class="section-head">
          <h2 class="section-label">在架</h2>
          <span class="section-note">
            <button class="shelf-group-del" id="shelf-group-del" type="button" hidden>
              删除分组
            </button>
            <span id="shelf-note">还没有加入任何书</span>
          </span>
        </div>

        <ul class="shelf-list" id="shelf-mine" />

        <div class="shelf-empty" id="shelf-empty">
          <p class="empty-line">这一栏还是空的。</p>
          <p class="empty-note">在阅读页底部点「加入书架」，书会先落到默认分组。</p>
        </div>
      </section>

      <section class="shelf-block">
        <div class="section-head">
          <h2 class="section-label">读过，还没加入的</h2>
          <span class="section-note" id="shelf-rest-note">
            0 本
          </span>
        </div>

        {/* 书目由 shelf.js 按本地记录向 /api/books 取，不再整站渲染 */}
        <ul class="shelf-all" id="shelf-all" />

        <p class="shelf-rest-empty" id="shelf-rest-empty" hidden>
          还没有读过、也没加入书架的书。
        </p>
      </section>
    </div>
  );
}
