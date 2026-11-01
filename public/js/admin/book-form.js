// 书籍编辑：勾选「移除当前封面」后保存会删掉图片，保存前确认一次
const removeCover = document.querySelector('input[name="removeCover"]');

if (removeCover) {
  removeCover.closest('form')?.addEventListener('submit', (e) => {
    if (!removeCover.checked) return;
    if (!window.confirm('保存后会删除当前封面图片，确定移除？')) e.preventDefault();
  });
}
