/**
 * 部署包装器：把本项目 .env.local 里的账号与 token 注入 wrangler。
 *
 * 多账号环境下，`wrangler login` 的登录态是全用户共享的，wrangler 在没指定账号时
 * 会自己挑一个，很容易把 A 项目部署到 B 账号。这里改成：
 * 每个项目只用自己的 .env.local（不进 git），账号写死，缺一项就直接失败。
 */
import { mergedEnv, runWrangler } from './wrangler-env.mjs';

function fail(message) {
  console.error(`[deploy] ${message}`);
  process.exit(1);
}

let env;
try {
  env = mergedEnv();
} catch (error) {
  fail(error.message);
}

// 先确认 token 与账号可用，避免部署到一半才发现凭据不对
const whoami = runWrangler(['whoami'], env);
if (whoami.status !== 0) fail('凭据校验失败，检查 .env.local 里的 token 是否过期或缺少权限');

const deployed = runWrangler(['deploy', ...process.argv.slice(2)], env);
process.exit(deployed.status ?? 1);
