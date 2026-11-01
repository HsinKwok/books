/** 阅读设置面板：字体 / 字号 / 行距 / 主题，脚本按 data-setting 接管 */
export function SettingsPanel() {
  return (
    <div class="settings-panel" id="settings-panel" hidden>
      <p class="settings-title">阅读设置</p>

      <div class="settings-group">
        <span class="settings-label">字体</span>
        <div class="seg">
          <button type="button" data-setting="face" data-value="system">
            系统
          </button>
          <button type="button" data-setting="face" data-value="web">
            思源宋体
          </button>
        </div>
      </div>

      <div class="settings-group">
        <span class="settings-label">字号</span>
        <div class="seg">
          <button type="button" data-setting="size" data-value="18">
            小
          </button>
          <button type="button" data-setting="size" data-value="20">
            标准
          </button>
          <button type="button" data-setting="size" data-value="22">
            大
          </button>
        </div>
      </div>

      <div class="settings-group">
        <span class="settings-label">行距</span>
        <div class="seg">
          <button type="button" data-setting="leading" data-value="1.7">
            紧
          </button>
          <button type="button" data-setting="leading" data-value="1.9">
            标准
          </button>
          <button type="button" data-setting="leading" data-value="2.1">
            松
          </button>
        </div>
      </div>

      <div class="settings-group">
        <span class="settings-label">主题</span>
        <div class="seg">
          <button type="button" data-setting="theme" data-value="light">
            纸白
          </button>
          <button type="button" data-setting="theme" data-value="night">
            夜间
          </button>
        </div>
      </div>

      <p class="settings-note">← → 切换章节，Esc 关闭面板</p>
    </div>
  );
}
