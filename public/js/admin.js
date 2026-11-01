// 后台入口：按当前页面存在的元素，按需加载对应模块
const has = (selector) => document.querySelector(selector) !== null;

if (has('textarea[data-markdown]')) import('./markdown-editor.js');
if (has('#admin-menu')) import('./admin/menu.js');
if (has('#admin-overview')) import('./admin/overview.js');
if (has('#books-filter')) import('./admin/books.js');
if (has('input[name="removeCover"]')) import('./admin/book-form.js');
if (has('#discuss-panel')) import('./admin/discussions.js');
if (has('#users-filter')) import('./admin/users.js');
if (has('#categories-table')) import('./admin/categories.js');
if (has('#chapters-table')) import('./admin/chapters.js');
if (has('#chapter-body')) import('./admin/chapter.js');
if (has('#import-file')) import('./admin/import.js');
// 确认弹窗用事件委托，列表被局部替换后仍有效；没有危险操作表单的页面不加载
if (has('form[data-confirm]')) import('./admin/confirm.js');
if (has('[data-tabs]')) import('./admin/tabs.js');
