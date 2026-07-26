// ─────────────────────────────────────────────────────────────────────────────
// MODO PRUEBA del onboarding.
//
// Sirve para recorrer el flujo entero tocando todo —reservar un horario, grabar,
// subir archivos, terminar el onboarding— sin que se dispare ninguna de las
// consecuencias reales. Es necesario porque este flujo NO es inocuo:
//
//   · reservar un horario crea la cita de verdad, el evento en Google Calendar,
//     el link de Zoom, y manda WhatsApp al cliente Y al equipo;
//   · terminar el onboarding escribe el documento del cerebro, destraba el gate
//     de Descubrimiento, crea tareas y avisa por Slack;
//   · subir un archivo lo sube a Bunny/Storage y lo registra en funnel_resources;
//   · cada respuesta se guarda contra el cliente real.
//
// Qué se simula y qué no:
//
//   SIMULADO (nada sale de este navegador):
//     guardar · guardarLote · seccionCompleta · reservar · omitir agenda ·
//     completar · subir archivos · guardar audio
//
//   REAL (son solo lectura, y son lo que hay que ver de verdad):
//     catálogo · estado · datos de la agenda · horarios disponibles ·
//     transcripción de voz
//
// Las respuestas de prueba viven en localStorage, así que el progreso se siente
// real: podés cerrar la pestaña y seguir donde quedaste. "Borrar todo" en el
// cartel de arriba las tira.
//
// SEGURIDAD: solo se puede activar en desarrollo (`import.meta.env.DEV`) o con
// VITE_ONB_DEMO=1 en el build. En el build de producción ninguna de las dos
// cosas es cierta, así que `demoActivo()` devuelve false siempre y este archivo
// queda inerte.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = 'korex_onb_demo';
const DATOS = 'korex_onb_demo_datos';

/** ¿Está permitido siquiera ofrecer el modo prueba en este build? */
export const DEMO_DISPONIBLE = !!import.meta.env?.DEV || import.meta.env?.VITE_ONB_DEMO === '1';

function leer(k, def) {
  try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? def; } catch { return def; }
}
function escribir(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* incógnito lleno */ }
}

// El flag se puede prender/apagar con ?demo=1 / ?demo=0 y queda pegado, para no
// tener que reiniciar el server ni acordarse de nada.
function resolverFlag() {
  if (!DEMO_DISPONIBLE) return false;
  try {
    const p = new URLSearchParams(window.location.search).get('demo');
    if (p === '1' || p === '0') {
      localStorage.setItem(CLAVE, p);
      return p === '1';
    }
    // Por defecto, en `npm run dev` arranca PRENDIDO: si alguien abre el local
    // para mirar y toca "reservar", el default seguro es no reservar nada.
    const g = localStorage.getItem(CLAVE);
    return g === null ? !!import.meta.env?.DEV : g === '1';
  } catch { return false; }
}

let activo = resolverFlag();

export function demoActivo() { return activo; }

export function demoCambiar(on) {
  activo = DEMO_DISPONIBLE && !!on;
  escribir(CLAVE, activo ? '1' : '0');
  try { localStorage.setItem(CLAVE, activo ? '1' : '0'); } catch { /* nada */ }
}

// ── Estado simulado ──────────────────────────────────────────────────────────
const vacio = () => ({ respuestas: {}, agenda: null, completado: false, subidos: {} });

export const demoDatos = () => leer(DATOS, vacio());

export function demoReset() {
  escribir(DATOS, vacio());
  try {
    localStorage.removeItem('korex_onb_bienvenida');
    localStorage.removeItem('korex_onb_cola');
  } catch { /* nada */ }
}

function mutar(fn) {
  const d = demoDatos();
  fn(d);
  escribir(DATOS, d);
  return d;
}

/** Latencia falsa: sin ella los botones se sienten rotos de tan instantáneos. */
const demora = (ms = 260) => new Promise((r) => { setTimeout(r, ms); });

// ── Escrituras simuladas ─────────────────────────────────────────────────────

export async function demoGuardar(qkey, valor, opts = {}) {
  await demora(140);
  mutar((d) => {
    d.respuestas[qkey] = {
      valor: valor ?? '',
      valorJson: opts.valorJson ?? d.respuestas[qkey]?.valorJson ?? null,
      source: opts.source || 'texto',
      flag: opts.flag ?? null,
    };
  });
  // Sin `progreso`: así el Provider se queda con su cálculo optimista, que en
  // modo prueba es la única verdad que hay.
  return { ok: true, demo: true };
}

