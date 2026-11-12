/**
 * wrangler 调用的公用包装层：读取项目 .env.local、注入账号凭据、走系统证书链。
 *
 * 本机有 TLS 中间代理，不加 --use-system-ca 会直接 fetch failed；
 * 多账号环境下也必须显式指定账号，否则 wrangler 会自己挑一个。
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ENV_FILE = '.env.local';
const WRANGLER = 'node_modules/wrangler/bin/wrangler.js';
/** 本机有 TLS 中间代理，走系统证书链才不会报错 */
const NODE_FLAGS = ['--use-system-ca'];
const REQUIRED_KEYS = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at < 0) continue;
    env[trimmed.slice(0, at).trim()] = trimmed
      .slice(at + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return env;
}

/**
 * .env.local 与当前进程环境合并。缺文件或缺关键项直接抛错，
 * 由调用方决定用什么前缀输出、怎么退出。
 */
export function mergedEnv(file = ENV_FILE) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    throw new Error(`缺少 ${file}，请写入 CLOUDFLARE_ACCOUNT_ID 与 CLOUDFLARE_API_TOKEN`);
  }

  const env = { ...process.env, ...parseEnv(text) };
  for (const key of REQUIRED_KEYS) {
    if (!env[key]) throw new Error(`${file} 里缺少 ${key}`);
  }
  return env;
}

/** 用系统证书链启动 wrangler，参数原样透传 */
export function runWrangler(args, env) {
  return spawnSync(process.execPath, [...NODE_FLAGS, WRANGLER, ...args], { stdio: 'inherit', env });
}
