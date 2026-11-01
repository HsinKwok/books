// 由示例数据生成 seed SQL：node scripts/seed.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getBooks, chapterWords } from '../src/data/sample.ts';
import { getDiscussions } from '../src/data/discussion.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(here, '..', 'migrations', '0002_seed.sql');

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const ts = (iso) => Math.floor(Date.parse(`${iso}T00:00:00+08:00`) / 1000);

const lines = ['-- 由 scripts/seed.mjs 生成，勿手改', ''];

getBooks().forEach((book, bookIndex) => {
  const t = ts(book.updatedAt);
  lines.push(
    `INSERT INTO books (slug, title, author, category, summary, status, sort, created_at, updated_at) VALUES (${[
      q(book.slug),
      q(book.title),
      q(book.author),
      q(book.category),
      q(book.summary),
      q('published'),
      bookIndex,
      t,
      t,
    ].join(', ')});`,
  );

  for (const chapter of book.chapters) {
    lines.push(
      `INSERT INTO chapters (book_id, idx, title, body, words, status, created_at, updated_at) SELECT id, ${[
        chapter.idx,
        q(chapter.title),
        q(chapter.paragraphs.join('\n\n')),
        chapterWords(chapter),
        q('published'),
        t,
        t,
      ].join(', ')} FROM books WHERE slug = ${q(book.slug)};`,
    );

    for (const talk of getDiscussions(book.slug, chapter.idx)) {
      const [month, day] = talk.date.match(/\d+/g) || ['1', '1'];
      const at = Math.floor(
        Date.parse(`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T20:00:00+08:00`) /
          1000,
      );
      lines.push(
        `INSERT INTO discussions (book_id, chapter_idx, user_id, name, body, status, likes, created_at) SELECT id, ${[
          chapter.idx,
          'NULL',
          q(talk.name),
          q(talk.body),
          q('approved'),
          talk.likes,
          at,
        ].join(', ')} FROM books WHERE slug = ${q(book.slug)};`,
      );
    }
  }
});

writeFileSync(outFile, `${lines.join('\n')}\n`, 'utf8');
console.log(`seed written: ${outFile}`);
