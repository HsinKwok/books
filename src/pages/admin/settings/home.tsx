import type { Settings } from '../../../settings';

/** 首页：文案、模块开关、页脚 */
export function HomePanels({ settings }: { settings: Settings }) {
  return (
    <>
      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>首页文案</h2>
        </div>
        <div class="admin-panel-body">
          <div class="admin-form-grid">
            <label class="admin-field">
              <span>上方小字</span>
              <input name="home.eyebrow" value={settings['home.eyebrow']} maxlength={40} />
            </label>
            <label class="admin-field">
              <span>大标题第一行</span>
              <input name="home.title1" value={settings['home.title1']} maxlength={30} />
            </label>
            <label class="admin-field">
              <span>大标题第二行</span>
              <input name="home.title2" value={settings['home.title2']} maxlength={30} />
            </label>
          </div>
          <label class="admin-field">
            <span>导语（支持 Markdown）</span>
            <textarea name="home.lede" rows={3} maxlength={300} data-markdown>
              {settings['home.lede']}
            </textarea>
          </label>
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>首页模块</h2>
        </div>
        <div class="admin-panel-body">
          <div class="admin-checks">
            <label class="admin-check">
              <input
                type="checkbox"
                name="home.showUpdates"
                value="1"
                checked={settings['home.showUpdates'] === '1'}
              />
              <span>最近更新</span>
            </label>
            <label class="admin-check">
              <input
                type="checkbox"
                name="home.showStats"
                value="1"
                checked={settings['home.showStats'] === '1'}
              />
              <span>阅读统计</span>
            </label>
            <label class="admin-check">
              <input
                type="checkbox"
                name="home.showResume"
                value="1"
                checked={settings['home.showResume'] === '1'}
              />
              <span>继续阅读</span>
            </label>
            <label class="admin-check">
              <input
                type="checkbox"
                name="home.showNotes"
                value="1"
                checked={settings['home.showNotes'] === '1'}
              />
              <span>怎么读</span>
            </label>
          </div>
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>页脚文案</h2>
        </div>
        <div class="admin-panel-body">
          <label class="admin-field">
            <span>收录统计（{'{books}'} {'{chapters}'} {'{words}'} 会被替换）</span>
            <textarea name="footer.note" rows={2} maxlength={200} data-markdown>
              {settings['footer.note']}
            </textarea>
          </label>
          <label class="admin-field">
            <span>读书记录（{'{readChapters}'} {'{readWords}'} 会被替换）</span>
            <textarea name="footer.read" rows={2} maxlength={200} data-markdown>
              {settings['footer.read']}
            </textarea>
          </label>
        </div>
      </section>
    </>
  );
}
