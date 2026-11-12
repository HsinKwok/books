/** 账号：修改密码，独立表单，不走设置保存 */
export function AccountPanel() {
  return (
    <form class="admin-form admin-settings" method="post" action="/admin/password">
      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>修改密码</h2>
          <span class="admin-panel-actions">
            <span class="admin-cell-sub">至少 8 位</span>
          </span>
        </div>
        <div class="admin-panel-body">
          <div class="admin-form-grid">
            <label class="admin-field">
              <span>当前密码</span>
              <input type="password" name="old" autocomplete="current-password" required />
            </label>
            <label class="admin-field">
              <span>新密码</span>
              <input type="password" name="password" minlength={8} autocomplete="new-password" required />
            </label>
            <label class="admin-field">
              <span>再输一次</span>
              <input type="password" name="confirm" minlength={8} autocomplete="new-password" required />
            </label>
          </div>
          <div class="admin-checks">
            <label class="admin-check">
              <input type="checkbox" name="keep" value="1" />
              <span>保留其他设备的登录状态（不勾选则全部退出）</span>
            </label>
          </div>
          <div class="admin-form-foot">
            <button class="btn" type="submit">
              更新密码
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}
