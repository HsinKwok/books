// 与服务端 src/markdown.ts 保持同一套规则：极简 Markdown 子集，转义优先
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

const TOKEN = '\u0000';
const FENCE = /^\s*```(\w*)\s*$/;
const HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;
const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*\d+[.)]\s+(.*)$/;

const safeHref = (raw) => {
  const url = String(raw).trim();
  return /^(https?:\/\/|mailto:|\/|#)/i.test(url) ? url : null;
};

const isBlockStart = (line) =>
  FENCE.test(line) || HR.test(line) || HEADING.test(line) || QUOTE.test(line) || UL.test(line) || OL.test(line);

export function renderInline(raw) {
  const codes = [];
  let out = escapeHtml(raw);

  out = out.replace(/`([^`\n]+)`/g, (_m, code) => {
    codes.push(code);
    return `${TOKEN}${codes.length - 1}${TOKEN}`;
  });

  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
    const url = safeHref(href);
    if (!url) return whole;
    const attrs = /^https?:\/\//i.test(url) ? ' target="_blank" rel="noreferrer noopener"' : '';
    return `<a href="${url}"${attrs}>${label}</a>`;
  });

  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

  out = out.replace(new RegExp(`${TOKEN}(\\d+)${TOKEN}`, 'g'), (_m, i) => `<code>${codes[Number(i)]}</code>`);
  return out.replace(/\n/g, '<br />');
}

export function renderMarkdown(raw) {
  const lines = String(raw ?? '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
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
      const code = [];
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
      const quoted = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(lines[i].match(QUOTE)[1]);
        i += 1;
      }
      html.push(`<blockquote>${quoted.map((l) => renderInline(l)).join('<br />')}</blockquote>`);
      continue;
    }

    if (UL.test(line) || OL.test(line)) {
      const ordered = OL.test(line);
      const pattern = ordered ? OL : UL;
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(lines[i].match(pattern)[1]);
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${tag}>`);
      continue;
    }

    const para = [];
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
