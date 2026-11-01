// 书页「最新讨论」：摘要等首屏读完再补，不拖慢书籍详情
import { $, mk } from './core.js';

const box = $('#book-talks');
const list = $('#book-talks-list');
const slug = box?.dataset.book;

if (box && list && slug) {
  const renderItem = (talk) => {
    const item = mk('li', 'discuss-item');

    const avatar = mk('span', 'avatar', talk.name.slice(0, 1));
    avatar.setAttribute('aria-hidden', 'true');

    const body = mk('div', 'discuss-body');
    const meta = mk('p', 'discuss-meta');
    meta.append(mk('b', null, talk.name), mk('span', null, `${talk.date} · ${talk.chapterTitle}`));

    // 正文由服务端转好 HTML，这里直接落进去
    const text = mk('div', 'discuss-text');
    text.innerHTML = talk.html;

    const link = mk('a', 'book-talk-link', `去第 ${talk.idx} 章讨论 →`);
    link.href = `/b/${slug}/${talk.idx}`;

    body.append(meta, text, link);
    item.append(avatar, body);
    return item;
  };

  const note = (text) => list.replaceChildren(mk('li', 'discuss-empty', text));

  fetch(`/api/book-talks/${encodeURIComponent(slug)}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const items = Array.isArray(data?.items) ? data.items : [];
      if (!items.length) {
        note('这本书还没有讨论。');
        return;
      }
      list.replaceChildren(...items.map(renderItem));
    })
    .catch(() => note('讨论暂时加载不出来。'));
}
