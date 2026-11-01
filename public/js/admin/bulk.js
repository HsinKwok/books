/**
 * 批量勾选的公共逻辑：收集选中项、同步计数与按钮状态、处理全选。
 * 用事件委托绑在 root 上一次，root.innerHTML 被替换后依然有效。
 */
export function initBulk(root, { unit = '项' } = {}) {
  const items = () => [...root.querySelectorAll('[data-bulk-item]')];
  // 禁用项（自己、站长、未分类）不参与选中和全选
  const selectable = () => items().filter((el) => !el.disabled);
  const picked = () =>
    selectable()
      .filter((el) => el.checked)
      .map((el) => Number(el.value));

  const sync = () => {
    const all = selectable();
    const ids = picked();
    const count = root.querySelector('[data-bulk-count]');
    if (count) count.textContent = `已选 ${ids.length} ${unit}`;

    root.querySelectorAll('[data-bulk-action]').forEach((btn) => {
      btn.disabled = ids.length === 0;
    });

    const allBox = root.querySelector('[data-bulk-all]');
    if (allBox) {
      allBox.checked = all.length > 0 && ids.length === all.length;
      allBox.indeterminate = ids.length > 0 && ids.length < all.length;
    }
  };

  root.addEventListener('change', (e) => {
    const target = e.target;
    if (target.matches('[data-bulk-all]')) {
      selectable().forEach((el) => {
        el.checked = target.checked;
      });
      sync();
      return;
    }
    if (target.matches('[data-bulk-item]')) sync();
  });

  return { items, picked, sync };
}
