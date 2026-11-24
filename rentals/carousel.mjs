const host = document.querySelector('.rental-carousel');
const track = host.querySelector('.rental-slides');
const dots = host.querySelector('.rental-dots');
const games = [...document.querySelectorAll('.translation-card img')].slice(0,12);
let index = 0;
let timer;
const buttons = games.map((game, i) => {
  const slide = document.createElement('img');
  slide.src = game.src;
  slide.alt = game.alt;
  slide.width = 460;
  slide.height = 215;
  slide.loading = i === 0 ? 'eager' : 'lazy';
  track.append(slide);
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', game.alt);
  button.addEventListener('click', () => { show(i); restart(); });
  dots.append(button);
  return button;
});
function show(next) {
  index = (next + games.length) % games.length;
  track.style.transform = `translateX(-${index * 100}%)`;
  buttons.forEach((button, i) => button.setAttribute('aria-current', String(i === index)));
}
function restart() {
  clearInterval(timer);
  if (!document.hidden) timer = setInterval(() => show(index + 1), 5000);
}
let touch;
host.addEventListener('touchstart', event => {
  const point = event.touches[0];
  touch = {x: point.clientX, y: point.clientY};
}, {passive: true});
host.addEventListener('touchend', event => {
  if (!touch) return;
  const point = event.changedTouches[0];
  const dx = point.clientX - touch.x;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(point.clientY - touch.y)) {
    show(index + (dx < 0 ? 1 : -1));
    restart();
  }
  touch = null;
}, {passive: true});
host.addEventListener('touchcancel', () => { touch = null; }, {passive: true});
document.addEventListener('visibilitychange', restart);
show(0);
restart();
