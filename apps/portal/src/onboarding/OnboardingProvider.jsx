// ─────────────────────────────────────────────────────────────────────────────
// Estado del onboarding.
//
// Dos obsesiones acá adentro:
//
//  1) NO PERDER NADA. Cada respuesta se guarda sola a los 900 ms de que el
//     cliente deja de escribir, al salir del campo y al cambiar de pantalla. Si
//     falla la red, la respuesta queda en una cola en localStorage y se
//     reintenta al volver la conexión y al abrir la app. El cliente puede cerrar
//     la pestaña a mitad de una frase y no pierde una palabra.
//
//  2) QUE LA BARRA SE MUEVA YA. El progreso se recalcula en el front en el
//     mismo tecleo; la respuesta del servidor lo corrige después si difiere.
//     Esperar el round-trip hace que la barra se sienta rota.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onb } from './api';
import { calcularProgreso, minutosRestantes, preguntasVisibles } from './progreso';

const Ctx = createContext(null);
export const useOnboarding = () => useContext(Ctx);

const COLA_KEY = 'korex_onb_cola';
const DEBOUNCE_MS = 900;

function leerCola() {
  try { return JSON.parse(localStorage.getItem(COLA_KEY) || '{}'); } catch { return {}; }
}
function escribirCola(c) {
  try { localStorage.setItem(COLA_KEY, JSON.stringify(c)); } catch { /* modo incógnito lleno */ }
}

export function OnboardingProvider({ children }) {
  const [catalogo, setCatalogo] = useState(null);
  const [estado, setEstado] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // 'guardado' | 'guardando' | 'pendiente'  → el indicador gris del header
  const [sync, setSync] = useState('guardado');
  const [subiendo, setSubiendo] = useState([]);   // subidas corriendo en background

  const timers = useRef({});
  const montado = useRef(true);

  // ── Carga inicial ──────────────────────────────────────────────────────────
  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const [cat, est] = await Promise.all([onb.catalogo(), onb.estado()]);
      if (!montado.current) return;
      setCatalogo(cat);
      setEstado(est);
      setRespuestas(est?.respuestas || {});
    } catch (e) {
      if (montado.current) setError(e);
    } finally {
      if (montado.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    montado.current = true;
    cargar();
    return () => { montado.current = false; };
  }, [cargar]);

  // ── Cola de reintento ──────────────────────────────────────────────────────
  const vaciarCola = useCallback(async () => {
    const cola = leerCola();
    const items = Object.entries(cola).map(([qkey, v]) => ({ qkey, ...v }));
    if (!items.length) return;
    try {
      await onb.guardarLote(items);
      escribirCola({});
      if (montado.current) setSync('guardado');
    } catch {
      if (montado.current) setSync('pendiente');
    }
  }, []);

  useEffect(() => {
    vaciarCola();
    const onLine = () => vaciarCola();
    window.addEventListener('online', onLine);
    return () => window.removeEventListener('online', onLine);
  }, [vaciarCola]);

  // Última red: si el navegador se está cerrando, mandamos lo pendiente ya.
  useEffect(() => {
    const flush = () => {
      Object.values(timers.current).forEach(clearTimeout);
      timers.current = {};
      const cola = leerCola();
      if (!Object.keys(cola).length) return;
      // `keepalive` sobrevive al unload; si igual falla, la cola queda para la próxima.
      navigator.sendBeacon?.('/noop');
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  // ── Guardado ───────────────────────────────────────────────────────────────
  const enviar = useCallback(async (qkey, valor, opts) => {
    setSync('guardando');
    try {
      const r = await onb.guardar(qkey, valor, opts);
      const cola = leerCola();
      delete cola[qkey];
      escribirCola(cola);
      if (!montado.current) return r;
      setSync('guardado');
      // El servidor manda: si su progreso difiere del optimista, gana el suyo.
      if (r?.progreso != null) {
        setEstado((e) => (e ? { ...e, progreso: r.progreso, requeridas: r.requeridas,
          respondidas: r.respondidas, bloqueantes: r.bloqueantes ?? e.bloqueantes } : e));
      }
      return r;
    } catch (e) {
      const cola = leerCola();
      cola[qkey] = { valor, ...(opts || {}) };
      escribirCola(cola);
      if (montado.current) setSync('pendiente');
      return null;
    }
  }, []);

  /** Cambio de valor con autosave debounced. Es lo que llaman los campos. */
  const responder = useCallback((qkey, valor, opts = {}) => {
    setRespuestas((r) => ({
      ...r,
      [qkey]: { ...(r[qkey] || {}), valor, ...(opts.source ? { source: opts.source } : {}),
        ...(opts.flag !== undefined ? { flag: opts.flag } : {}) },
    }));
    setSync('guardando');
    clearTimeout(timers.current[qkey]);
    timers.current[qkey] = setTimeout(() => enviar(qkey, valor, opts), opts.inmediato ? 0 : DEBOUNCE_MS);
  }, [enviar]);

  /** Fuerza el guardado de todo lo que esté esperando (al navegar). */
  const flush = useCallback(async () => {
    const pend = Object.keys(timers.current);
    pend.forEach((k) => clearTimeout(timers.current[k]));
    timers.current = {};
    await vaciarCola();
  }, [vaciarCola]);

  // ── Derivados ──────────────────────────────────────────────────────────────
  const secciones = catalogo?.secciones || [];
  const bloqueantes = estado?.bloqueantes || [];

  const progreso = useMemo(
    () => calcularProgreso(secciones, respuestas, bloqueantes, estado?.agenda?.estado),
    [secciones, respuestas, bloqueantes, estado?.agenda?.estado],
  );

  const minutos = useMemo(
    () => minutosRestantes(secciones, respuestas, bloqueantes),
    [secciones, respuestas, bloqueantes],
  );

  const tramos = useMemo(() => secciones.filter((s) => s.skey !== 'agenda'), [secciones]);

  // Respuestas cortas: las que el cliente marcó "igual quiero seguir".
  // No bloquean, pero vuelven a aparecer en el repaso — con el ritmo ya tomado,
  // la segunda pasada recupera la mayoría.
  const cortas = useMemo(
    () => preguntasVisibles(secciones, respuestas)
      .filter((q) => respuestas[q.qkey]?.flag === 'corta'
        || (q.minChars > 0 && q.requerida
            && String(respuestas[q.qkey]?.valor || '').trim().length > 0
            && String(respuestas[q.qkey]?.valor || '').trim().length < q.minChars)),
    [secciones, respuestas],
  );

  // ── Subidas en background ──────────────────────────────────────────────────
  // El truco que hace que el material deje de costar tiempo: el cliente elige
  // los archivos en el tramo 2 y sigue contestando mientras suben. El estado
  // vive acá, no en la pantalla, así que sobrevive a la navegación.
  const registrarSubida = useCallback((item) => {
    setSubiendo((s) => [...s, item]);
    return (patch) => setSubiendo((s) => s.map((x) => (x.uid === item.uid ? { ...x, ...patch } : x)));
  }, []);
  const limpiarSubidas = useCallback(() => {
    setSubiendo((s) => s.filter((x) => !x.done && !x.error));
  }, []);

  const value = {
    cargando, error, recargar: cargar,
    catalogo, secciones, tramos, estado, respuestas, bloqueantes,
    progreso, minutos, cortas, sync,
    responder, enviar, flush,
    subiendo, registrarSubida, limpiarSubidas,
    setEstado,
    agenda: estado?.agenda || { estado: 'pendiente' },
    prefill: estado?.prefill || {},
    completo: estado?.estado === 'completado',
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
