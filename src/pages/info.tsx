import { renderMarkdown } from '../markdown';
import { PageHead } from './ui';

export function InfoPage({
  title,
  body,
  kicker = '关于本站',
}: {
  title: string;
  body: string;
  kicker?: string;
}) {
  return (
    <div class="page">
      <PageHead kicker={kicker} title={title} />
      <article class="info-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />
    </div>
  );
}

export function NotFound() {
  return (
    <div class="page">
      <PageHead
        kicker="404"
        title="这一页没有字"
        note={
          <>
            可能是链接错了，也可能是这一章还没写。
            <a class="inline-link" href="/">
              回书库
            </a>
          </>
        }
      />
    </div>
  );
}
