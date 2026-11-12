// 概览统计：骨架先出，数字随后补上
const box = document.querySelector('#admin-overview');

if (box) {
  const put = (key, value) => {
    const el = box.querySelector(`[data-stat="${key}"]`);
    if (el) el.textContent = String(value);
  };
  const num = (value) => Number(value || 0).toLocaleString('en-US');

  fetch('/admin/api/overview')
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data) return;

      put('books', data.books);
      put('books-meta', `已发布 ${data.publishedBooks} · 草稿 ${data.draftBooks}`);
      put('chapters', data.chapters);
      put('chapters-meta', `草稿 ${data.draftChapters}`);
      put('words', num(data.words));
      put('pending', data.pending);
      put('users', data.users);

      const note = document.querySelector('[data-stat="head-note"]');
      if (note) {
        note.textContent = `上次登录之后，站上一共 ${data.chapters} 章、${num(data.words)} 字。`;
      }
    })
    .catch(() => {});
}
