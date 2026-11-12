/**
 * 极简 SMTP 客户端。
 * Workers 只禁止 25 端口，465（隐式 TLS）与 587（STARTTLS）都能连，
 * 所以这里直接用 cloudflare:sockets 完成发信，不依赖第三方邮件 API。
 */

import { connect } from 'cloudflare:sockets';
import type { Settings } from './settings';

export class MailError extends Error {}

const CRLF = '\r\n';
const TIMEOUT = 12_000;

type Reply = { code: number; lines: string[] };

function base64(text: string) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** MIME 正文：按 76 字符折行 */
function base64Block(text: string) {
  return (base64(text).match(/.{1,76}/g) ?? []).join(CRLF);
}

/** 非 ASCII 邮件头用 RFC 2047 编码字 */
function encodedWord(text: string) {
  return (base64(text).match(/.{1,45}/g) ?? [])
    .map((part) => `=?UTF-8?B?${part}?=`)
    .join(`${CRLF} `);
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mailReady(settings: Settings) {
  return (
    settings['mail.enabled'] === '1' &&
    settings['mail.host'].trim() !== '' &&
    settings['mail.user'].trim() !== '' &&
    settings['mail.pass'] !== '' &&
    settings['mail.from'].trim() !== ''
  );
}

class Session {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private pending = '';
  private decoder = new TextDecoder();

  constructor(private socket: Socket) {
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }

  /** STARTTLS：升级后必须重建读写流 */
  upgrade() {
    this.reader.releaseLock();
    this.writer.releaseLock();
    this.socket = this.socket.startTls();
    this.reader = this.socket.readable.getReader();
    this.writer = this.socket.writable.getWriter();
    this.pending = '';
  }

  private async line() {
    for (;;) {
      const at = this.pending.indexOf('\n');
      if (at >= 0) {
        const line = this.pending.slice(0, at).replace(/\r$/, '');
        this.pending = this.pending.slice(at + 1);
        return line;
      }
      const { value, done } = await this.reader.read();
      if (done) throw new MailError('邮件服务器提前断开了连接。');
      this.pending += this.decoder.decode(value, { stream: true });
    }
  }

  /** 读取完整响应（250-xxx 这类多行响应会一直读到「250 」为止） */
  async reply(): Promise<Reply> {
    const lines: string[] = [];
    for (;;) {
      const line = await this.line();
      lines.push(line);
      if (/^\d{3}(?: |$)/.test(line)) return { code: Number(line.slice(0, 3)), lines };
    }
  }

  async write(text: string) {
    await this.writer.write(new TextEncoder().encode(text + CRLF));
  }

  async command(text: string, expect: number[], label = text) {
    await this.write(text);
    const reply = await this.reply();
    if (!expect.includes(reply.code)) {
      throw new MailError(`${label} 失败：${reply.lines.join(' ')}`);
    }
    return reply;
  }

  async quit() {
    try {
      await this.write('QUIT');
      await this.writer.close();
    } catch {
      // 关闭阶段出错不影响结果
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new MailError('连接邮件服务器超时。')), ms),
    ),
  ]);
}

async function deliver(
  settings: Settings,
  message: { to: string; subject: string; html: string },
) {
  const host = settings['mail.host'].trim();
  const port = Number(settings['mail.port']) || 465;
  const from = settings['mail.from'].trim();
  const fromName = settings['mail.fromName'].trim() || settings['site.name'] || '书架';
  const startTls = settings['mail.secure'] === 'starttls';
  const domain = from.split('@')[1] || 'localhost';

  const socket = connect(
    { hostname: host, port },
    { secureTransport: startTls ? 'starttls' : 'on', allowHalfOpen: false },
  );

  try {
    await socket.opened;
    const session = new Session(socket);

    const greeting = await session.reply();
    if (greeting.code !== 220) throw new MailError(`连接被拒绝：${greeting.lines.join(' ')}`);

    const helo = `EHLO ${domain}`;
    await session.command(helo, [250], 'EHLO');

    if (startTls) {
      await session.command('STARTTLS', [220], 'STARTTLS');
      session.upgrade();
      await session.command(helo, [250], 'EHLO');
    }

    await session.command('AUTH LOGIN', [334], '登录');
    await session.command(base64(settings['mail.user'].trim()), [334], '用户名');
    await session.command(base64(settings['mail.pass']), [235], '密码');

    await session.command(`MAIL FROM:<${from}>`, [250], '发件人');
    await session.command(`RCPT TO:<${message.to}>`, [250, 251], '收件人');
    await session.command('DATA', [354], 'DATA');

    const headers = [
      `Date: ${new Date().toUTCString()}`,
      `From: ${encodedWord(fromName)} <${from}>`,
      `To: <${message.to}>`,
      `Subject: ${encodedWord(message.subject)}`,
      `Message-ID: <${crypto.randomUUID()}@${domain}>`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
    ].join(CRLF);

    await session.write(`${headers}${CRLF}${CRLF}${base64Block(message.html)}`);
    await session.write('.');
    const accepted = await session.reply();
    if (accepted.code !== 250) throw new MailError(`邮件被拒收：${accepted.lines.join(' ')}`);

    await session.quit();
  } finally {
    try {
      socket.close();
    } catch {
      // 已关闭
    }
  }
}

export async function sendMail(
  settings: Settings,
  message: { to: string; subject: string; html: string },
) {
  if (!mailReady(settings)) throw new MailError('还没有在后台配置发信账号。');
  await withTimeout(deliver(settings, message), TIMEOUT);
}

/** 忘记密码的重置邮件 */
export function resetMail(siteName: string, link: string, minutes: number) {
  const name = escapeHtml(siteName);
  return {
    subject: `重置你在「${siteName}」的密码`,
    html: `<!doctype html>
<html lang="zh-CN"><body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,'Segoe UI',sans-serif;color:#222">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8a8a8a">${name}</p>
    <h1 style="margin:0 0 16px;font-size:20px">重置密码</h1>
    <p style="margin:0 0 20px;line-height:1.8;font-size:15px">
      有人（希望是你）在「${name}」申请重置这个邮箱的登录密码。点击下面的按钮设置新密码。
    </p>
    <p style="margin:0 0 20px">
      <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#1f1f1f;color:#fff;text-decoration:none;font-size:15px">设置新密码</a>
    </p>
    <p style="margin:0 0 12px;font-size:13px;line-height:1.8;color:#666">
      链接 ${minutes} 分钟内有效，只能用一次。如果不是你操作的，忽略这封邮件即可，密码不会变化。
    </p>
    <p style="margin:0;font-size:12px;line-height:1.7;color:#999;word-break:break-all">${escapeHtml(link)}</p>
  </div>
</body></html>`,
  };
}
