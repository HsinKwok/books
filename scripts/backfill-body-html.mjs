/**
 * 一次性回填：把历史章节的正文预渲染成 HTML 存进 chapters.body_html。
 * 需要 Node 22.18+（默认可直接 import .ts）。用法：
 *   node scripts/backfill-body-html.mjs            # 本地库
 *   node scripts/backfill-body-html.mjs --remote   # 线上库
 * 只处理 body_html / body_hash 为空的行，跑完自动结束，可重复执行。
 */
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderMarkdown } from '../src/markdown.ts';
import { contentKey } from '../src/cache.ts';

const remote = process.argv.includes('--remote');
const BATCH = 20;
// 直接跑本地 wrangler 的入口，避免 Windows 上 spawn npx.cmd 的 EINVAL
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const target = ['d1', 'execute', 'book', remote ? '--remote' : '--local'];

/** 同步等待，execFileSync 场景下用 Atomics.wait 不阻塞事件循环 */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** 本地 miniflare 偶发 "Failed to get session commit token"（dev 实例共用同一份 sqlite），重试即可 */
function run(args, tries = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return execFileSync(process.execPath, [wrangler, ...target, ...args], { encoding: 'utf8' });
    } catch (error) {
      if (attempt >= tries) throw error;
      console.warn(`wrangler 执行失败（第 ${attempt} 次），${attempt * 2}s 后重试`);
      sleep(attempt * 2000);
    }
  }
}

function query(sql) {
  const out = run(['--json', '--command', sql]);
  // 输出形如 [{ results: [...], success: true }]
  const parsed = JSON.parse(out.slice(out.indexOf('[')));
  return parsed[0]?.results ?? [];
}

const pending = () =>
  query(
    `SELECT id, body FROM chapters
      WHERE (body_html IS NULL OR body_hash IS NULL) AND body IS NOT NULL
      ORDER BY id LIMIT ${BATCH}`,
  );

let done = 0;
for (;;) {
  const rows = pending();
  if (!rows.length) break;
  const statements = rows.map((row) => {
    const html = renderMarkdown(row.body);
    const hex = Buffer.from(html, 'utf8').toString('hex');
    return `UPDATE chapters SET body_html = CAST(X'${hex}' AS TEXT), body_hash = '${contentKey(
      row.body,
    )}' WHERE id = ${row.id};`;
  });
  const file = join(tmpdir(), `book-body-html-${process.pid}.sql`);
  writeFileSync(file, statements.join('\n'), 'utf8');
  try {
    run(['--file', file]);
  } finally {
    rmSync(file, { force: true });
  }
  done += rows.length;
  console.log(`已回填 ${done} 章`);
}

console.log(`完成：共回填 ${done} 章`);