export async function demoGuardarLote(items) {
  await demora(180);
  mutar((d) => {
    (items || []).forEach((it) => {
      d.respuestas[it.qkey] = {
        valor: it.valor ?? '',
        valorJson: it.valorJson ?? d.respuestas[it.qkey]?.valorJson ?? null,
        source: it.source || 'texto',
        flag: it.flag ?? null,
      };
    });
  });
  return { ok: true, demo: true };
}

export async function demoReservar({ date, time }) {
  await demora(700);
  const at = new Date(`${date}T${(time || '10:00').padStart(5, '0')}:00`);
  mutar((d) => { d.agenda = { estado: 'agendado', at: at.toISOString() }; });
  return { ok: true, demo: true, appointment_id: 'demo-0000', event: { start_at: at.toISOString() } };
}

export async function demoOmitirAgenda(motivo) {
  await demora(200);
  mutar((d) => { d.agenda = { estado: 'omitido', motivo: motivo || null }; });
  return { ok: true, demo: true };
}

export async function demoCompletar() {
  await demora(900);
  mutar((d) => { d.completado = true; });
  return { ok: true, demo: true };
}

export async function demoSubir(bucket, file, onProgress) {
  // Progreso falso pero creíble, para ver la barra y el "N subiendo" del header.
  for (let p = 0; p <= 1; p += 0.2) {
    await demora(220);
    onProgress?.(Math.min(1, p));
  }
  mutar((d) => { d.subidos[bucket] = (d.subidos[bucket] || 0) + 1; });
  return { ok: true, demo: true, name: file?.name };
}

export async function demoGuardarAudio(clientHint, qkey) {
  await demora(300);
  return `demo/onboarding/${clientHint || 'cliente'}/${qkey}.webm`;
}

// ── Lectura: el estado real, con lo de prueba encima ─────────────────────────
// El catálogo, el prefill y los bloqueantes salen de la base (queremos ver el
// contenido real); las respuestas, la agenda y las subidas salen de acá.
export function demoMezclarEstado(estado) {
  const d = demoDatos();
  const base = estado || {};
  return {
    ...base,
    runId: base.runId || 'demo',
    estado: d.completado ? 'completado' : (Object.keys(d.respuestas).length ? 'en_curso' : (base.estado || 'invitado')),
    respuestas: { ...(base.respuestas || {}), ...d.respuestas },
    agenda: d.agenda || base.agenda || { estado: 'pendiente' },
    bloqueantes: (base.bloqueantes || []).map((b) => (d.subidos[b.bucket]
      ? { ...b, subidos: Number(b.subidos || 0) + d.subidos[b.bucket] }
      : b)),
  };
}

// ── Modo prueba SIN CUENTA ───────────────────────────────────────────────────
// Para recorrer el onboarding entero sin credenciales de cliente y sin que la
// base se entere de nada. Hace falta porque /onboarding vive detrás del login
// del portal, y la única forma de verlo era entrar con la cuenta de un cliente
// real — es decir, mirando SUS respuestas.
//
// El catálogo sale de una copia local generada desde el mismo fuente del HTML
// (migrations/portal_v29_generador_json.cjs). Si alguien edita una pregunta
// desde /admin/onboarding, esta copia queda vieja: sirve para ver el flujo y el
// diseño, no para probar la integración con la base.
// Se carga a demanda, no con un import estatico: son 144 KB de preguntas y
// ejemplos que en produccion no los mira nadie. Asi Vite lo deja en un archivo
// aparte que el cliente real nunca pide.
let cache = null;
export async function demoCatalogo() {
  if (!cache) cache = (await import('./catalogoPrueba.json')).default;
  return cache;
}

/** Un cliente inventado, para que la pantalla tenga a quién saludar. */
export function demoEstado() {
  const d = demoDatos();
  return {
    runId: 'demo',
    estado: d.completado ? 'completado' : (Object.keys(d.respuestas).length ? 'en_curso' : 'invitado'),
    completo: !!d.completado,
    progreso: 0, requeridas: 0, respondidas: 0,
    faltan: [], bloqueantes: [], bloques: [],
    agenda: d.agenda || { estado: 'pendiente' },
    prefill: {
      nombre: 'Sergio Cabrera', empresa: 'Cabrera Nutrición',
      email: 'sergio@ejemplo.com', telefono: '+54 9 341 555 1234', pais: 'Argentina',
    },
    respuestas: d.respuestas,
  };
}
