// Checklists del DEL: marcar y desmarcar los cuadraditos.
//
// La checklist del editor no es un <input type="checkbox">: es un <ul> con un
// marcador de CSS (list-style-type: "☐  "). Eso la hacía dibujarse bien y sobrevivir
// al sanitizador —que no deja pasar <input>— pero también la volvía un ADORNO: no
// había nada que clickear, así que el equipo ponía checklists que nadie podía tildar.
//
// La solución es del mismo palo: el tilde se guarda como el marcador propio de cada
// <li>. Un ítem marcado lleva `list-style-type: "☑  "` en su style inline, que ya
// está en la whitelist del sanitizador. No hace falta tocar la base ni el HTML que
// ya existe: una checklist vieja sigue mostrando ☐ y al primer clic empieza a
// guardar su estado.

export const CHECK_OFF = '☐';
export const CHECK_ON = '☑';

// ¿Este <li> pertenece a una checklist? Mira su propio marcador y el de su lista.
export function esItemDeChecklist(li) {
  if (!li || li.tagName !== 'LI') return false;
  const propio = li.style?.listStyleType || '';
  if (propio.includes(CHECK_OFF) || propio.includes(CHECK_ON)) return true;
  const ul = li.closest('ul');
  const heredado = ul?.style?.listStyleType || '';
  return heredado.includes(CHECK_OFF) || heredado.includes(CHECK_ON);
}

export function estaMarcado(li) {
  return (li?.style?.listStyleType || '').includes(CHECK_ON);
}

// Marca o desmarca el ítem. El tachado va como estilo inline por la misma razón que
// el marcador: es lo que sobrevive al sanitizador y se ve igual en el portal.
export function alternarItem(li) {
  const on = !estaMarcado(li);
  li.style.listStyleType = on ? `"${CHECK_ON}  "` : `"${CHECK_OFF}  "`;
  li.style.listStylePosition = 'inside';
  li.style.textDecoration = on ? 'line-through' : '';
  li.style.opacity = on ? '0.55' : '';
  return on;
}

// El marcador se dibuja al principio del ítem; se toma esa franja como la zona de
// clic. Así, editando, se sigue pudiendo hacer clic en el texto para escribir sin
// que se tilde solo. En modo lectura no hace falta apuntar: sirve todo el ítem.
const ANCHO_MARCADOR = 26;

export function clicEnElCuadradito(e, li, soloMarcador) {
  if (!soloMarcador) return true;
  const r = li.getBoundingClientRect();
  return (e.clientX - r.left) <= ANCHO_MARCADOR;
}

// Engancha el tildado en un contenedor de HTML del DEL.
//   raiz          — el nodo que tiene el HTML adentro
//   soloMarcador  — true mientras se está editando (ver arriba)
//   alCambiar     — se llama con el HTML nuevo para guardarlo
// Devuelve la función para desengancharlo.
// Las checklists viejas dibujan el cuadradito AFUERA del ítem (es el default de las
// listas), y ahí el clic ni siquiera le pega al <li>. Pasarlas a `inside` mete el
// marcador adentro de la caja del ítem: es lo que hace que se pueda tildar. Se aplica
// al mostrar, así funciona con todo lo que ya estaba escrito sin migrar nada.
export function normalizarChecklists(raiz) {
  if (!raiz) return;
  raiz.querySelectorAll('ul').forEach((ul) => {
    const m = ul.style?.listStyleType || '';
    if (!m.includes(CHECK_OFF) && !m.includes(CHECK_ON)) return;
    ul.style.listStylePosition = 'inside';
  });
  raiz.querySelectorAll('li').forEach((li) => {
    const m = li.style?.listStyleType || '';
    if (m.includes(CHECK_OFF) || m.includes(CHECK_ON)) li.style.listStylePosition = 'inside';
  });
}

export function engancharChecklist(raiz, { soloMarcador = false, alCambiar } = {}) {
  if (!raiz) return () => {};
  normalizarChecklists(raiz);
  const onClick = (e) => {
    const li = e.target?.closest?.('li');
    if (!li || !raiz.contains(li) || !esItemDeChecklist(li)) return;
    if (!clicEnElCuadradito(e, li, soloMarcador)) return;
    e.preventDefault();
    e.stopPropagation();
    alternarItem(li);
    alCambiar?.(raiz.innerHTML);
  };
  raiz.addEventListener('click', onClick);
  return () => raiz.removeEventListener('click', onClick);
}
