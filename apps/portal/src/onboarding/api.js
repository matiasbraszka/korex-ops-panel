// ─────────────────────────────────────────────────────────────────────────────
// Capa de datos del onboarding.
//
// NO usa el helper `rpc()` de portalApi.js a propósito. Ese helper cae al mock
// en silencio cuando la RPC falla, lo cual está bien para LEER (mejor mostrar
// algo que una pantalla rota) pero es inaceptable para GUARDAR: el cliente
// vería "Guardado" mientras su respuesta se perdió. Acá los errores se
// propagan, y el Provider decide reintentar.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from '../lib/supabase';
import { uploadRecurso } from '../data/portalApi';
import * as demo from './demo';

async function call(fn, args) {
  const { data, error } = await supabase.rpc(fn, args || {});
  if (error) throw new Error(error.message || fn);
  return data;
}

// Cada ESCRITURA pasa por acá. En modo prueba se desvía a la versión simulada y
// no sale nada de este navegador; en modo normal es exactamente lo de antes.
// Ver onboarding/demo.js para el porqué (reservar un horario manda WhatsApps de
// verdad, terminar el onboarding escribe el cerebro y avisa por Slack).
const escribir = (real, simulado) => (...args) => (
  demo.demoActivo() ? simulado(...args) : real(...args)
);

/**
 * ¿Estamos mirando el onboarding sin ser un cliente?
 *
 * Pasa cuando se abre el modo prueba sin sesión, para recorrer el flujo sin las
 * credenciales de nadie. En ese caso las dos lecturas —catálogo y estado— salen
 * de la copia local, porque las RPC piden sesión.
 */
const sinSesion = async () => {
  if (!demo.demoActivo()) return false;
  const { data } = await supabase.auth.getSession();
  return !data?.session;
};

export const onb = {
  catalogo: async () => (await sinSesion()
    ? demo.demoCatalogo()
    : call('portal_onboarding_catalogo')),

  estado: async () => {
    if (await sinSesion()) return demo.demoEstado();
    const e = await call('portal_onboarding_estado');
    return demo.demoActivo() ? demo.demoMezclarEstado(e) : e;
  },

  guardar: escribir(
    (qkey, valor, opts = {}) => call('portal_onboarding_guardar', {
      p_qkey: qkey,
      p_value_text: valor ?? '',
      p_value_json: opts.valorJson ?? null,
      p_source: opts.source || 'texto',
      p_flag: opts.flag ?? null,
      p_transcript: opts.transcript ?? null,
      p_audio_path: opts.audioPath ?? null,
      p_audio_ms: opts.audioMs ?? null,
      p_expected: opts.expected ?? null,
    }),
    demo.demoGuardar,
  ),

  guardarLote: escribir(
    (items) => call('portal_onboarding_guardar_lote', { p_items: items }),
    demo.demoGuardarLote,
  ),

  seccionCompleta: escribir(
    (skey) => call('portal_onboarding_seccion_completa', { p_skey: skey }),
    async () => ({ ok: true, demo: true }),
  ),

  agendaDatos: async () => {
    if (await sinSesion()) {
      // Sin token no se piden horarios reales: la pantalla muestra el guion de
      // la sesión y cae en su salida ("seguí sin agendar"), que es justo el
      // camino que conviene poder ver.
      return {
        token: null,
        sesion: [
          { titulo: 'Resolvemos tus dudas del onboarding',
            texto: 'Repasamos juntos lo que completaste acá. Por eso es fundamental que lo termines antes de la reunión.' },
          { titulo: 'Configuramos tu Meta Business', aviso: true,
            texto: 'Necesitás tener acceso a una página de Facebook y a un Instagram. Si no los tenés, vamos a tener que reagendar.' },
          { titulo: 'Dejamos definidos los próximos pasos',
            texto: 'Qué hacemos nosotros, qué necesitamos de vos y cuándo sale cada cosa.' },
        ],
        nombre: 'Sergio Cabrera', email: 'sergio@ejemplo.com',
        telefono: '+54 9 341 555 1234', pais: 'Argentina',
      };
    }
    return call('portal_onboarding_agenda_datos');
  },

  agendaRegistrar: escribir(
    (appointmentId) => call('portal_onboarding_agenda_registrar', { p_appointment_id: appointmentId }),
    async () => ({ ok: true, demo: true }),
  ),

  agendaOmitir: escribir(
    (motivo) => call('portal_onboarding_agenda_omitir', { p_motivo: motivo || null }),
    demo.demoOmitirAgenda,
  ),

  // La fecha de grabación es solo un día, sin reserva de calendario: se guarda
  // en el run para que la tarea de seguimiento del equipo nazca con esa fecha
  // encima en vez de tener que leerla del texto de la respuesta.
  grabacion: escribir(
    (fecha) => call('portal_onboarding_grabacion', { p_fecha: fecha }),
    async (fecha) => ({ ok: true, fecha, demo: true }),
  ),

  completar: escribir(() => call('portal_onboarding_completar'), demo.demoCompletar),

  // El cliente tildó "leí y acepto las Reglas del servicio". Deja constancia
  // (fecha + versión) en su corrida de onboarding.
  aceptarReglas: escribir(
    (version) => call('portal_onboarding_aceptar_reglas', { p_version: String(version || '1') }),
    async (version) => ({ ok: true, demo: true, version }),
  ),
};

