import type { Book, Chapter, ChapterLink, Volume } from '../../db';
import type { SessionUser } from '../../env';
import { ChapterArticle } from './article';
import { DiscussBox } from './discuss-box';
import { ReaderBar, ReadProgressScript, TocPanel } from './reader-bar';
import { RelatedChapters } from './related';
import { SettingsPanel } from './settings-panel';

type Props = {
  book: Book;
  chapter: Chapter;
  /** 当前章所属的卷，未分卷时为空 */
  volume?: Volume;
  /** 全书已发布章节总数 */
  total: number;
  prev?: ChapterLink;
  next?: ChapterLink;
  user?: SessionUser | null;
  sent?: boolean;
  discussEnabled: boolean;
  autoApprove: boolean;
  progress?: { idx: number; ratio: number } | null;
};

/** 章节阅读页：正文 / 讨论 / 相关章节 / 阅读条 / 目录与设置面板 */
export function ChapterPage({
  book,
  chapter,
  volume,
  total,
  prev,
  next,
  user,
  sent,
  discussEnabled,
  autoApprove,
  progress,
}: Props) {
  return (
    <div class="page article-page">
      <div class="article-grid">
        <ChapterArticle book={book} chapter={chapter} volume={volume} prev={prev} next={next} />
        <DiscussBox
          book={book}
          chapter={chapter}
          user={user}
          sent={sent}
          discussEnabled={discussEnabled}
          autoApprove={autoApprove}
        />
      </div>

      <RelatedChapters book={book} chapter={chapter} />

      <ReaderBar book={book} chapter={chapter} total={total} prev={prev} next={next} />
      <TocPanel book={book} chapter={chapter} />
      <SettingsPanel />
      <ReadProgressScript book={book} progress={progress} />
    </div>
  );
}
