/**
 * 设置页选项卡与字段归属的唯一真源：
 * 页面按它渲染 tab 导航，路由按它只读写当前 tab 的键。
 */

import type { SettingKey } from '../../../settings';

export type TabKey = 'site' | 'home' | 'content' | 'talk' | 'access' | 'mail' | 'account';

export type SettingTab = {
  key: TabKey;
  label: string;
  /** 文本 / 下拉：原样取表单值 */
  fields: SettingKey[];
  /** 复选框：勾选为开 */
  toggles?: SettingKey[];
  /** 密码类：留空表示不修改 */
  secrets?: SettingKey[];
  /** 一行一条「名称 | 链接」，保存前要解析 */
  lists?: SettingKey[];
};

export const SETTING_TABS: SettingTab[] = [
  {
    key: 'site',
    label: '站点',
    fields: [
      'site.name',
      'site.mark',
      'site.tagline',
      'seo.title',
      'seo.description',
      'reader.size',
      'reader.leading',
      'reader.theme',
    ],
  },
  {
    key: 'home',
    label: '首页',
    fields: ['home.eyebrow', 'home.title1', 'home.title2', 'home.lede', 'footer.note', 'footer.read'],
    toggles: ['home.showUpdates', 'home.showStats', 'home.showResume', 'home.showNotes'],
  },
  {
    key: 'content',
    label: '内容',
    fields: [
      'announcement.text',
      'announcement.url',
      'about.title',
      'about.body',
      'privacy.title',
      'privacy.body',
    ],
    lists: ['links.friends'],
  },
  {
    key: 'talk',
    label: '互动',
    fields: ['discussion.enabled', 'discussion.mode', 'registration.open'],
  },
  {
    key: 'access',
    label: '访问',
    fields: ['access.mode', 'access.passwordNote', 'access.closedNote'],
    secrets: ['access.password'],
  },
  {
    key: 'mail',
    label: '发信',
    fields: ['mail.enabled', 'mail.secure', 'mail.host', 'mail.port', 'mail.user', 'mail.from', 'mail.fromName', 'mail.resetTtl'],
    secrets: ['mail.pass'],
  },
  { key: 'account', label: '账号', fields: [] },
];

/** 把 URL / 表单里的 tab 名收敛到已知值，未知时回落到「站点」 */
export function settingsTab(raw: unknown): TabKey {
  const name = String(raw ?? '');
  return SETTING_TABS.find((tab) => tab.key === name)?.key ?? 'site';
}

export function findSettingsTab(key: TabKey): SettingTab {
  return SETTING_TABS.find((tab) => tab.key === key) ?? SETTING_TABS[0];
}
