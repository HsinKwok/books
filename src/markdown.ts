/**
 * 极简 Markdown 子集：转义优先、零依赖。
 * 支持：标题、引用、无序/有序列表、``` 代码块、--- 分割线、
 *      **粗体**、*斜体*、~~删除线~~、`行内代码`、[文字](链接)。
 * 不支持内嵌 HTML，链接只放行 http(s)、站内路径与锚点。
 */

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url) ? url : null;
}

const TOKEN = '\u0000';
const FENCE = /^\s*```(\w*)\s*$/;
const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;

/** 块级语法的行首字符：`#` `>` ``` `-` `*` `+` `_` 数字 */
const BLOCK_HEAD = /^[ \t]*[#>`*_+\-0-9]/;

function isBlockStart(line: string) {
  // 正文绝大多数行首字符不在这一组里，先花一次轻量判断跳过下面 6 条正则
  if (!BLOCK_HEAD.test(line)) return false;
  return FENCE.test(line) || HR.test(line) || HEADING.test(line) || QUOTE.test(line) || UL.test(line) || OL.test(line);
}

/** 需要转义或可能构成行内语法的字符；没有它们就完全不用跑正则 */
const INLINE_SPECIAL = /[&<>"'`\[\]*~]/;

/** 行内语法 */
export function renderInline(raw: string): string {
  const source = String(raw ?? '');
  // 纯文本快路径：中文正文绝大多数行都不含 Markdown 字符
  if (!INLINE_SPECIAL.test(source)) {
    return source.includes('\n') ? source.replace(/\n/g, '<br />') : source;
  }

  const codes: string[] = [];
  let out = escapeHtml(source);

  out = out.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `${TOKEN}${codes.length - 1}${TOKEN}`;
  });

  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
    const url = safeHref(href);
    if (!url) return whole;
    const external = /^https?:\/\//i.test(url);
    const attrs = external ? ' target="_blank" rel="noreferrer noopener"' : '';
    return `<a href="${url}"${attrs}>${label}</a>`;
  });

  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

  out = out.replace(new RegExp(`${TOKEN}(\\d+)${TOKEN}`, 'g'), (_m, i: string) => `<code>${codes[Number(i)]}</code>`);
  return out.replace(/\n/g, '<br />');
}

/** 块级 + 行内，返回可直接注入的 HTML */
export function renderMarkdown(raw: string): string {
  const source = String(raw ?? '');
  // 导入时正文已经 normalize 过，多数情况没有 \r，省一次全量替换
  const lines = (source.includes('\r') ? source.replace(/\r\n?/g, '\n') : source).split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const lang = fence[1];
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      const cls = lang ? ` class="language-${lang}"` : '';
      html.push(`<pre><code${cls}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    if (HR.test(line)) {
      html.push('<hr />');
      i += 1;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push((lines[i].match(QUOTE) as RegExpMatchArray)[1]);
        i += 1;
      }
      html.push(`<blockquote>${quoted.map((l) => renderInline(l)).join('<br />')}</blockquote>`);
      continue;
    }

    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line);
      const pattern = ordered ? OL : UL;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push((lines[i].match(pattern) as RegExpMatchArray)[1]);
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    if (!para.length) {
      para.push(lines[i].trim());
      i += 1;
    }
    html.push(`<p>${para.map((l) => renderInline(l)).join('<br />')}</p>`);
  }

  return html.join('\n');
}

/** 可能构成 Markdown 的字符；没有这些字符的文本可以整段跳过替换 */
const MD_SPECIAL = /[`#>~*_\[\]+\-]/;
/** 行首有序列表：数字 + `.` 或 `)` */
const MD_NUMBERED = /^[ \t]*\d+[.)]\s/m;

/** 去掉标记但保留换行，用于结构化字段（友链等） */
export function stripInline(raw: string): string {
  const source = String(raw ?? '');
  // 纯文本快路径：12 条全量替换占导入解析的大头，没有标记字符时整段跳过
  if (!MD_SPECIAL.test(source) && !MD_NUMBERED.test(source)) {
    return source.replace(/\r\n?/g, '\n').trim();
  }
  return source
    .replace(/\r\n?/g, '\n')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/~~([^~\n]+)~~/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '$1')
    .trim();
}

/** 去掉标记并压成单行，用于卡片、meta、字数统计 */
export function markdownText(raw: string): string {
  const text = stripInline(raw);
  return text.includes('\n') ? text.replace(/\s*\n\s*/g, ' ') : text;
}
