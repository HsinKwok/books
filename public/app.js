// 入口：基础脚本随页面立即执行，其余按页面类型按需加载
import './js/base.js';
import { $ } from './js/core.js';

const body = document.body;

if (body.classList.contains('is-reading')) {
  import('./js/chapter-page.js');
}
if ($('#shelf-mine')) {
  import('./js/shelf.js');
}
// 书页目录按需展开：多卷或长书被截断时才需要
if ($('.toc-volume[data-lazy]') || $('.toc-more')) {
  import('./js/book-toc.js');
}
// 搜索页输入联想
if ($('#search-suggest')) {
  import('./js/search.js');
}
// 搜索页换关键词只替换结果区
if ($('#search-results')) {
  import('./js/search-page.js');
}
// 首页最近更新稍后补、书卡翻页只换列表
if ($('#home-recent') || $('#home-books')) {
  import('./js/home.js');
}
// 书页「最新讨论」摘要等首屏读完再补
if ($('#book-talks')) {
  import('./js/book-talks.js');
}
// 分类页 / 作者页翻页改为只追加列表
if ($('.pager[data-base^="/c/"], .pager[data-base^="/a/"]')) {
  import('./js/feed-more.js');
}
