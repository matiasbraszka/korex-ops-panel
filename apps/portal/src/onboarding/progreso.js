// ─────────────────────────────────────────────────────────────────────────────
// Visibilidad, progreso y armado de pantallas, replicado en el front para que
// todo se mueva en el mismo tecleo, sin esperar al servidor.
//
// La verdad la tiene la base (onboarding_progreso / _onboarding_lleno /
// _onboarding_visible): esto es el eco optimista. Si difieren, gana el
// servidor. Cada función de acá tiene su gemela en SQL y hay que moverlas
// juntas: el número que ve el cliente y el que ve el operador tienen que ser
// el mismo, o el equipo termina llamando para preguntar por un 40% que el
// cliente ve como 55%.
// ─────────────────────────────────────────────────────────────────────────────

/** El mínimo para que una respuesta cuente: el 60% del largo pedido. */
export const minLargo = (q) => Math.round((q?.largo || 0) * 0.6);

/** ¿Se ve esta pregunta? Espeja _onboarding_visible(). */
export function visible(q, respuestas) {
  const cond = q.visibleSi;
  if (!cond || !cond.qkey) return true;
  const r = respuestas?.[cond.qkey];
  const texto = String(r?.valor ?? '').trim();
  if (cond.no_vacio) return texto !== '';

  // El valor de la opción vive en el json; el texto guarda la etiqueta legible
  // (que es la que va al documento del DEL).
  let partes = [];
  if (Array.isArray(r?.valorJson?.valores)) partes = r.valorJson.valores;
  else if (r?.valorJson?.valor) partes = [r.valorJson.valor];
  else if (texto) partes = texto.split(',');
  if (!partes.length) return false;

  const norm = partes.map((s) => String(s).trim().toLowerCase());
  return (cond.in || []).some((x) => norm.includes(String(x).trim().toLowerCase()));
}

/** Archivos ya subidos para una pregunta de archivos. */
export function subidos(q, bloqueantes) {
  const b = (bloqueantes || []).find((x) => x.bucket === q.bucket);
  return b ? Number(b.subidos || 0) : 0;
}

/** ¿Está llena? Binario, como el `filled()` del HTML. Espeja _onboarding_lleno(). */
export function lleno(q, respuestas, bloqueantes) {
  if (q.tipo === 'info' || q.tipo === 'resumen') return true;
  if (q.tipo === 'archivos' || q.tipo === 'subida') {
    return subidos(q, bloqueantes) >= Math.max(q.target || 1, 1);
  }
  const len = String(respuestas?.[q.qkey]?.valor || '').trim().length;
  if (q.largo > 0) return len >= minLargo(q);
  return len > 0;
}

/** Todas las preguntas visibles, aplanadas, con su paso encima. */
export function preguntasVisibles(pasos, respuestas) {
  return (pasos || []).flatMap((p) =>
    (p.preguntas || []).filter((q) => visible(q, respuestas)).map((q) => ({ ...q, skey: p.skey })));
}

/**
 * El porcentaje: obligatorias respondidas sobre obligatorias visibles.
 * Sin pesos y sin techos — ver la migración v30.
 */
export function calcularProgreso(pasos, respuestas, bloqueantes) {
  let total = 0;
  let hechas = 0;
  preguntasVisibles(pasos, respuestas).forEach((q) => {
    if (!q.requerida) return;
    total += 1;
    if (lleno(q, respuestas, bloqueantes)) hechas += 1;
  });
  return {
    pct: total === 0 ? 0 : Math.round((hechas / total) * 100),
    requeridas: total,
    respondidas: hechas,
  };
}

/** Cuenta de un paso, para el índice y el control de calidad final. */
export function statsPaso(paso, respuestas, bloqueantes) {
  let total = 0;
  let hechas = 0;
  (paso?.preguntas || []).forEach((q) => {
    if (!q.qkey || q.tipo === 'info' || q.tipo === 'resumen') return;
    if (!visible(q, respuestas)) return;
    total += 1;
    if (lleno(q, respuestas, bloqueantes)) hechas += 1;
  });
  return { total, hechas, completo: total > 0 && hechas === total };
}

/** Cuenta de un bloque: es lo que abre pestañas del portal. */
export function statsBloque(bkey, pasos, respuestas, bloqueantes) {
  let total = 0;
  let hechas = 0;
  (pasos || []).filter((p) => p.bkey === bkey).forEach((p) => {
    const s = statsPaso(p, respuestas, bloqueantes);
    total += s.total; hechas += s.hechas;
  });
  return { total, hechas, completo: total > 0 && hechas === total };
}

/**
 * Las pantallas de un paso. El agrupamiento es EXPLÍCITO: dos preguntas con el
 * mismo `pantalla` comparten pantalla, y punto. Antes se deducía con
 * heurísticas y mover una pregunta cambiaba el agrupamiento de otra.
 *
 * Una pantalla que queda sin preguntas visibles no existe: si todas sus
 * preguntas dependían de una condición que no se cumple, no hay que mostrar
 * una pantalla vacía.
 */
export function pantallasDe(paso, respuestas) {
  const porPantalla = new Map();
  (paso?.preguntas || []).forEach((q) => {
    if (!visible(q, respuestas)) return;
    const n = q.pantalla ?? 0;
    if (!porPantalla.has(n)) porPantalla.set(n, []);
    porPantalla.get(n).push(q);
  });
  return [...porPantalla.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, preguntas]) => ({ id: preguntas[0].qkey, pantalla: n, preguntas }));
}

/**
 * La lista lineal por la que avanza el cliente: portada de paso, después sus
 * pantallas, y así. Es lo que hace que Atrás/Continuar sepan a dónde ir.
 */
export function nodos(pasos, respuestas) {
  const out = [];
  (pasos || []).forEach((paso, i) => {
    const pantallas = pantallasDe(paso, respuestas);
    if (!pantallas.length) return;
    out.push({ tipo: 'portada', i, paso });
    pantallas.forEach((pant, j) =>
      out.push({ tipo: 'pregunta', i, paso, pantalla: pant, j, total: pantallas.length }));
  });
  return out;
}

/**
 * El medidor de las respuestas largas. Habla en caracteres, como el HTML.
 * Naranja, nunca rojo: rojo es "está mal", naranja es "falta".
 */
export function medidor(len, largo) {
  const min = Math.round(largo * 0.6);
  const r = largo ? len / largo : 0;
  const w = `${Math.min(100, Math.max(len > 0 ? 5 : 0, r * 100))}%`;
  if (len === 0) return { w: '0%', color: '#D0D5DD', texto: `Mínimo ${min} caracteres` };
  if (len < min) return { w, color: '#EAB308', texto: `Faltan ${min - len} caracteres` };
  if (r < 1) return { w, color: '#22C55E', texto: 'Muy buena respuesta' };
  return { w: '100%', color: '#22C55E', texto: 'Excelente' };
}

/** Minutos que faltan, sumando los pasos que todavía no están completos. */
export function minutosRestantes(pasos, respuestas, bloqueantes) {
  return (pasos || []).reduce((acc, p) => {
    const s = statsPaso(p, respuestas, bloqueantes);
    return s.completo ? acc : acc + (p.minutos || 0);
  }, 0);
}
