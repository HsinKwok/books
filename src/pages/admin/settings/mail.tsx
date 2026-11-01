import type { Settings } from '../../../settings';
import { Select } from './fields';

/** 发信：SMTP 配置 + 发送测试邮件 */
export function MailPanels({ settings, email }: { settings: Settings; email: string }) {
  return (
    <>
      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>发信（忘记密码）</h2>
          <span class="admin-panel-actions">
            <span class="admin-cell-sub">
              {settings['mail.pass'] ? '授权码已填写' : '尚未填写授权码'}
            </span>
          </span>
        </div>
        <div class="admin-panel-body">
          <div class="admin-form-grid">
            <label class="admin-field">
              <span>发信功能</span>
              <Select
                name="mail.enabled"
                value={settings['mail.enabled']}
                options={[
                  { value: '1', label: '开启（读者可自助找回密码）' },
                  { value: '0', label: '关闭' },
                ]}
              />
            </label>
            <label class="admin-field">
              <span>加密方式</span>
              <Select
                name="mail.secure"
                value={settings['mail.secure']}
                options={[
                  { value: 'tls', label: 'TLS（465）' },
                  { value: 'starttls', label: 'STARTTLS（587）' },
                ]}
              />
            </label>
            <label class="admin-field">
              <span>SMTP 主机</span>
              <input name="mail.host" value={settings['mail.host']} placeholder="smtp.example.com" />
            </label>
            <label class="admin-field">
              <span>端口</span>
              <input type="number" name="mail.port" value={settings['mail.port']} min={1} max={65535} />
            </label>
            <label class="admin-field">
              <span>账号</span>
              <input
                name="mail.user"
                value={settings['mail.user']}
                autocomplete="off"
                placeholder="noreply@example.com"
              />
            </label>
            <label class="admin-field">
              <span>授权码 / 密码（留空则不修改）</span>
              <input
                type="password"
                name="mail.pass"
                autocomplete="new-password"
                placeholder={settings['mail.pass'] ? '已填写，留空保持不变' : '邮箱服务商给的授权码'}
              />
            </label>
            <label class="admin-field">
              <span>发件人地址</span>
              <input
                type="email"
                name="mail.from"
                value={settings['mail.from']}
                placeholder="noreply@example.com"
              />
            </label>
            <label class="admin-field">
              <span>发件人名称</span>
              <input name="mail.fromName" value={settings['mail.fromName']} maxlength={30} />
            </label>
            <label class="admin-field">
              <span>重置链接有效期（分钟，10–1440）</span>
              <input
                type="number"
                name="mail.resetTtl"
                value={settings['mail.resetTtl']}
                min={10}
                max={1440}
              />
            </label>
          </div>
          <p class="admin-cell-sub">
            465 端口选「TLS」，587 端口选「STARTTLS」。发件地址通常要和账号一致，否则容易被拒信。
            发信失败时，重置链接会写进操作日志，可以手动转交。
          </p>
        </div>
      </section>

      <section class="admin-panel">
        <div class="admin-panel-head">
          <h2>发送测试邮件</h2>
          <span class="admin-panel-actions">
            <span class="admin-cell-sub">先保存上面的配置，再测试</span>
          </span>
        </div>
        <div class="admin-panel-body">
          <div class="admin-form-grid">
            <label class="admin-field">
              <span>收件邮箱</span>
              <input type="email" name="to" value={email} required />
            </label>
          </div>
          <div class="admin-form-foot">
            <button class="btn" type="submit" formaction="/admin/settings/mail-test">
              发送测试
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
