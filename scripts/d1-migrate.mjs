/**
 * 远端 D1 迁移包装器：和 deploy.mjs 共用 .env.local 凭据与系统证书链。
 * 直接跑 `wrangler d1 migrations apply --remote` 在本机会因证书/账号选择问题报 fetch failed。
 */
import { mergedEnv, runWrangler } from './wrangler-env.mjs';

function fail(message) {
  console.error(`[d1-migrate] ${message}`);
  process.exit(1);
}

let env;
try {
  env = mergedEnv();
} catch (error) {
  fail(error.message);
}

const applied = runWrangler(['d1', 'migrations', 'apply', 'book', '--remote'], env);
process.exit(applied.status ?? 1);
