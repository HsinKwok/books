import type { Settings } from '../../../settings';
import { Select } from './fields';

/** 访问：开放 / 口令 / 关闭，以及两种拦截页的说明 */
export function AccessPanel({ settings }: { settings: Settings }) {
  return (
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>访问控制</h2>
        <span class="admin-panel-actions">
          <span class="admin-cell-sub">
            {settings['access.password'] ? '口令已设置' : '尚未设置口令'}
          </span>
        </span>
      </div>
      <div class="admin-panel-body">
        <div class="admin-form-grid">
          <label class="admin-field">
            <span>前台状态</span>
            <Select
              name="access.mode"
              value={settings['access.mode']}
              options={[
                { value: 'open', label: '开放浏览' },
                { value: 'password', label: '需要访问口令' },
                { value: 'closed', label: '暂时关闭' },
              ]}
            />
          </label>
          <label class="admin-field">
            <span>访问口令（留空则不修改）</span>
            <input
              type="password"
              name="access.password"
              autocomplete="new-password"
              placeholder={settings['access.password'] ? '已设置，留空保持不变' : '至少 4 位'}
            />
          </label>
        </div>
        <label class="admin-field">
          <span>口令页说明（支持 Markdown）</span>
          <textarea name="access.passwordNote" rows={4} data-markdown>
            {settings['access.passwordNote']}
          </textarea>
        </label>
        <label class="admin-field">
          <span>关闭页说明（支持 Markdown）</span>
          <textarea name="access.closedNote" rows={4} data-markdown>
            {settings['access.closedNote']}
          </textarea>
        </label>
      </div>
    </section>
  );
}
