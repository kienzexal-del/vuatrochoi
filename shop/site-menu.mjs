const drawer = document.getElementById('site-menu');
const toggle = document.querySelector('.site-menu-toggle');

toggle.addEventListener('click', () => drawer.showModal());
drawer.querySelector('.site-menu-close').addEventListener('click', () => drawer.close());
drawer.addEventListener('click', event => {
  if (event.target === drawer || event.target.closest('a')) drawer.close();
});
