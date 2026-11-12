import {
  type Book,
  type BookRow,
  type Chapter,
  type ChapterRow,
  type Volume,
  isoDate,
} from './types';

export type ChapterLiteRow = Omit<ChapterRow, 'body'>;

export function toChapterLite(row: ChapterLiteRow, volumeNo = 0): Chapter {
  return {
    id: row.id,
    idx: row.idx,
    title: row.title,
    body: '',
    words: row.words,
    status: row.status,
    updatedAt: row.updated_at,
    volumeId: row.volume_id ?? null,
    volumeNo,
  };
}

export function toChapter(row: ChapterRow, volumeNo = 0): Chapter {
  return { ...toChapterLite(row, volumeNo), body: row.body };
}

/** 按卷给章节编卷内序号；chapter 行必须已按 idx 升序 */
export function withVolumeNos(rows: ChapterLiteRow[]): Chapter[] {
  const counters = new Map<number, number>();
  return rows.map((row) => {
    const key = row.volume_id ?? 0;
    const next = (counters.get(key) ?? 0) + 1;
    counters.set(key, next);
    return toChapterLite(row, row.volume_id ? next : 0);
  });
}

export function toBook(
  row: BookRow,
  chapters: Chapter[],
  volumes: Volume[] = [],
  agg?: { chapterCount: number; words: number; firstChapterTitle: string },
): Book {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author,
    category: row.category,
    summary: row.summary,
    status: row.status,
    sort: row.sort,
    allowDiscussion: row.allow_discussion === 1,
    featured: row.featured === 1,
    serialStatus: row.serial_status,
    coverUrl: row.cover_url,
    ownerId: row.owner_id ?? null,
    createdAt: row.created_at,
    updatedAt: isoDate(row.updated_at),
    // 列表页传聚合值；详情页 chapters 是全量，直接就地算
    chapterCount: agg?.chapterCount ?? chapters.length,
    words: agg?.words ?? chapters.reduce((n, c) => n + c.words, 0),
    firstChapterTitle: agg?.firstChapterTitle ?? chapters[0]?.title ?? '',
    chapters,
    volumes,
  };
}
