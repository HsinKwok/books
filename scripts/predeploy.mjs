import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// esbuild 由 wrangler 一并安装；万一环境里没有，就跳过压缩、只做哈希副本，构建不会失败
let esbuild = null;
try {
  esbuild = (await import('esbuild')).default;
} catch {
  console.warn('未找到 esbuild，本次跳过压缩（只生成哈希副本）');
}

// 静态资源版本号 + 压缩：
// - CSS 用 <名字>.<内容哈希>.css 副本，文件名一变就是新资源，可以放心长缓存；
// - JS 模块之间是静态 import，没法逐个带查询串，所以额外生成 <名字>.<哈希>.js 副本，
//   并把副本里的 import 说明符改写成依赖自己的哈希名（依赖变了，引用方也会换名）；
// - 两类副本都会用 esbuild 压缩一遍，源文件保持可读，线上只下载压缩后的版本。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = path.join(ROOT, 'src/assets.generated.ts');

/** 生成副本的命名：core.a1b2c3d4.js / site.a1b2c3d4.css */
const HASHED = /\.[0-9a-f]{8}\.(js|css)$/;

function walk(dir) {
  const out = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const relOf = (file) => `/${path.relative(PUBLIC, file).split(path.sep).join('/')}`;
const isSource = (file) => /\.(css|js)$/.test(file) && !HASHED.test(path.basename(file));

const all = walk(PUBLIC);
const jsFiles = all.filter((file) => file.endsWith('.js') && isSource(file));
const cssFiles = all.filter((file) => file.endsWith('.css') && isSource(file));

/** import 说明符：静态 import / export from / 动态 import() */
const SPEC = /(\bfrom\s*|\bimport\s+|\bimport\(\s*)(['"])(\.{1,2}\/[^'"]+\.js)\2/g;

const rawCache = new Map();
function raw(file) {
  let code = rawCache.get(file);
  if (code === undefined) {
    code = fs.readFileSync(file, 'utf8');
    rawCache.set(file, code);
  }
  return code;
}

/** 文件依赖（只认相对路径且真实存在） */
function depsOf(file) {
  const dir = path.dirname(file);
  const deps = [];
  for (const match of raw(file).matchAll(SPEC)) {
    const target = path.resolve(dir, match[3]);
    if (fs.existsSync(target)) deps.push(target);
  }
  return deps;
}

/** Merkle 哈希：自身内容 + 依赖的哈希，依赖一改引用方就会换名 */
const hashCache = new Map();
const visiting = new Set();
function merkle(file) {
  const cached = hashCache.get(file);
  if (cached) return cached;
  const code = raw(file);
  // 循环依赖时退化为只算自身内容，保证能收敛
  if (visiting.has(file)) return createHash('sha256').update(code).digest('hex').slice(0, 8);
  visiting.add(file);
  const hash = createHash('sha256').update(code);
  for (const dep of depsOf(file).sort()) hash.update(merkle(dep));
  visiting.delete(file);
  const hex = hash.digest('hex').slice(0, 8);
  hashCache.set(file, hex);
  return hex;
}

/** 压缩；失败时退回原始内容，保证构建不会挂掉 */
async function minify(file, code, loader) {
  if (!esbuild) return code;
  try {
    const result = await esbuild.transform(code, {
      loader,
      minify: true,
      target: 'es2020',
      legalComments: 'none',
      charset: 'utf8',
    });
    return result.code;
  } catch (error) {
    console.warn(`压缩失败，已回退原文：${relOf(file)}（${error.message}）`);
    return code;
  }
}

const shortHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 8);

const written = new Set();
const sizes = { before: 0, after: 0 };

const tally = (before, after) => {
  sizes.before += before;
  sizes.after += after;
};

// 1. JS：先按 Merkle 哈希改写 import，再压缩，写出 <名字>.<哈希>.js
for (const file of jsFiles) {
  const digest = merkle(file);
  const code = raw(file).replace(SPEC, (whole, lead, quote, spec) => {
    const dep = hashCache.get(path.resolve(path.dirname(file), spec));
    return dep ? `${lead}${quote}${spec.replace(/\.js$/, `.${dep}.js`)}${quote}` : whole;
  });
  const body = await minify(file, code, 'js');
  // JS 副本的名字沿用源码 Merkle 哈希：源码不变就不会换名，长缓存不会指向错的文件
  const out = path.join(path.dirname(file), `${path.basename(file, '.js')}.${digest}.js`);
  fs.writeFileSync(out, body);
  written.add(out);
  tally(Buffer.byteLength(code), Buffer.byteLength(body));
}

// 2. CSS：压缩后按内容哈希命名；名字里带哈希，_headers 的 /css/* 长缓存才安全
const cssEntries = new Map();
for (const file of cssFiles) {
  const source = raw(file);
  const body = await minify(file, source, 'css');
  const out = path.join(
    path.dirname(file),
    `${path.basename(file, '.css')}.${shortHash(body)}.css`
  );
  fs.writeFileSync(out, body);
  cssEntries.set(file, out);
  written.add(out);
  tally(Buffer.byteLength(source), Buffer.byteLength(body));
}

// 3. 清掉上一轮留下的副本，避免 public 里越堆越多
for (const file of walk(PUBLIC)) {
  if (HASHED.test(path.basename(file)) && !written.has(file)) fs.rmSync(file);
}

// 4. 资源映射：JS 指向哈希副本，CSS 指向压缩后的哈希副本
const entries = all
  .filter((file) => isSource(file))
  .map((file) => {
    if (file.endsWith('.js')) {
      const digest = hashCache.get(file);
      return [relOf(file), relOf(path.join(path.dirname(file), `${path.basename(file, '.js')}.${digest}.js`))];
    }
    return [relOf(file), relOf(cssEntries.get(file))];
  })
  .sort((a, b) => a[0].localeCompare(b[0]));

const code = `// 由 scripts/predeploy.mjs 生成，请勿手改；dev / deploy 前会自动重新生成
const ASSETS: Record<string, string> = {
${entries.map(([key, value]) => `  '${key}': '${value}',`).join('\n')}
};

/** 给静态资源加上内容版本号，配合 public/_headers 的长缓存；未收录的路径原样返回 */
export function asset(path: string): string {
  return ASSETS[path] ?? path;
}
`;

fs.writeFileSync(OUT, code);

const kb = (n) => `${(n / 1024).toFixed(1)}KB`;
const saved = sizes.before ? Math.round((1 - sizes.after / sizes.before) * 100) : 0;
console.log(
  `assets.generated.ts: ${entries.length} 个文件（副本 ${written.size} 个）；` +
    `压缩 ${kb(sizes.before)} → ${kb(sizes.after)}（-${saved}%）`
);
