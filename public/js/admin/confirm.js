// 危险操作确认：用事件委托，列表被局部替换后新表单也有效
// 没写 data-confirm 的删除表单也兜底问一句，避免以后新增入口忘了加
document.addEventListener('submit', (e) => {
  const form = e.target.closest('form');
  if (!form) return;
  const action = form.getAttribute('action') || '';
  const fallback = /\/delete$/.test(action) ? '确定删除？删除后无法恢复。' : '';
  const message = form.dataset.confirm || fallback;
  if (message && !window.confirm(message)) e.preventDefault();
});
