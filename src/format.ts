export function formatWords(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万字`;
  return `${n.toLocaleString('en-US')} 字`;
}

export function shortDate(iso: string) {
  const [, m, d] = iso.split('-');
  return `${Number(m)}.${Number(d)}`;
}

export function readingMinutes(words: number) {
  return Math.max(1, Math.round(words / 400));
}

export function bookWords(book: { chapters: { words: number }[] }) {
  return book.chapters.reduce((n, c) => n + c.words, 0);
}
