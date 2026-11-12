import { $, $$, fmtNum, mk, readJSON, readText, writeJSON, writeText, api } from './core.js';

const shelfList = $('#shelf-mine');
if (shelfList) {
  const shelfAll = $('#shelf-all');
  const shelfEmpty = $('#shelf-empty');
  const shelfNote = $('#shelf-note');
  const restNote = $('#shelf-rest-note');
  const restEmpty = $('#shelf-rest-empty');
  const tabsEl = $('#shelf-tabs');
  const tabAdd = $('#shelf-tab-add');
  const tabForm = $('#shelf-tab-form');
  const tabInput = $('#shelf-tab-input');
  const tabCancel = $('#shelf-tab-cancel');
  const groupDel = $('#shelf-group-del');

  // 书目按需从服务端取（只取本地书架 / 阅读记录里出现过的书）
  let books = [];
  let bySlug = new Map();

  const groupOf = (item) => item.group || 'default';
  const doneKeys = () => {
    const done = readJSON('read.done', []);
    return Array.isArray(done) ? done : [];
  };
  const currentProgress = () => readJSON('read.progress', null);

  /** 这本书是否读过（有进度或已读完任意一章） */
  const started = (slug) => {
    const progress = currentProgress();
    if (progress && progress.slug === slug) return true;
    return doneKeys().some((key) => typeof key === 'string' && key.startsWith(`${slug}:`));
  };

  const shelfStore = () => {
    const list = readJSON('read.shelf', []);
    return Array.isArray(list) ? list.filter((b) => b && bySlug.has(b.slug)) : [];
  };
  const groupStore = () => {
    const list = readJSON('read.shelves', []);
    return Array.isArray(list) ? list.filter((g) => g && g.id && g.name) : [];
  };

  // 当前分组随书架数据一起按用户隔离
  let active = readText('read.shelfGroup') || 'all';
  const setActive = (id) => {
    active = id;
    writeText('read.shelfGroup', id);
  };

  const cardFor = (item) => {
    const book = bySlug.get(item.slug);
    const li = mk('li', 'shelf-card');
    li.dataset.slug = book.slug;

    const cover = mk('a', 'cover');
    cover.href = `/b/${book.slug}`;
    cover.setAttribute('aria-hidden', 'true');
    cover.appendChild(mk('span', 'cover-no', `№ ${String(book.no).padStart(2, '0')}`));
    cover.appendChild(mk('span', 'cover-title', book.title));
    cover.appendChild(mk('span', 'cover-author', book.author));

    const body = mk('div', 'shelf-card-body');
    body.appendChild(
      mk(
        'p',
        'shelf-card-meta',
        `${book.category} · ${book.chapters} 章 · ${fmtNum(book.words)} 字`,
      ),
    );

    const title = mk('a', 'shelf-card-title', book.title);
    title.href = `/b/${book.slug}`;
    body.appendChild(title);

    const done = doneKeys();
    const readN = done.filter((k) => k.startsWith(`${book.slug}:`)).length;
    const progress = currentProgress();
    const here = progress && progress.slug === book.slug ? progress : null;
    const line = mk('p', 'shelf-card-progress');

    if (readN >= book.chapters) {
      line.appendChild(mk('em', null, '已读完'));
      line.appendChild(document.createTextNode(` · 共 ${book.chapters} 章`));
    } else if (here) {
      line.appendChild(mk('em', null, `读到第 ${here.idx} 章`));
      line.appendChild(
        document.createTextNode(
          ` · ${here.chapterTitle || ''} · ${Math.round((here.ratio || 0) * 100)}%`,
        ),
      );
    } else if (readN) {
      line.appendChild(mk('em', null, `已读 ${readN} 章`));
      line.appendChild(document.createTextNode(` · 共 ${book.chapters} 章`));
    } else {
      line.textContent = `未开始 · 共 ${book.chapters} 章`;
    }
    body.appendChild(line);

    const actions = mk('p', 'shelf-card-actions');
    const go = mk('a', null, here ? '接着读 →' : '开始阅读 →');
    go.href = `/b/${book.slug}/${here ? here.idx : 1}`;
    actions.appendChild(go);
    const remove = mk('button', 'shelf-remove', '移出');
    remove.type = 'button';
    remove.dataset.slug = book.slug;
    actions.appendChild(remove);
    body.appendChild(actions);

    li.appendChild(cover);
    li.appendChild(body);
    return li;
  };

  /** 「读过，还没加入」的一行 */
  const restRow = (book) => {
    const li = mk('li', 'shelf-row');
    li.dataset.slug = book.slug;

    const main = mk('a', 'shelf-row-main');
    main.href = `/b/${book.slug}`;
    main.appendChild(mk('span', 'shelf-row-title', book.title));
    main.appendChild(
      mk(
        'span',
        'shelf-row-meta',
        `${book.author} · ${book.category} · ${book.chapters} 章 · ${
          book.words >= 10000 ? `${(book.words / 10000).toFixed(1)} 万字` : `${fmtNum(book.words)} 字`
        }`,
      ),
    );
    li.appendChild(main);

    const btn = mk('button', 'shelf-toggle', '加入书架');
    btn.type = 'button';
    btn.dataset.slug = book.slug;
    btn.dataset.title = book.title;
    btn.addEventListener('click', () => addToShelf(book));
    li.appendChild(btn);
    return li;
  };

  const addToShelf = (book) => {
    const list = readJSON('read.shelf', []);
    if (!list.some((b) => b.slug === book.slug)) {
      list.unshift({
        slug: book.slug,
        title: book.title,
        at: Date.now(),
        group: active === 'all' ? 'default' : active,
      });
      writeJSON('read.shelf', list);
    }
    renderShelf();
  };

  const renderTabs = (shelf) => {
    if (!tabsEl) return;
    const groups = groupStore();
    if (!['all', 'default'].includes(active) && !groups.some((g) => g.id === active)) {
      setActive('all');
    }
    $$('.shelf-tab', tabsEl).forEach((el) => el.remove());

    const entries = [{ id: 'all', name: '全部' }, { id: 'default', name: '默认' }].concat(groups);
    const anchor = tabAdd || tabForm;
    entries.forEach((entry) => {
      const count =
        entry.id === 'all' ? shelf.length : shelf.filter((b) => groupOf(b) === entry.id).length;
      const btn = mk('button', `shelf-tab${entry.id === active ? ' is-active' : ''}`, entry.name);
      btn.type = 'button';
      btn.dataset.group = entry.id;
      btn.appendChild(mk('em', null, String(count)));
      if (anchor) tabsEl.insertBefore(btn, anchor);
      else tabsEl.appendChild(btn);
    });

    if (groupDel) groupDel.hidden = active === 'all' || active === 'default';
  };

  /** 只列「读过但没加入书架」的书 */
  const renderRest = (shelf) => {
    if (!shelfAll) return;
    const inShelf = new Set(shelf.map((b) => b.slug));
    shelfAll.textContent = '';

    let rest = 0;
    books.forEach((book) => {
      if (inShelf.has(book.slug) || !started(book.slug)) return;
      rest += 1;
      shelfAll.appendChild(restRow(book));
    });

    if (restNote) restNote.textContent = `${rest} 本`;
    if (restEmpty) restEmpty.hidden = rest > 0;
  };

  const renderShelf = () => {
    const shelf = shelfStore();
    const shown = active === 'all' ? shelf : shelf.filter((b) => groupOf(b) === active);

    renderTabs(shelf);

    shelfList.textContent = '';
    shown.forEach((item) => shelfList.appendChild(cardFor(item)));

    if (shelfEmpty) shelfEmpty.hidden = shown.length > 0;
    if (shelfNote) shelfNote.textContent = shown.length ? `${shown.length} 本` : '还没有加入任何书';
    $$('.js-shelf-total').forEach((el) => {
      el.textContent = String(shelf.length);
    });

    renderRest(shelf);
  };

  /** 收集本地出现过的 slug，分批向 /api/books 要元信息 */
  const loadMeta = async () => {
    const slugs = new Set();
    const stored = readJSON('read.shelf', []);
    if (Array.isArray(stored)) stored.forEach((b) => b && b.slug && slugs.add(b.slug));
    for (const key of doneKeys()) {
      if (typeof key !== 'string') continue;
      const at = key.indexOf(':');
      if (at > 0) slugs.add(key.slice(0, at));
    }
    const progress = currentProgress();
    if (progress && progress.slug) slugs.add(progress.slug);

    const list = [...slugs];
    const loaded = [];
    for (let i = 0; i < list.length; i += 100) {
      const part = list.slice(i, i + 100);
      const data = await api(`/api/books?slugs=${encodeURIComponent(part.join(','))}`);
      loaded.push(...(data.books || []));
    }

    books = loaded.sort((a, b) => a.no - b.no);
    bySlug = new Map(books.map((b) => [b.slug, b]));
  };

  const openTabForm = (open) => {
    if (!tabForm || !tabAdd) return;
    tabForm.hidden = !open;
    tabAdd.hidden = open;
    if (open) {
      tabInput.value = '';
      tabInput.focus();
    }
  };

  if (tabsEl) {
    tabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.shelf-tab');
      if (!btn || btn.dataset.group === active) return;
      setActive(btn.dataset.group);
      renderShelf();
    });
  }

  if (tabAdd) tabAdd.addEventListener('click', () => openTabForm(true));
  if (tabCancel) tabCancel.addEventListener('click', () => openTabForm(false));
  if (tabInput) {
    tabInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        openTabForm(false);
      }
    });
  }
  if (tabForm) {
    tabForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = tabInput.value.trim().slice(0, 12);
      if (!name) {
        tabInput.focus();
        return;
      }
      const groups = groupStore();
      const id = `g${Date.now().toString(36)}`;
      groups.push({ id, name });
      writeJSON('read.shelves', groups);
      setActive(id);
      openTabForm(false);
      renderShelf();
    });
  }

  if (groupDel) {
    groupDel.addEventListener('click', () => {
      if (active === 'all' || active === 'default') return;
      const id = active;
      writeJSON(
        'read.shelves',
        groupStore().filter((g) => g.id !== id),
      );
      writeJSON(
        'read.shelf',
        readJSON('read.shelf', []).map((b) =>
          groupOf(b) === id ? Object.assign({}, b, { group: 'default' }) : b,
        ),
      );
      setActive('default');
      renderShelf();
    });
  }

  shelfList.addEventListener('click', (e) => {
    const btn = e.target.closest('.shelf-remove');
    if (!btn) return;
    const slug = btn.dataset.slug;
    writeJSON(
      'read.shelf',
      readJSON('read.shelf', []).filter((b) => b.slug !== slug),
    );
    renderShelf();
  });

  // 先出空状态，再按本地记录补齐书目
  renderShelf();
  loadMeta()
    .then(renderShelf)
    .catch(() => {});
}
