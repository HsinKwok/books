import type { Settings } from '../../../settings';
import { Select } from './fields';

/** 互动：讨论区与注册 */
export function TalkPanel({ settings }: { settings: Settings }) {
  return (
    <section class="admin-panel">
      <div class="admin-panel-head">
        <h2>讨论与注册</h2>
      </div>
      <div class="admin-panel-body">
        <div class="admin-form-grid">
          <label class="admin-field">
            <span>讨论区</span>
            <Select
              name="discussion.enabled"
              value={settings['discussion.enabled']}
              options={[
                { value: '1', label: '开放' },
                { value: '0', label: '关闭（前台只展示已有留言）' },
              ]}
            />
          </label>
          <label class="admin-field">
            <span>发言审核</span>
            <Select
              name="discussion.mode"
              value={settings['discussion.mode']}
              options={[
                { value: 'review', label: '先审后发' },
                { value: 'auto', label: '直接显示' },
              ]}
            />
          </label>
          <label class="admin-field">
            <span>读者注册</span>
            <Select
              name="registration.open"
              value={settings['registration.open']}
              options={[
                { value: '1', label: '开放注册' },
                { value: '0', label: '关闭注册' },
              ]}
            />
          </label>
        </div>
      </div>
    </section>
  );
}
