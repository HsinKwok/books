import type { Book, Chapter } from '../../db';
import type { SessionUser } from '../../env';

/** 章节页右侧讨论栏：表单状态 + 待 /api/talks 填充的列表 */
export function DiscussBox({
  book,
  chapter,
  user,
  sent,
  discussEnabled,
  autoApprove,
}: {
  book: Book;
  chapter: Chapter;
  user?: SessionUser | null;
  sent?: boolean;
  discussEnabled: boolean;
  autoApprove: boolean;
}) {
  return (
    <aside class="discuss-col">
      <section class="discuss">
        <header class="discuss-head">
          {/* 条数与列表都由 /api/talks 补，页面先出空位 */}
          <span class="discuss-count" data-talk-count>
            共 — 条讨论
          </span>
          <div class="discuss-sort">
            <button type="button" class="is-active" data-sort="latest">
              最新
            </button>
            <button type="button" data-sort="oldest">
              最早
            </button>
          </div>
        </header>

        {discussEnabled ? (
          user ? (
            <form class="discuss-form" id="discuss-form" method="post" action={`/b/${book.slug}/${chapter.idx}/discuss`}>
              <textarea
                name="body"
                rows={4}
                maxlength={2000}
                placeholder="说说这一章…… 友善一点。支持 Markdown。"
                data-markdown
                required
              />
              <input type="hidden" name="parent" value="" />
              <div class="discuss-form-foot">
                <span id="discuss-note">
                  {sent
                    ? autoApprove
                      ? '已发布。'
                      : '已提交，审核通过后显示。'
                    : `以 ${user.name} 的身份发言，${autoApprove ? '发布后立即显示' : '提交后需审核'}`}
                </span>
                <button class="discuss-submit" type="submit">
                  提交
                </button>
              </div>
            </form>
          ) : (
            <p class="discuss-login">
              <a class="inline-link" href={`/login?next=${encodeURIComponent(`/b/${book.slug}/${chapter.idx}`)}`}>
                登录
              </a>
              后可以在这里留言。
            </p>
          )
        ) : (
          <p class="discuss-login">这本书暂时关闭了讨论，已有的留言仍然可以查看。</p>
        )}

        <ul
          class="discuss-list"
          id="discuss-list"
          data-talk-book={book.slug}
          data-talk-idx={String(chapter.idx)}
        />
        <noscript>
          <p class="discuss-empty">查看本章讨论需要开启 JavaScript。</p>
        </noscript>
      </section>
    </aside>
  );
}
