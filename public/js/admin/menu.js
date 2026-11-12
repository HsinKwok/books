// 移动端侧栏抽屉

const btn = document.querySelector('#admin-menu');
const body = document.body;

if (btn) {
  const setOpen = (open) => {
    body.classList.toggle('is-menu', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  btn.addEventListener('click', () => setOpen(!body.classList.contains('is-menu')));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });

  document.querySelector('#admin-content')?.addEventListener('click', () => {
    if (body.classList.contains('is-menu')) setOpen(false);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) setOpen(false);
  });
}
