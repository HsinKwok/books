import type { Settings } from '../../../settings';
import { friendLinksText } from '../../../settings';

/** 内容：公告、友情链接、关于与隐私 */
export function ContentPanels({ settings }: { settings: Settings }) {
  return (
    <>
      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>公告与友情链接</h2>
        </div>
        <div class="admin-panel-body">
          <label class="admin-field">
            <span>公告条（留空则不显示，支持 Markdown）</span>
            <textarea name="announcement.text" rows={2} maxlength={120} data-markdown>
              {settings['announcement.text']}
            </textarea>
          </label>
          <label class="admin-field">
            <span>公告链接（可留空）</span>
            <input
              name="announcement.url"
              value={settings['announcement.url']}
              maxlength={200}
              placeholder="/b/fog-harbor 或 https://"
            />
          </label>
          <label class="admin-field">
            <span>友情链接（一行一条：名称 | https://…，名称支持 Markdown）</span>
            <textarea name="links.friends" rows={5} placeholder={'某个博客 | https://example.com'} data-markdown>
              {friendLinksText(settings)}
            </textarea>
          </label>
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>关于与隐私</h2>
          <span class="admin-panel-actions">
            <span class="admin-cell-sub">正文支持 Markdown</span>
          </span>
        </div>
        <div class="admin-panel-body">
          <div class="admin-form-grid">
            <label class="admin-field">
              <span>关于页标题</span>
              <input name="about.title" value={settings['about.title']} maxlength={40} />
            </label>
            <label class="admin-field">
              <span>隐私页标题</span>
              <input name="privacy.title" value={settings['privacy.title']} maxlength={40} />
            </label>
          </div>
          <label class="admin-field">
            <span>关于页正文</span>
            <textarea name="about.body" rows={6} data-markdown>
              {settings['about.body']}
            </textarea>
          </label>
          <label class="admin-field">
            <span>隐私页正文</span>
            <textarea name="privacy.body" rows={6} data-markdown>
              {settings['privacy.body']}
            </textarea>
          </label>
        </div>
      </section>
    </>
  );
}
