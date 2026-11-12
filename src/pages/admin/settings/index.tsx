import type { SessionUser } from '../../../env';
import type { Settings } from '../../../settings';
import { AdminHead, AdminLayout } from '../layout';
import { AccountPanel } from './account';
import { AccessPanel } from './access';
import { ContentPanels } from './content';
import { HomePanels } from './home';
import { MailPanels } from './mail';
import { SETTING_TABS, type TabKey } from './schema';
import { SitePanels } from './site';
import { TalkPanel } from './talk';

/** 某个 tab 对应的面板内容；按需加载接口和首屏渲染共用 */
export function SettingsPanels({
  tab,
  settings,
  email,
}: {
  tab: TabKey;
  settings: Settings;
  email: string;
}) {
  switch (tab) {
    case 'site':
      return <SitePanels settings={settings} />;
    case 'home':
      return <HomePanels settings={settings} />;
    case 'content':
      return <ContentPanels settings={settings} />;
    case 'talk':
      return <TalkPanel settings={settings} />;
    case 'access':
      return <AccessPanel settings={settings} />;
    case 'mail':
      return <MailPanels settings={settings} email={email} />;
    case 'account':
      return <AccountPanel />;
    default:
      return <SitePanels settings={settings} />;
  }
}

/**
 * 当前 tab 的完整内容：普通 tab 是一个独立表单，只提交本 tab 的字段；
 * 账号 tab 是修改密码表单，动作不同。
 */
export function SettingsTabPanel({
  tab,
  settings,
  email,
}: {
  tab: TabKey;
  settings: Settings;
  email: string;
}) {
  if (tab === 'account') return <AccountPanel />;

  return (
    <form class="admin-form admin-settings" method="post" action="/admin/settings">
      <input type="hidden" name="tab" value={tab} />
      <SettingsPanels tab={tab} settings={settings} email={email} />
      <div class="admin-form-foot admin-settings-save">
        <button class="btn" type="submit">
          保存设置
        </button>
        <a class="admin-mini" href="/" target="_blank" rel="noreferrer">
          查看前台
        </a>
      </div>
    </form>
  );
}

export function SettingsPage({
  user,
  settings,
  tab,
  notice,
  theme,
}: {
  user: SessionUser;
  settings: Settings;
  tab: TabKey;
  notice?: string;
  theme?: string;
}) {
  return (
    <AdminLayout title="设置 · 后台" active="settings" user={user} notice={notice} theme={theme}>
      <AdminHead
        kicker="Settings"
        title="站点设置"
        note="每个标签页单独保存；这里的文案与开关会立刻作用到前台，刷新前台即可看到。"
      />

      <nav class="admin-tabs" role="tablist" data-tabs="settings" data-active={tab}>
        {SETTING_TABS.map((item) => (
          <a
            class={item.key === tab ? 'admin-tab is-active' : 'admin-tab'}
            href={`/admin/settings?tab=${item.key}`}
            role="tab"
            aria-selected={item.key === tab ? 'true' : 'false'}
            data-tab={item.key}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div id="settings-panel">
        <SettingsTabPanel tab={tab} settings={settings} email={user.email} />
      </div>
    </AdminLayout>
  );
}
