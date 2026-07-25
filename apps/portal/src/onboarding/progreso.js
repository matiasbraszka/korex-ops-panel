// Cálculo de progreso y visibilidad, replicado en el front para que la barra se
// mueva en el mismo instante en que el cliente escribe, sin esperar al servidor.
// La verdad la tiene onboarding_progreso() en la base: esto es solo el eco
// optimista. Si difieren, gana el servidor (el Provider pisa con su respuesta).

/** ¿Se ve esta pregunta con las respuestas que hay? Espeja _onboarding_visible(). */
export function visible(q, respuestas) {
  const cond = q.visibleSi;
  if (!cond || !cond.qkey) return true;
  const val = String(respuestas?.[cond.qkey]?.valor ?? '').trim();
  if (cond.no_vacio) return val !== '';
  if (!val) return false;
  const partes = val.split(',').map((s) => s.trim().toLowerCase());
  return (cond.in || []).some((x) => partes.includes(String(x).trim().toLowerCase()));
}

/** Cuántos archivos hay subidos para una pregunta de tipo subida. */
function subidos(q, bloqueantes) {
  const b = (bloqueantes || []).find((x) => x.bucket === q.bucket);
  return b ? Number(b.subidos || 0) : 0;
}

/**
 * Factor de una respuesta: 1 completa · 0.6 a medio camino · 0 vacía.
 * El 45% no es arbitrario: es el punto donde una respuesta deja de ser un
 * "sí" y empieza a tener contenido con el que se puede trabajar.
 */
export function factor(q, respuestas, bloqueantes) {
  if (q.tipo === 'subida') {
    const n = subidos(q, bloqueantes);
    const meta = Math.max(q.target || 1, 1);
    return n >= meta ? 1 : n > 0 ? 0.6 : 0;
  }
  const len = String(respuestas?.[q.qkey]?.valor ?? '').trim().length;
  if (q.minChars > 0) {
    if (len >= q.minChars) return 1;
    if (len >= q.minChars * 0.45) return 0.6;
    return 0;
  }
  return len > 0 ? 1 : 0;
}

export function preguntasVisibles(secciones, respuestas) {
  return (secciones || []).flatMap((s) =>
    (s.preguntas || []).filter((q) => visible(q, respuestas)).map((q) => ({ ...q, skey: s.skey })));
}

/** Progreso ponderado 0-100. Topeado en 99 mientras falte material bloqueante. */
export function calcularProgreso(secciones, respuestas, bloqueantes, agendaEstado) {
  const qs = preguntasVisibles(secciones, respuestas).filter((q) => q.requerida);
  let total = 0; let ok = 0; let hechas = 0;
  qs.forEach((q) => {
    const p = Math.max(q.peso || 1, 1);
    const f = factor(q, respuestas, bloqueantes);
    total += p; ok += p * f;
    if (f >= 1) hechas += 1;
  });
  let pct = total === 0 ? 0 : Math.round((ok / total) * 100);

  // Nunca 0%: haber agendado ya es haber empezado, y arrancar en cero desanima.
  if (pct < 3 && agendaEstado && agendaEstado !== 'pendiente') pct = 3;

  const pend = (bloqueantes || []).filter((b) => !['completo', 'validado'].includes(b.estado)
    && Number(b.subidos || 0) < Math.max(Number(b.target || 1), 1));
  if (pend.length) pct = Math.min(pct, 99);

  return { pct, requeridas: qs.length, respondidas: hechas, bloqueaPct: pend };
}

/** Minutos que faltan, sumando solo lo que todavía no está respondido. */
export function minutosRestantes(secciones, respuestas, bloqueantes) {
  return preguntasVisibles(secciones, respuestas)
    .filter((q) => factor(q, respuestas, bloqueantes) < 1)
    .reduce((acc, q) => acc + (q.minutos || 1), 0);
}

/** ¿Está cerrado este tramo? (todas sus requeridas visibles completas) */
export function tramoCompleto(seccion, respuestas, bloqueantes) {
  const qs = (seccion.preguntas || []).filter((q) => q.requerida && visible(q, respuestas));
  if (!qs.length) return true;
  return qs.every((q) => factor(q, respuestas, bloqueantes) >= 1);
}

/**
 * Agrupa las preguntas de un tramo en PANTALLAS.
 * Las cortas que comparten `grupo` van juntas; las largas (minChars >= 800)
 * siempre solas — agrupar la pregunta grande con otras es exactamente lo que
 * produce respuestas de tres líneas.
 */
export function pantallasDe(seccion, respuestas) {
  const qs = (seccion.preguntas || []).filter((q) => visible(q, respuestas));
  const out = [];
  qs.forEach((q) => {
    const solo = !q.grupo || q.minChars >= 800 || q.tipo === 'subida';
    const ultima = out[out.length - 1];
    if (!solo && ultima && ultima.grupo === q.grupo) ultima.preguntas.push(q);
    else out.push({ id: q.qkey, grupo: solo ? null : q.grupo, preguntas: [q] });
  });
  return out;
}

/** Segundos hablando que representa un minChars (≈150 palabras/min). */
export function segundosDeVoz(minChars) {
  return Math.max(15, Math.round((minChars || 0) / 14));
}

export function textoDuracion(seg) {
  if (seg < 60) return `${seg} segundos`;
  const m = Math.floor(seg / 60); const s = seg % 60;
  return s < 15 ? `${m} minuto${m > 1 ? 's' : ''}` : `${m}:${String(s).padStart(2, '0')} minutos`;
}
