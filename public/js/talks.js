// 章节页讨论：正文先出，留言列表等页面读完再补
import { $, mk } from './core.js';

const list = $('#discuss-list');
const book = list?.dataset.talkBook;

if (list && book) {
  const counter = $('[data-talk-count]');
  const loggedIn = document.body.dataset.user === '1';
  const idx = list.dataset.talkIdx || '0';

  const likeButton = (talk) => {
    const btn = mk('button', null);
    btn.type = 'button';
    btn.dataset.act = 'like';
    btn.append(document.createTextNode('♥ '), mk('span', 'like-n', String(talk.likes)));
    btn.setAttribute('aria-pressed', talk.liked ? 'true' : 'false');
    if (talk.liked) btn.classList.add('is-liked');
    return btn;
  };

  const renderItem = (talk) => {
    const item = mk('li', 'discuss-item');
    item.dataset.id = String(talk.id);
    item.dataset.i = String(talk.id);

    const avatar = mk('span', 'avatar', talk.name.slice(0, 1));
    avatar.setAttribute('aria-hidden', 'true');

    const meta = mk('p', 'discuss-meta');
    meta.append(mk('b', null, talk.name), mk('span', null, talk.date));

    // 正文由服务端转好 HTML，这里直接落进去
    const text = mk('div', 'discuss-text');
    text.innerHTML = talk.html;

    const actions = mk('p', 'discuss-actions');
    if (loggedIn) {
      const reply = mk('button', null, '回复');
      reply.type = 'button';
      reply.dataset.act = 'reply';
      actions.append(reply, likeButton(talk));
    } else {
      const like = mk('a', 'discuss-like-login', `♥ ${talk.likes}`);
      like.href = `/login?next=${encodeURIComponent(location.pathname)}`;
      actions.append(like);
    }

    const body = mk('div', 'discuss-body');
    body.append(meta, text, actions);
    item.append(avatar, body);
    return item;
  };

  fetch(`/api/talks/${encodeURIComponent(book)}/${idx}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return;
      if (counter) counter.textContent = `共 ${data.count} 条讨论`;

      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) {
        const empty = mk(
          'p',
          'discuss-empty',
          loggedIn
            ? '这一章还没有人说话。你可以是第一个。'
            : '这一章还没有人说话。登录后可以成为第一个留言的人。',
        );
        list.after(empty);
        return;
      }
      list.replaceChildren(...items.map(renderItem));
    })
    .catch(() => {});
}