/**
 * Subida de material. En modo prueba simula el progreso y no toca ni Bunny ni
 * Storage ni funnel_resources; en modo normal es `uploadRecurso` tal cual.
 */
export function subirRecurso(bucket, file, onProgress) {
  return demo.demoActivo()
    ? demo.demoSubir(bucket, file, onProgress)
    : uploadRecurso(bucket, file, onProgress);
}

// ── Agenda: el sistema de Soporte, invocado directo desde el portal ──────────
// `agenda-publica` tiene verify_jwt:false y CORS *, así que se llama igual que
// desde la página pública. Nos ahorra reimplementar disponibilidad cruzada,
// free/busy de Google, el evento de Calendar, el link de Zoom, el WhatsApp de
// confirmación y los recordatorios: todo eso ya lo hace.
export async function agendaSlots(token, year, month) {
  const { data, error } = await supabase.functions.invoke('agenda-publica', {
    body: { action: 'slots', year, month, token },
  });
  if (error) throw new Error(error.message || 'agenda_slots');
  return data;
}

export async function agendaReservar({ token, date, time, nombre, email, telefono, tz }) {
  // En modo prueba NO se llama a `book`: esa acción crea la cita, el evento de
  // Google Calendar y manda WhatsApp al cliente y al equipo. Es la operación
  // más irreversible de todo el flujo.
  if (demo.demoActivo()) return demo.demoReservar({ date, time });

  // El teléfono del cliente viene de su ficha y puede traer el prefijo pegado.
  // agenda-publica espera dial y phone por separado.
  const limpio = String(telefono || '').replace(/[^\d+]/g, '');
  const m = limpio.match(/^\+(\d{1,3})(\d{6,})$/);
  const dial = m ? `+${m[1]}` : '';
  const phone = m ? m[2] : limpio.replace(/^\+/, '');

  const { data, error } = await supabase.functions.invoke('agenda-publica', {
    body: {
      action: 'book', token, date, time,
      name: nombre, email, dial, phone,
      tz: tz || Intl.DateTimeFormat().resolvedOptions().timeZone,
      answers: [],
    },
  });
  if (error) throw new Error(error.message || 'agenda_book');
  if (!data?.ok) throw new Error(data?.error || 'agenda_book');
  return data;
}

// ── Transcripción ────────────────────────────────────────────────────────────
// Misma edge function que usa el equipo para auditar audios de WhatsApp; se le
// agregó una rama de autorización para el cliente con onboarding en curso.
export async function transcribir(blob) {
  const base64 = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  const ext = (blob.type || '').includes('mp4') ? 'm4a' : 'webm';
  const { data, error } = await supabase.functions.invoke('transcribir-audio', {
    body: { base64, mimetype: blob.type || 'audio/webm', filename: `respuesta.${ext}` },
  });
  if (error) throw new Error(error.message || 'transcribir');
  if (!data?.ok) throw new Error(data?.error || 'transcribir');
  return String(data.text || '').trim();
}

// Guarda el audio aunque la transcripción falle. Perder lo que el cliente ya
// dijo es el peor error posible de esta pantalla: si Whisper no responde, nos
// quedamos igual con el audio y lo pasamos a texto nosotros.
export async function guardarAudio(clientHint, qkey, blob) {
  if (demo.demoActivo()) return demo.demoGuardarAudio(clientHint, qkey);

  const ext = (blob.type || '').includes('mp4') ? 'm4a' : 'webm';
  const path = `portal/onboarding/${clientHint || 'cliente'}/${qkey}_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('funnel-recursos')
    .upload(path, blob, { cacheControl: '3600', upsert: false, contentType: blob.type || 'audio/webm' });
  if (error) throw new Error(error.message || 'audio_upload');
  return path;
}
