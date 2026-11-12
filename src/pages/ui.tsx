import type { Child } from 'hono/jsx';
import type { Book } from '../db';
import { markdownText, renderInline } from '../markdown';

/* ---------- 前台通用块：页头、表单页、输入框、封面 ---------- */

/** 页头：分类 / 作者 / 404 / 搜索共用，kicker + 标题 + 导语 + 附加内容 + 说明 */
export function PageHead({
  kicker,
  title,
  lede,
  narrow,
  children,
  note,
}: {
  kicker: string;
  title: string;
  /** 支持 Markdown 的导语 */
  lede?: string;
  /** 窄栏版式（表单页） */
  narrow?: boolean;
  /** 标题下的自定义内容，例如搜索表单 */
  children?: Child;
  /** 页脚说明，排在 children 之后 */
  note?: Child;
}) {
  return (
    <header class={narrow ? 'page-head narrow' : 'page-head'}>
      <p class="kicker">{kicker}</p>
      <h1 class="page-title">{title}</h1>
      {lede ? <p class="page-lede" dangerouslySetInnerHTML={{ __html: renderInline(lede) }} /> : null}
      {children}
      {note ? <p class="page-note">{note}</p> : null}
    </header>
  );
}

/** 登录 / 注册 / 找回密码：同一套窄栏页头 + 表单 + 错误提示 + 页脚说明 */
export function AuthPage({
  kicker,
  title,
  error,
  children,
  note,
}: {
  kicker: string;
  title: string;
  error?: string;
  children?: Child;
  note?: Child;
}) {
  return (
    <div class="page">
      <section class="page-head narrow">
        <p class="kicker">{kicker}</p>
        <h1 class="page-title">{title}</h1>
        {error ? <p class="form-error">{error}</p> : null}
        {children}
        {note ? <p class="page-note">{note}</p> : null}
      </section>
    </div>
  );
}

/** 表单输入框：label > span + input，属性按需透传 */
export function Field({
  label,
  name,
  type = 'text',
  value,
  autocomplete,
  required,
  minlength,
  maxlength,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string;
  autocomplete?: string;
  required?: boolean;
  minlength?: number;
  maxlength?: number;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type={type}
        name={name}
        value={value}
        autocomplete={autocomplete}
        required={required}
        minlength={minlength}
        maxlength={maxlength}
      />
    </label>
  );
}

/** 列表封面：信息流与卡片共用；有封面图时优先显示图片 */
export function Cover({ book, no, card }: { book: Book; no: number; card?: boolean }) {
  const cls = card ? 'cover book-card-cover' : 'cover';
  if (book.coverUrl) {
    return (
      <span class={`${cls} cover-img`} aria-hidden="true">
        <img src={book.coverUrl} alt="" loading="lazy" />
      </span>
    );
  }
  return (
    <span class={cls} aria-hidden="true">
      <span class="cover-no">№ {String(no).padStart(2, '0')}</span>
      <span class="cover-title">{book.title}</span>
      {card ? <span class="cover-blurb">{markdownText(book.summary) || '暂无简介'}</span> : null}
      <span class="cover-author">{book.author}</span>
    </span>
  );
}
