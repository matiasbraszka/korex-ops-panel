// Auto-scroll durante drag & drop nativo (HTML5). El drag nativo no desplaza
// solo los contenedores scrolleables, así que cuando el cursor se acerca a un
// borde, scrolleamos:
//   • VERTICAL: el contenedor scrolleable más cercano (o la ventana) → permite
//     llegar a columnas/filas que quedaron arriba o abajo.
//   • HORIZONTAL: el contenedor con scroll-x más cercano (ej. el Tablero Sprint)
//     → al arrastrar hacia un costado aparecen las columnas que no entran en
//     pantalla, sin tener que soltar.
//
// Uso: startDragScroll() en onDragStart, stopDragScroll() en onDragEnd.

let raf = null;
let vy = 0;            // velocidad vertical (px/frame)
let vx = 0;            // velocidad horizontal (px/frame)
let vContainer = null; // contenedor que scrollea en Y (o window)
let hContainer = null; // contenedor que scrollea en X (o null)

const EDGE = 90;   // px desde el borde donde empieza a scrollear
const MAX = 24;    // px por frame al máximo

function isScrollableY(node) {
  if (!node || node === document.body || node === document.documentElement) return false;
  const oy = getComputedStyle(node).overflowY;
  return (oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 4;
}
function isScrollableX(node) {
  if (!node || node === document.body || node === document.documentElement) return false;
  const ox = getComputedStyle(node).overflowX;
  return (ox === 'auto' || ox === 'scroll') && node.scrollWidth > node.clientWidth + 4;
}
function findY(el) {
  let node = el;
  while (node && node !== document.body) { if (isScrollableY(node)) return node; node = node.parentElement; }
  return document.scrollingElement || document.documentElement;
}
function findX(el) {
  let node = el;
  while (node && node !== document.body) { if (isScrollableX(node)) return node; node = node.parentElement; }
  return null;
}

// Velocidad proporcional a qué tan cerca del borde está el cursor.
const ramp = (dist) => Math.ceil(MAX * Math.max(0, (EDGE - dist) / EDGE));

function loop() {
  if (vy !== 0 && vContainer) {
    if (vContainer === document.scrollingElement || vContainer === document.documentElement) window.scrollBy(0, vy);
    else vContainer.scrollTop += vy;
  }
  if (vx !== 0 && hContainer) hContainer.scrollLeft += vx;
  raf = requestAnimationFrame(loop);
}

function onDragOver(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (!el) { vx = 0; vy = 0; return; }

  // ── Vertical ──
  vContainer = findY(el);
  let top, bottom;
  if (vContainer === document.scrollingElement || vContainer === document.documentElement) {
    top = 0; bottom = window.innerHeight;
  } else {
    const r = vContainer.getBoundingClientRect(); top = r.top; bottom = r.bottom;
  }
  const topDist = e.clientY - top;
  const botDist = bottom - e.clientY;
  if (topDist < EDGE) vy = -ramp(topDist);
  else if (botDist < EDGE) vy = ramp(botDist);
  else vy = 0;

  // ── Horizontal ──
  hContainer = findX(el);
  if (hContainer) {
    const r = hContainer.getBoundingClientRect();
    const leftDist = e.clientX - r.left;
    const rightDist = r.right - e.clientX;
    if (leftDist < EDGE) vx = -ramp(leftDist);
    else if (rightDist < EDGE) vx = ramp(rightDist);
    else vx = 0;
  } else {
    vx = 0;
  }
}

export function startDragScroll() {
  document.addEventListener('dragover', onDragOver, true);
  if (raf == null) raf = requestAnimationFrame(loop);
}

export function stopDragScroll() {
  document.removeEventListener('dragover', onDragOver, true);
  if (raf != null) { cancelAnimationFrame(raf); raf = null; }
  vx = 0; vy = 0; vContainer = null; hContainer = null;
}
