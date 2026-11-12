import { AuthPage, Field } from './ui';

export function LoginPage({
  next = '/',
  error,
  registrationOpen = true,
}: {
  next?: string;
  error?: string;
  registrationOpen?: boolean;
}) {
  return (
    <AuthPage
      kicker="读者登录"
      title="把书签带着走"
      error={error}
      note={
        <>
          <a class="inline-link" href="/forgot">
            忘记密码？
          </a>
          {registrationOpen ? (
            <>
              {' '}
              还没有账号？
              <a class="inline-link" href="/register">
                注册一个
              </a>
              。站长与编辑从「后台」进入。
            </>
          ) : (
            ' 本站暂未开放注册。站长与编辑从「后台」进入。'
          )}
        </>
      }
    >
      <form class="form" method="post" action="/login">
        <input type="hidden" name="next" value={next} />
        <Field label="邮箱" name="email" type="email" autocomplete="username" required />
        <Field label="密码" name="password" type="password" autocomplete="current-password" required />
        <button class="btn btn-full" type="submit">
          登录
        </button>
      </form>
    </AuthPage>
  );
}

export function ForgotPage({
  email = '',
  error,
  sent,
  ready = true,
  minutes = 60,
}: {
  email?: string;
  error?: string;
  sent?: boolean;
  ready?: boolean;
  minutes?: number;
}) {
  if (sent) {
    return (
      <AuthPage
        kicker="找回密码"
        title="去邮箱看看"
        note={
          <a class="inline-link" href="/login">
            回登录页
          </a>
        }
      >
        <p class="page-note">
          如果这个邮箱注册过，重置邮件已经发出。链接 {minutes} 分钟内有效，只能用一次；
          没收到的话看一眼垃圾箱，或者过一会儿再申请。
        </p>
      </AuthPage>
    );
  }

  return (
    <AuthPage
      kicker="找回密码"
      title="重置登录密码"
      error={error}
      note={
        ready
          ? '我们会给这个邮箱发一封带链接的信，点开就能设置新密码。没有注册过的邮箱不会收到信。'
          : '站长还没有配置发信邮箱，暂时无法自助重置密码，请联系站长处理。'
      }
    >
      {ready ? (
        <form class="form" method="post" action="/forgot">
          <Field label="注册邮箱" name="email" type="email" value={email} autocomplete="email" required />
          <button class="btn btn-full" type="submit">
            发送重置邮件
          </button>
        </form>
      ) : null}
    </AuthPage>
  );
}

export function ResetPage({
  token,
  email,
  error,
  minLength = 8,
}: {
  token?: string;
  email?: string;
  error?: string;
  minLength?: number;
}) {
  const valid = !!token;
  return (
    <AuthPage
      kicker="重置密码"
      title={valid ? '设置新密码' : '链接不能用'}
      error={error}
      note={
        valid ? (
          `密码至少 ${minLength} 位。保存后其他设备上的登录会失效。`
        ) : (
          <>
            链接可能已经用过或者过期了。
            <a class="inline-link" href="/forgot">
              重新申请
            </a>
          </>
        )
      }
    >
      {valid ? (
        <>
          {email ? <p class="page-note">正在为 {email} 设置新密码。</p> : null}
          <form class="form" method="post" action="/reset">
            <input type="hidden" name="token" value={token} />
            <Field
              label="新密码"
              name="password"
              type="password"
              minlength={minLength}
              autocomplete="new-password"
              required
            />
            <Field
              label="再输一次"
              name="confirm"
              type="password"
              minlength={minLength}
              autocomplete="new-password"
              required
            />
            <button class="btn btn-full" type="submit">
              保存新密码
            </button>
          </form>
        </>
      ) : null}
    </AuthPage>
  );
}

export function RegisterPage({ error }: { error?: string }) {
  return (
    <AuthPage kicker="读者注册" title="开一个读者账号" error={error} note="密码至少 6 位。注册后自动登录。">
      <form class="form" method="post" action="/register">
        <Field label="昵称" name="name" maxlength={20} autocomplete="nickname" required />
        <Field label="邮箱" name="email" type="email" autocomplete="email" required />
        <Field label="密码" name="password" type="password" minlength={6} autocomplete="new-password" required />
        <button class="btn btn-full" type="submit">
          注册
        </button>
      </form>
    </AuthPage>
  );
}
