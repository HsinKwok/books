import type { Settings } from '../../../settings';
import { Select } from './fields';

/** 站点：站点信息 + 阅读器默认值 */
export function SitePanels({ settings }: { settings: Settings }) {
  return (
    <>
      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>站点信息</h2>
        </div>
        <div class="admin-panel-body">
          <div class="admin-form-grid">
            <label class="admin-field">
              <span>站名</span>
              <input name="site.name" value={settings['site.name']} maxlength={20} required />
            </label>
            <label class="admin-field">
              <span>站名角标</span>
              <input name="site.mark" value={settings['site.mark']} maxlength={3} placeholder="*" />
            </label>
            <label class="admin-field">
              <span>侧栏标语</span>
              <input name="site.tagline" value={settings['site.tagline']} maxlength={30} />
            </label>
          </div>
          <label class="admin-field">
            <span>浏览器标题（首页）</span>
            <input name="seo.title" value={settings['seo.title']} maxlength={80} />
          </label>
          <label class="admin-field">
            <span>默认 SEO 描述（支持 Markdown，显示时去标记）</span>
            <textarea name="seo.description" rows={2} maxlength={200} data-markdown>
              {settings['seo.description']}
            </textarea>
          </label>
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>阅读器默认值</h2>
          <span class="admin-panel-actions">
            <span class="admin-cell-sub">读者本地改过字号后，以本地为准</span>
          </span>
        </div>
        <div class="admin-panel-body">
          <div class="admin-form-grid">
            <label class="admin-field">
              <span>默认字号</span>
              <Select
                name="reader.size"
                value={settings['reader.size']}
                options={[
                  { value: '18', label: '小 18px' },
                  { value: '20', label: '标准 20px' },
                  { value: '22', label: '大 22px' },
                ]}
              />
            </label>
            <label class="admin-field">
              <span>默认行距</span>
              <Select
                name="reader.leading"
                value={settings['reader.leading']}
                options={[
                  { value: '1.7', label: '紧 1.7' },
                  { value: '1.9', label: '标准 1.9' },
                  { value: '2.1', label: '松 2.1' },
                ]}
              />
            </label>
            <label class="admin-field">
              <span>默认主题</span>
              <Select
                name="reader.theme"
                value={settings['reader.theme'] === 'dark' ? 'night' : settings['reader.theme']}
                options={[
                  { value: 'light', label: '浅色' },
                  { value: 'night', label: '深色' },
                ]}
              />
            </label>
          </div>
        </div>
      </section>
    </>
  );
}
