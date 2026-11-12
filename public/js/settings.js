import { $$, readJSON, writeJSON, root } from './core.js';

const storedTheme = () => {
  try {
    return localStorage.getItem('read.theme') || '';
  } catch {
    return '';
  }
};

// 服务端下发的默认值（后台「设置」里配的），只在本地没改过时生效
const serverDefaults = () => {
  try {
    return JSON.parse(document.getElementById('read-defaults')?.textContent || '{}');
  } catch {
    return {};
  }
};

const defaults = Object.assign({ size: 20, leading: 1.9, theme: 'light' }, serverDefaults());

export const settings = Object.assign(
  {
    size: defaults.size,
    leading: defaults.leading,
    theme: storedTheme() || defaults.theme,
    face: 'system',
  },
  readJSON('read.settings', {}),
);

// 可选：思源宋体（Noto Serif SC），只在读者主动开启时下载
const WEB_SERIF_HREF =
  'https://fonts.googleapis.cn/css2?family=Noto+Serif+SC:wght@400;600&display=swap';
let webSerifRequested = false;

const loadWebSerif = () => {
  if (webSerifRequested) return;
  webSerifRequested = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = WEB_SERIF_HREF;
  document.head.appendChild(link);
};

export const applySettings = () => {
  const face = settings.face === 'web' ? 'web' : 'system';
  root.style.setProperty('--read-size', `${settings.size}px`);
  root.style.setProperty('--read-lh', String(settings.leading));
  root.dataset.theme = settings.theme || 'light';
  root.dataset.face = face;
  if (face === 'web') loadWebSerif();
  $$('[data-setting]').forEach((btn) => {
    const group = btn.dataset.setting;
    const value = btn.dataset.value;
    const active =
      group === 'theme'
        ? value === (settings.theme || 'light')
        : group === 'face'
          ? value === face
          : String(settings[group]) === value;
    btn.classList.toggle('is-active', active);
  });
  const night = (settings.theme || 'light') === 'night';
  $$('[data-theme-toggle]').forEach((btn) => {
    const label = night ? '切换到浅色模式' : '切换到夜间模式';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
    btn.setAttribute('aria-pressed', String(night));
  });
};

export const saveSettings = () => {
  writeJSON('read.settings', {
    size: settings.size,
    leading: settings.leading,
    face: settings.face,
  });
  try {
    localStorage.setItem('read.theme', settings.theme || 'light');
  } catch {}
};

$$('[data-setting]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const group = btn.dataset.setting;
    if (group === 'theme') {
      settings.theme = btn.dataset.value;
    } else if (group === 'face') {
      settings.face = btn.dataset.value === 'web' ? 'web' : 'system';
    } else if (group === 'size') {
      settings.size = Number(btn.dataset.value);
    } else {
      settings.leading = Number(btn.dataset.value);
    }
    saveSettings();
    applySettings();
  });
});

$$('[data-theme-toggle]').forEach((btn) => {
  btn.addEventListener('click', () => {
    settings.theme = (settings.theme || 'light') === 'night' ? 'light' : 'night';
    saveSettings();
    applySettings();
  });
});
