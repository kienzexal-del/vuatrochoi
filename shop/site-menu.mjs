const drawer = document.getElementById('site-menu');
drawer.querySelector('nav').innerHTML = "<a href=\"/games/\">Danh sách game offline</a><details class=\"package-menu\" open><summary>Chọn gói Vua Trò Chơi</summary><div class=\"package-options\"><a href=\"/buy/windows/\">Windows</a><a href=\"/buy/macos/\">macOS</a><a href=\"/buy/steam-deck/\">Steam Deck</a><a href=\"/buy/linux/\">Linux / SteamOS</a><a href=\"/mobile/\">Điện thoại - FREE</a></div></details>";
drawer.querySelector('nav').insertAdjacentHTML('afterbegin','<a href="/translations/">Việt hóa game</a><a href="/rentals/">Thuê tài khoản Steam</a>');
const toggle = document.querySelector('.site-menu-toggle');

toggle.addEventListener('click', () => drawer.showModal());
drawer.querySelector('.site-menu-close').addEventListener('click', () => drawer.close());
drawer.addEventListener('click', event => {
  if (event.target === drawer || event.target.closest('a')) drawer.close();
});
