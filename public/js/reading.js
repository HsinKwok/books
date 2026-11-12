import { $, $$, readJSON, writeJSON } from './core.js';
import { loadToc, tocPanelItem } from './toc.js';

/* ---------- settings panel ---------- */
const panel = $('#settings-panel');
const settingsBtn = $('#settings-btn');
const setPanel = (open) => {
  if (!panel || !settingsBtn) return;
  panel.hidden = !open;
  settingsBtn.setAttribute('aria-expanded', String(open));
};
if (panel && settingsBtn) {
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setPanel(panel.hidden);
  });
  document.addEventListener('click', (e) => {
    if (panel.hidden) return;
    if (panel.contains(e.target) || settingsBtn.contains(e.target)) return;
    setPanel(false);
  });
}

/* ---------- toc panel ---------- */
const tocPanel = $('#toc-panel');
const tocBtn = $('#toc-btn');
const setToc = (open) => {
  if (!tocPanel || !tocBtn) return;
  tocPanel.hidden = !open;
  tocBtn.setAttribute('aria-expanded', String(open));
};
if (tocPanel && tocBtn) {
  const list = $('.toc-panel-list', tocPanel);
  let filling = null;

  const scrollToCurrent = () => {
    const current = tocPanel.querySelector('.toc-panel-list a.is-current');
    if (!current) return;
    const p = tocPanel.getBoundingClientRect();
    const r = current.getBoundingClientRect();
    tocPanel.scrollTop += r.top - p.top - (p.height - r.height) / 2;
  };

  // 目录不随页面下发，第一次打开抽屉时才拉，之后复用同一份数据
  const fillToc = () => {
    if (!list || list.childElementCount) return Promise.resolve();
    if (filling) return filling;

    filling = loadToc(list.dataset.toc).then((data) => {
      if (!data) {
        list.innerHTML = '<li class="toc-panel-note">目录加载失败，可打开书籍页查看</li>';
        return;
      }
      const current = Number(list.dataset.current);
      list.replaceChildren(...data.chapters.map((ch) => tocPanelItem(data.slug, ch, current)));

      const done = readJSON('read.done', []);
      $$('a', list).forEach((a) => {
        if (done.includes(`${a.dataset.book}:${a.dataset.idx}`)) a.classList.add('is-read');
      });
    });
    return filling;
  };

  tocBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = tocPanel.hidden;
    setToc(open);
    if (open) {
      setPanel(false);
      fillToc().then(scrollToCurrent);
    }
  });
  document.addEventListener('click', (e) => {
    if (tocPanel.hidden) return;
    if (tocPanel.contains(e.target) || tocBtn.contains(e.target)) return;
    setToc(false);
  });
}

/* ---------- shelf button (reading bar) ---------- */
const shelfBtn = $('#shelf-btn');
if (shelfBtn) {
  const slug = shelfBtn.dataset.slug;
  const syncShelf = () => {
    const inShelf = readJSON('read.shelf', []).some((b) => b.slug === slug);
    const label = inShelf ? '已在书架' : '加入书架';
    shelfBtn.classList.toggle('is-on', inShelf);
    shelfBtn.setAttribute('aria-pressed', String(inShelf));
    shelfBtn.setAttribute('aria-label', label);
    shelfBtn.dataset.tip = label;
  };
  shelfBtn.addEventListener('click', () => {
    const list = readJSON('read.shelf', []);
    const i = list.findIndex((b) => b.slug === slug);
    if (i >= 0) list.splice(i, 1);
    else list.unshift({ slug, title: shelfBtn.dataset.title || '', at: Date.now(), group: 'default' });
    writeJSON('read.shelf', list);
    syncShelf();
  });
  syncShelf();
}

/* ---------- progress ---------- */
const chapterEl = $('#prose');
const body = document.body;
const bookSlug = body.dataset.book;
const chapterIdx = Number(body.dataset.chapter || 0);
const bookTitle = body.dataset.bookTitle || '';
const chapterTitle = body.dataset.chapterTitle || '';
const progressBar = $('#progress-bar');
const progressText = $('#progress-text');
let lastRatio = 0;

/* 服务端进度（登录用户才会输出，未登录为 null） */
let serverProgress = null;
try {
  serverProgress = JSON.parse($('#read-progress')?.textContent || 'null');
} catch {
  serverProgress = null;
}
const signedIn = body.dataset.user === '1';
let lastSync = 0;
let restoring = false;

/** Speculation Rules 预渲染时页面在后台执行，不能提前写本地和服务端进度 */
const prerendering = () => document.prerendering === true;

const syncProgress = (force = false) => {
  if (restoring || !signedIn || !bookSlug || !chapterIdx) return;
  if (prerendering()) return;
  const now = Date.now();
  if (!force && now - lastSync < 10000) return;
  lastSync = now;
  const payload = JSON.stringify({
    slug: bookSlug,
    idx: chapterIdx,
    ratio: Number(lastRatio.toFixed(4)),
  });
  if (force && navigator.sendBeacon) {
    navigator.sendBeacon('/api/progress', new Blob([payload], { type: 'application/json' }));
    return;
  }
  fetch('/api/progress', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
    keepalive: force,
  }).catch(() => {});
};

const currentRatio = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return 1;
  return Math.min(1, Math.max(0, window.scrollY / max));
};

const markDone = (slug, idx) => {
  const done = readJSON('read.done', []);
  const key = `${slug}:${idx}`;
  if (!done.includes(key)) {
    done.push(key);
    writeJSON('read.done', done);
  }
};

const saveProgress = () => {
  if (!bookSlug || !chapterIdx) return;
  if (prerendering()) return;
  const record = {
    slug: bookSlug,
    idx: chapterIdx,
    ratio: Number(lastRatio.toFixed(4)),
    chapterTitle,
    bookTitle,
    at: Date.now(),
  };
  writeJSON('read.progress', record);
  if (lastRatio >= 0.92) markDone(bookSlug, chapterIdx);
  syncProgress();
};

if (chapterEl) {
  const saved = readJSON('read.progress', null);
  const localRatio =
    saved && saved.slug === bookSlug && saved.idx === chapterIdx && saved.ratio > 0.03
      ? saved.ratio
      : 0;
  const remoteRatio =
    serverProgress &&
    serverProgress.slug === bookSlug &&
    serverProgress.idx === chapterIdx &&
    serverProgress.ratio > 0.03
      ? serverProgress.ratio
      : 0;
  const restore = Math.max(localRatio, remoteRatio);
  if (restore > 0.03) {
    restoring = true;
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: Math.round(max * restore) });
      restoring = false;
      lastSync = Date.now();
    });
  }

  let ticking = false;
  const onScroll = () => {
    lastRatio = currentRatio();
    if (progressBar) progressBar.style.width = `${(lastRatio * 100).toFixed(2)}%`;
    if (progressText) progressText.textContent = `${Math.round(lastRatio * 100)}%`;
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      saveProgress();
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  window.addEventListener('pagehide', () => {
    saveProgress();
    syncProgress(true);
  });

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.key === 'Escape') {
      setPanel(false);
      setToc(false);
      return;
    }
    if (e.key === 'ArrowLeft') {
      const prev = $('[data-nav="prev"]');
      if (prev && prev.tagName === 'A') location.href = prev.getAttribute('href');
    }
    if (e.key === 'ArrowRight') {
      const next = $('[data-nav="next"]');
      if (next && next.tagName === 'A') location.href = next.getAttribute('href');
    }
  });
}
