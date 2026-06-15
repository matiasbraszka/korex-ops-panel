// Auto-scroll durante drag & drop nativo (HTML5). El drag nativo no desplaza
// solo el contenedor scrolleable, así que cuando el cursor se acerca al borde
// superior/inferior, scrolleamos el contenedor (o la ventana) con un loop rAF.
//
// Uso: startDragScroll() en onDragStart, stopDragScroll() en onDragEnd.

let raf = null;
let speed = 0;
let container = null;

const EDGE = 80;   // px desde el borde donde empieza a scrollear
const MAX = 20;    // px por frame al máximo

function isScrollable(node) {
  if (!node || node === document.body || node === document.documentElement) return false;
  const oy = getComputedStyle(node).overflowY;
  return (oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 4;
}

function scrollableParent(el) {
  let node = el;
  while (node && node !== document.body) {
    if (isScrollable(node)) return node;
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function doScroll(amount) {
  if (!container) return;
  if (container === document.scrollingElement || container === document.documentElement) window.scrollBy(0, amount);
  else container.scrollTop += amount;
}

function loop() {
  if (speed !== 0) doScroll(speed);
  raf = requestAnimationFrame(loop);
}

function onDragOver(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el) { speed = 0; return; }
  container = scrollableParent(el);
  let top, bottom;
  if (container === document.scrollingElement || container === document.documentElement) {
    top = 0; bottom = window.innerHeight;
  } else {
    const r = container.getBoundingClientRect();
    top = r.top; bottom = r.bottom;
  }
  const topDist = e.clientY - top;
  const botDist = bottom - e.clientY;
  if (topDist < EDGE) speed = -Math.ceil(MAX * Math.max(0, (EDGE - topDist) / EDGE));
  else if (botDist < EDGE) speed = Math.ceil(MAX * Math.max(0, (EDGE - botDist) / EDGE));
  else speed = 0;
}

export function startDragScroll() {
  document.addEventListener('dragover', onDragOver, true);
  if (raf == null) raf = requestAnimationFrame(loop);
}

export function stopDragScroll() {
  document.removeEventListener('dragover', onDragOver, true);
  if (raf != null) { cancelAnimationFrame(raf); raf = null; }
  speed = 0; container = null;
}
