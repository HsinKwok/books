// 生成全站压力测试数据（默认 1000 本书），输出可直接执行的 SQL 分片
// 用法：
//   node scripts/stress-seed.mjs                 # 生成 1000 本书的 SQL 到系统临时目录
//   node scripts/stress-seed.mjs --apply         # 生成并直接写入本地 .wrangler 的 D1 SQLite
//   node scripts/stress-seed.mjs --books=500     # 改数量
//   node scripts/stress-seed.mjs --from=1001 --books=1000 --apply  # 在已有 1000 本之后再追加 1000 本
//   node scripts/stress-seed.mjs --from=1001 --books=1000 --clean --apply # 删除这一批
//   注意：清理按 id 区间删，--from/--books 要和当初导入时一致
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = argv.find((item) => item.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BOOKS = Number(arg('books', 1000));
/** 起始序号：追加第二批时用 --from=1001 */
const FROM = Number(arg('from', 1));
/** 最后一本的序号，id / slug / 章节序号都按它算 */
const LAST = FROM + BOOKS - 1;
const CHAPTERS = Number(arg('chapters', 10));
const VOLUMES = Number(arg('volumes', 2));
const PER_FILE = Number(arg('per-file', 100));
const CLEAN_ONLY = argv.includes('--clean');
const APPLY = argv.includes('--apply');

/** 本地 D1 的 SQLite 文件（miniflare 放在 .wrangler/state 下，取最新的那个） */
function resolveDbPath() {
  const custom = arg('db', '');
  if (custom) return custom;
  const dir = path.join(here, '..', '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sqlite'))
    .map((name) => path.join(dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (!files.length) throw new Error(`没有找到本地 D1 数据库：${dir}`);
  return files[0];
}

/** 直接写 SQLite：比 wrangler d1 execute 逐条执行快一个数量级 */
function applyFile(file) {
  const db = new DatabaseSync(resolveDbPath());
  try {
    db.exec('PRAGMA busy_timeout = 15000');
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(file, 'utf8'));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
}

const BASE_BOOK = 1_000_000;
const BASE_VOLUME = 2_000_000;
const BASE_CHAPTER = 3_000_000;
const CATEGORIES = ['都市悬疑', '科幻', '乡土', '测试'];
const AUTHORS = Array.from({ length: 25 }, (_, i) => `测试作者 ${String(i + 1).padStart(2, '0')}`);
const ADJ = ['寂静', '潮汐', '荒原', '深空', '回声', '南岸', '迷雾', '霓虹', '长夜', '孤岛', '群山', '旧城', '风暴', '微光', '远行', '空港', '雪原', '暗河', '星环', '断桥'];
const NOUN = ['来信', '档案', '手记', '纪事', '回廊', '列车', '灯塔', '信号', '旧梦', '边境', '旅人', '花园', '钟表', '地图', '寓言', '笔记', '之门', '之后', '之声', '之海'];
const CLAUSES = [
  '雨落在旧站的玻璃顶上，灯光被切成细碎的条纹。',
  '他合上笔记本，听见走廊尽头传来缓慢的脚步声。',
  '城市的边缘总有一些被地图忽略的小路。',
  '风从海面吹来，带着盐和铁锈的味道。',
  '她把信折成很小的方块，塞进外套内侧的口袋。',
  '掌心的温度一点点退去，像退潮后的沙滩。',
  '远处的高架桥上，车灯连成一条发亮的线。',
  '没有人知道那扇门后面究竟有什么。',
  '钟声敲过十二下，屋檐下的水珠同时落下。',
  '他们约定在下一个路口见面，却谁也没有先到。',
  '纸页翻动的声音在房间里显得格外清晰。',
  '雪停之后，整座院子只剩下一种安静的白。',
  '他忽然想起很久以前听过的一首歌。',
  '窗外的梧桐叶落了一地，被风推着向前。',
  '电台里的声音断断续续，像从另一个时代传来。',
  '她沿着河堤一直走，直到看不见来时的路。',
  '空气里有一种雨后的清冽，让人清醒。',
  '灯光照在墙上的老照片上，边角已经泛黄。',
  '这不是第一次，也不会是最后一次。',
  '他把钥匙放在桌上，转身走进了夜色。',
];

/** 固定种子的伪随机，保证多次生成结果一致 */
let seed = 20261030;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;

function makeBody() {
  const paragraphs = [];
  for (let p = 0; p < 5 + Math.floor(rand() * 3); p += 1) {
    const sentences = [];
    for (let s = 0; s < 3 + Math.floor(rand() * 3); s += 1) sentences.push(pick(CLAUSES));
    paragraphs.push(sentences.join(''));
  }
  return paragraphs.join('\n\n');
}

function makeSummary() {
  return Array.from({ length: 3 }, () => pick(CLAUSES)).join('');
}

const now = Math.floor(Date.now() / 1000);
const dir = path.join(os.tmpdir(), `book-stress-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(dir, { recursive: true });

// 清理 SQL：显式按 id 区间删，避免误伤真实数据
const cleanup = [
  '-- 清理压力测试数据（仅删除 id 区间内的行）',
  `DELETE FROM discussions WHERE book_id BETWEEN ${BASE_BOOK + 1} AND ${BASE_BOOK + LAST};`,
  `DELETE FROM chapters WHERE book_id BETWEEN ${BASE_BOOK + 1} AND ${BASE_BOOK + LAST};`,
  `DELETE FROM volumes WHERE book_id BETWEEN ${BASE_BOOK + 1} AND ${BASE_BOOK + LAST};`,
  `DELETE FROM books WHERE id BETWEEN ${BASE_BOOK + 1} AND ${BASE_BOOK + LAST};`,
  '',
].join('\n');
writeFileSync(path.join(dir, 'cleanup.sql'), cleanup, 'utf8');

if (CLEAN_ONLY) {
  const file = path.join(dir, 'cleanup.sql');
  console.log(`清理 SQL: ${file}`);
  if (APPLY) {
    const started = Date.now();
    applyFile(file);
    console.log(`已清理（${Date.now() - started}ms）`);
  } else {
    console.log(`npx wrangler d1 execute book --local --file="${file}"`);
  }
  process.exit(0);
}

const files = [];
for (let start = FROM; start <= LAST; start += PER_FILE) {
  const end = Math.min(start + PER_FILE - 1, LAST);
  // 本地 D1（miniflare）不接受 SQL 里的 BEGIN/COMMIT，语句由 wrangler 顺序执行
  const lines = [`-- 压力测试数据 ${start}-${end}`];

  for (let i = start; i <= end; i += 1) {
    const bookId = BASE_BOOK + i;
    const no = String(i).padStart(4, '0');
    const title = `压力测试 ${no} · ${ADJ[i % ADJ.length]}${NOUN[Math.floor(i / ADJ.length) % NOUN.length]}`;
    const author = AUTHORS[i % AUTHORS.length];
    const category = CATEGORIES[i % CATEGORIES.length];
    const at = now - Math.floor(rand() * 90) * 86400;
    const featured = i % 40 === 0 ? 1 : 0;
    const allowDiscussion = i % 7 === 0 ? 0 : 1;
    const serial = ['serializing', 'finished', 'paused'][i % 3];

    lines.push(
      `INSERT INTO books (id, slug, title, author, category, summary, status, sort, allow_discussion, featured, serial_status, cover_url, created_at, updated_at) VALUES (${[
        bookId,
        q(`stress-${no}`),
        q(title),
        q(author),
        q(category),
        q(makeSummary()),
        q('published'),
        i,
        allowDiscussion,
        featured,
        q(serial),
        q(''),
        at,
        at,
      ].join(', ')});`,
    );

    const perVolume = Math.ceil(CHAPTERS / VOLUMES);
    for (let v = 0; v < VOLUMES; v += 1) {
      lines.push(
        `INSERT INTO volumes (id, book_id, idx, title, intro, created_at, updated_at) VALUES (${[
          BASE_VOLUME + (i - 1) * VOLUMES + v + 1,
          bookId,
          v + 1,
          q(`第${['一', '二', '三', '四', '五'][v] ?? v + 1}卷 ${ADJ[(i + v) % ADJ.length]}${NOUN[(i + v) % NOUN.length]}`),
          q(makeSummary()),
          at,
          at,
        ].join(', ')});`,
      );
    }

    for (let c = 1; c <= CHAPTERS; c += 1) {
      const body = makeBody();
      const volumeId = BASE_VOLUME + (i - 1) * VOLUMES + Math.ceil(c / perVolume);
      lines.push(
        `INSERT INTO chapters (id, book_id, idx, volume_id, title, body, words, status, created_at, updated_at) VALUES (${[
          BASE_CHAPTER + (i - 1) * CHAPTERS + c,
          bookId,
          c,
          volumeId,
          q(`第${c}章 ${pick(ADJ)}${pick(NOUN)}`),
          q(body),
          body.replace(/\s/g, '').length,
          q('published'),
          at,
          at,
        ].join(', ')});`,
      );
    }
  }

  lines.push('');
  const file = path.join(dir, `part-${String(files.length + 1).padStart(2, '0')}.sql`);
  writeFileSync(file, lines.join('\n'), 'utf8');
  files.push(file);
}

console.log(`已生成 ${FROM}-${LAST} 共 ${BOOKS} 本书 / ${BOOKS * CHAPTERS} 章 / ${BOOKS * VOLUMES} 卷`);
console.log(`目录：${dir}`);

if (APPLY) {
  const started = Date.now();
  for (const file of files) applyFile(file);
  const db = new DatabaseSync(resolveDbPath());
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM books WHERE id > ${BASE_BOOK}) AS books,
              (SELECT COUNT(*) FROM chapters WHERE book_id > ${BASE_BOOK}) AS chapters,
              (SELECT COUNT(*) FROM volumes WHERE book_id > ${BASE_BOOK}) AS volumes`,
    )
    .get();
  db.close();
  console.log(
    `已写入本地 D1（${((Date.now() - started) / 1000).toFixed(1)}s）：` +
      `${row.books} 本书 / ${row.chapters} 章 / ${row.volumes} 卷`,
  );
} else {
  console.log('依次执行（或加 --apply 直接写入本地 D1）：');
  for (const file of files) {
    console.log(`  npx wrangler d1 execute book --local --file="${file}"`);
  }
}

console.log('清理：');
console.log(`  node scripts/stress-seed.mjs --clean --apply`);
