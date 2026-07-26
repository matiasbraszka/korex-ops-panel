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
import { calcularProgreso, minutosRestantes, nodos, statsBloque } from './progreso';

const Ctx = createContext(null);
export const useOnboarding = () => useContext(Ctx);

const COLA_KEY = 'korex_onb_cola';
const CAT_KEY = 'korex_onb_catalogo_v2';
const DEBOUNCE_MS = 900;

function leerCola() {
  try { return JSON.parse(localStorage.getItem(COLA_KEY) || '{}'); } catch { return {}; }
}
function escribirCola(c) {
  try { localStorage.setItem(COLA_KEY, JSON.stringify(c)); } catch { /* modo incógnito lleno */ }
}

// El catálogo (4 bloques + 23 pasos + 125 preguntas con sus ejemplos) es el
// mismo para todos los clientes y cambia solo cuando el equipo lo edita desde
// el constructor. Cachearlo hace que la primera pantalla pinte al instante;
// sin esto, navegar rápido llegaba a dejar al navegador sin conexiones libres.
function leerCatalogo() {
  try { return JSON.parse(localStorage.getItem(CAT_KEY) || 'null'); } catch { return null; }
}
function escribirCatalogo(c) {
  try { localStorage.setItem(CAT_KEY, JSON.stringify(c)); } catch { /* nada */ }
}

export function OnboardingProvider({ children }) {
  const [catalogo, setCatalogo] = useState(leerCatalogo);
  const [estado, setEstado] = useState(null);
  const [respuestas, setRespuestas] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // 'guardado' | 'guardando' | 'pendiente'  → el indicador del header
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
      if (cat) { setCatalogo(cat); escribirCatalogo(cat); }
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
    const alCerrar = () => {
      Object.values(timers.current).forEach(clearTimeout);
      timers.current = {};
      const cola = leerCola();
      if (!Object.keys(cola).length) return;
      navigator.sendBeacon?.('/noop');
    };
    window.addEventListener('pagehide', alCerrar);
    return () => window.removeEventListener('pagehide', alCerrar);
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
    } catch {
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
        ...(opts.valorJson !== undefined ? { valorJson: opts.valorJson } : {}),
        ...(opts.flag !== undefined ? { flag: opts.flag } : {}) },
    }));
    setSync('guardando');
    clearTimeout(timers.current[qkey]);
    timers.current[qkey] = setTimeout(() => enviar(qkey, valor, opts), opts.inmediato ? 0 : DEBOUNCE_MS);
  }, [enviar]);

  /** Fuerza el guardado de todo lo que esté esperando (al navegar). */
  const flush = useCallback(async () => {
    Object.keys(timers.current).forEach((k) => clearTimeout(timers.current[k]));
    timers.current = {};
    await vaciarCola();
  }, [vaciarCola]);

  // ── Derivados ──────────────────────────────────────────────────────────────
  const pasos = useMemo(() => catalogo?.pasos || [], [catalogo]);
  const bloques = useMemo(() => catalogo?.bloques || [], [catalogo]);
  const bloqueantes = estado?.bloqueantes || [];

  const progreso = useMemo(
    () => calcularProgreso(pasos, respuestas, bloqueantes),
    [pasos, respuestas, bloqueantes],
  );

  const minutos = useMemo(
    () => minutosRestantes(pasos, respuestas, bloqueantes),
    [pasos, respuestas, bloqueantes],
  );

  // La lista lineal por la que avanza el cliente. Se recalcula con cada
  // respuesta porque una condición puede hacer aparecer o desaparecer una
  // pantalla entera (elegir "ambas" agrega el paso 06).
  const lista = useMemo(() => nodos(pasos, respuestas), [pasos, respuestas]);

  // Bloques con su avance: es lo que pinta la barra lateral y lo que decide
  // qué pestañas del portal se abren.
  const bloquesConAvance = useMemo(
    () => bloques.map((b) => ({ ...b, ...statsBloque(b.bkey, pasos, respuestas, bloqueantes) })),
    [bloques, pasos, respuestas, bloqueantes],
  );

  // ── Subidas en background ──────────────────────────────────────────────────
  // El truco que hace que el material deje de costar tiempo: el cliente elige
  // los archivos y sigue contestando mientras suben. El estado vive acá, no en
  // la pantalla, así que sobrevive a la navegación.
  const registrarSubida = useCallback((item) => {
    setSubiendo((s) => [...s, item]);
    return (patch) => setSubiendo((s) => s.map((x) => (x.uid === item.uid ? { ...x, ...patch } : x)));
  }, []);
  const limpiarSubidas = useCallback(() => {
    setSubiendo((s) => s.filter((x) => !x.done && !x.error));
  }, []);

  const value = {
    cargando, error, recargar: cargar,
    catalogo, pasos, bloques: bloquesConAvance, lista,
    estado, respuestas, bloqueantes,
    progreso, minutos, sync,
    responder, enviar, flush,
    subiendo, registrarSubida, limpiarSubidas,
    setEstado,
    agenda: estado?.agenda || { estado: 'pendiente' },
    prefill: estado?.prefill || {},
    completo: estado?.completo === true || estado?.estado === 'completado',
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
