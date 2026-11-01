-- 章节正文预渲染：body_hash 与当前正文摘要一致时，body_html 可直接复用，省掉 Markdown 解析
ALTER TABLE chapters ADD COLUMN body_html TEXT;
ALTER TABLE chapters ADD COLUMN body_hash TEXT;
