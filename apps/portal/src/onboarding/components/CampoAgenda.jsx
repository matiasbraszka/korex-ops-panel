// ─────────────────────────────────────────────────────────────────────────────
// Los dos campos de agenda del onboarding. Se ven igual y funcionan distinto:
//
//   LA SESIÓN (paso 00) reserva de verdad, contra `agenda-publica`. Eso trae
//   gratis el evento de Google Calendar, el link de Zoom, el WhatsApp de
//   confirmación en la zona horaria del cliente, el aviso al equipo y los
//   recordatorios. La regla de las 72 horas de anticipación la aplica el
//   calendario (`min_notice_hours`), así que deja de depender de que alguien la
//   recuerde por WhatsApp.
//
//   LA GRABACIÓN (paso 20) es solo un día, sin horario y sin reserva: el equipo
//   confirma la hora después. Guarda la fecha en el run para que la tarea de
//   seguimiento nazca con esa fecha encima.
//
// El paso 00 NO es un muro. Si el calendario no responde, o si todavía no hay
// disponibilidad cargada, hay salida: se registra el motivo, se avisa al equipo
// y el cliente sigue. Que un fallo de calendario congele todos los onboardings
// no es aceptable.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react';
import { T, FUENTE, kicker } from '../tokens';
import { onb, agendaSlots, agendaReservar } from '../api';
import { useOnboarding } from '../OnboardingProvider';

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const legible = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  const f = new Date(y, m - 1, d);
  return `${DOW[f.getDay()]} ${d} de ${MES[m - 1]}`;
};

function Confirmado({ texto }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, background: T.verdeWash,
      border: `1px solid ${T.verdeLinea}`, borderRadius: 14, padding: '15px 17px',
      marginTop: 14, animation: 'mkpop .25s ease both',
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.verdeTinta}
           strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.verdeTinta }}>{texto}</div>
    </div>
  );
}

function TiraDias({ dias, sel, onElegir }) {
  return (
    <div style={{
      display: 'flex', gap: 9, overflowX: 'auto', paddingBottom: 6, marginBottom: 18,
    }}>
      {dias.map((d) => {
        const activo = sel === d;
        const [y, m, dd] = d.split('-').map(Number);
        const f = new Date(y, m - 1, dd);
        return (
          <button key={d} type="button" onClick={() => onElegir(d)} style={{
            cursor: 'pointer', flex: '0 0 auto', borderRadius: 14, padding: '13px 17px',
            textAlign: 'center', transition: 'all .15s',
            border: `1.5px solid ${activo ? T.azul : T.line}`,
            background: activo ? T.azul : '#fff',
            color: activo ? '#fff' : T.ink,
          }}>
            <div style={{ ...kicker('inherit', 10.5), letterSpacing: '.1em', opacity: .65 }}>
              {DOW[f.getDay()]}
            </div>
            <div style={{
              fontFamily: FUENTE.display, fontSize: 22, fontWeight: 800,
              letterSpacing: '-.03em', margin: '3px 0',
            }}>{dd}</div>
            <div style={{ fontSize: 10.5, fontWeight: 600, opacity: .65 }}>{MES[m - 1]}</div>
          </button>
        );
      })}
    </div>
  );
}

// ── La sesión de onboarding ──────────────────────────────────────────────────

export function CampoSesion({ q, valor, onChange }) {
  const { agenda, setEstado } = useOnboarding();
  const [datos, setDatos] = useState(null);
  const [dias, setDias] = useState({});
  const [cargando, setCargando] = useState(true);
  const [problema, setProblema] = useState(null);     // 'sin_config' | 'error'
  const [sel, setSel] = useState({ dia: null, hora: null });
  const [reservando, setReservando] = useState(false);
  const [error, setError] = useState('');

  const yaEsta = agenda?.estado === 'agendado' || agenda?.estado === 'omitido';

  const traer = useCallback(async (token, y, m) => {
    try {
      const r = await agendaSlots(token, y, m);
      if (r?.configured === false) { setProblema('sin_config'); return; }
      setDias(r?.days || {});
    } catch { setProblema('error'); }
  }, []);

  useEffect(() => {
    if (yaEsta) { setCargando(false); return; }
    let vivo = true;
    onb.agendaDatos()
      .then(async (d) => {
        if (!vivo) return;
        setDatos(d);
        if (!d?.token) { setProblema('sin_config'); return; }
        const hoy = new Date();
        await traer(d.token, hoy.getFullYear(), hoy.getMonth());
        // Si el mes actual no tiene nada (la regla de 72 h se come lo que
        // queda), miramos el siguiente antes de decir que no hay fechas.
        const prox = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
        await traer(d.token, prox.getFullYear(), prox.getMonth());
      })
      .catch(() => setProblema('error'))
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [traer, yaEsta]);

  const omitir = async (motivo) => {
    const r = await onb.agendaOmitir(motivo);
    if (r?.ok !== false) {
      setEstado((e) => (e ? { ...e, agenda: { ...(e.agenda || {}), estado: 'omitido', motivo } } : e));
      onChange('Ya agendada por otro lado', { valorJson: { omitido: motivo }, inmediato: true });
    }
  };

  const reservar = async () => {
    if (!sel.dia || !sel.hora) return;
    setReservando(true); setError('');
    try {
      const r = await agendaReservar({
        token: datos.token, date: sel.dia, time: sel.hora,
        nombre: datos.nombre, email: datos.email, telefono: datos.telefono,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (r?.appointment_id) await onb.agendaRegistrar(r.appointment_id);
      setEstado((e) => (e ? { ...e, agenda: { ...(e.agenda || {}), estado: 'agendado' } } : e));
      onChange(`${legible(sel.dia)} a las ${sel.hora} h`,
        { valorJson: { dia: sel.dia, hora: sel.hora }, inmediato: true });
    } catch (e) {
      const cod = e?.message || '';
      setError(cod.includes('slot_taken')
        ? 'Justo te ganaron ese horario. Elegí otro, por favor.'
        : cod.includes('too_many')
          ? 'Ya tenés varias reuniones reservadas con ese teléfono. Escribinos por WhatsApp y lo resolvemos.'
          : 'No pudimos reservar. Probá de nuevo en un momento.');
    } finally { setReservando(false); }
  };

  const listaDias = Object.keys(dias).filter((d) => (dias[d] || []).length).sort();

  return (
    <div>
      {/* Qué se hace en esa sesión. Va arriba del calendario a propósito: el
          cliente decide si reserva sabiendo para qué es. */}
      {(datos?.sesion?.length > 0) && (
        <div style={{
          background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16,
          padding: 20, marginBottom: 16,
        }}>
          <div style={{ ...kicker(T.faint, 10.5), marginBottom: 12 }}>
            Qué hacemos en esa sesión
          </div>
          {datos.sesion.map((p, i) => (
            <div key={p.titulo} style={{
              display: 'flex', gap: 13, padding: '12px 0',
              borderTop: `1px solid ${T.fill}`,
            }}>
              <div style={{
                width: 24, height: 24, flex: '0 0 24px', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800,
                background: p.aviso ? T.ambarWash : T.azulWash,
                color: p.aviso ? T.ambarTinta : T.azulTinta,
              }}>{p.aviso ? '!' : i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 3 }}>
                  {p.titulo}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: T.muted }}>{p.texto}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {yaEsta ? (
        <Confirmado texto={agenda.estado === 'agendado'
          ? (valor || 'Tu sesión ya está reservada.')
          : 'Anotado: la coordinamos por otro lado.'} />
      ) : cargando ? (
        <div style={{ fontSize: 13.5, color: T.muted, padding: '18px 0' }}>
          Buscando los horarios disponibles…
        </div>
      ) : problema ? (
        <div style={{
          background: T.ambarWash, border: '1px solid #E0C067', borderRadius: 14, padding: 16,
        }}>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: T.ambarTinta }}>
            {problema === 'sin_config'
              ? 'Todavía no hay horarios publicados. Seguí con el onboarding: te escribimos para coordinar la sesión.'
              : 'No pudimos cargar la agenda ahora. Seguí con el onboarding y lo coordinamos por WhatsApp.'}
          </div>
          <button type="button" onClick={() => omitir(problema === 'sin_config' ? 'sin_disponibilidad' : 'calendario_caido')}
            style={{
              marginTop: 12, background: '#fff', border: `1px solid ${T.line}`,
              borderRadius: 999, padding: '10px 16px', fontSize: 12.5, fontWeight: 700,
              color: T.soft, cursor: 'pointer',
            }}>Seguir sin agendar</button>
        </div>
      ) : listaDias.length === 0 ? (
        <div style={{ fontSize: 13.5, color: T.muted }}>
          No hay fechas disponibles en las próximas semanas. Seguí y lo coordinamos por WhatsApp.
        </div>
      ) : (
        <>
          <div style={{ ...kicker(T.faint, 10.5), marginBottom: 10 }}>Elegí el día</div>
          <TiraDias dias={listaDias} sel={sel.dia}
                    onElegir={(d) => setSel({ dia: d, hora: null })} />

          {sel.dia && (
            <>
              <div style={{ ...kicker(T.faint, 10.5), marginBottom: 10 }}>Elegí el horario</div>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 9,
              }}>
                {(dias[sel.dia] || []).map((h) => {
                  const activo = sel.hora === h;
                  return (
                    <button key={h} type="button" onClick={() => setSel((s) => ({ ...s, hora: h }))}
                      style={{
                        cursor: 'pointer', borderRadius: 12, padding: '14px 10px',
                        fontSize: 14, fontWeight: 700, transition: 'all .15s',
                        border: `1.5px solid ${activo ? T.azul : T.line}`,
                        background: activo ? T.azul : '#fff',
                        color: activo ? '#fff' : T.soft,
                      }}>{h}</button>
                  );
                })}
              </div>
            </>
          )}

          {error && (
            <div style={{ fontSize: 13, color: '#B02020', marginTop: 12 }}>{error}</div>
          )}

          {sel.dia && sel.hora && (
            <button type="button" onClick={reservar} disabled={reservando} style={{
              width: '100%', marginTop: 16, height: 52, borderRadius: 999, border: 'none',
              background: T.azul, color: '#fff', fontSize: 13, fontWeight: 800,
              letterSpacing: '.06em', textTransform: 'uppercase', cursor: 'pointer',
              opacity: reservando ? .7 : 1,
            }}>
              {reservando ? 'Reservando…' : `Reservar ${legible(sel.dia)} a las ${sel.hora}`}
            </button>
          )}

          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button type="button" onClick={() => omitir('ya_agende')} style={{
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5,
              fontWeight: 700, color: T.muted, textDecoration: 'underline',
            }}>Ya la agendé por otro lado</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── La fecha de grabación ────────────────────────────────────────────────────

export function CampoGrabacion({ q, valor, onChange }) {
  const { setEstado } = useOnboarding();

  // Los próximos días hábiles, con una antelación mínima: la primera fecha que
  // se ofrece es a `diasMinimos` días desde hoy (por defecto 7, configurable por
  // pregunta desde la administración del onboarding). Grabar un domingo no es
  // realista y ofrecerlo solo hace que el cliente elija una fecha que no cumple.
  const antelacion = Number.isFinite(q?.diasMinimos) ? q.diasMinimos : 7;
  const dias = [];
  const d = new Date();
  d.setDate(d.getDate() + Math.max(0, antelacion - 1)); // el bucle suma 1 antes de empujar la primera
  while (dias.length < 10) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) dias.push(iso(d));
  }

  const elegir = async (dia) => {
    onChange(legible(dia), { valorJson: { dia }, inmediato: true });
    try {
      await onb.grabacion(dia);
      setEstado((e) => (e ? { ...e, agenda: { ...(e.agenda || {}), grabacion: dia } } : e));
    } catch { /* la respuesta ya quedó guardada; la fecha se recupera del texto */ }
  };

  const actual = valor ? dias.find((x) => legible(x) === valor) : null;

  return (
    <div>
      <div style={{ ...kicker(T.faint, 10.5), marginBottom: 10 }}>Elegí el día</div>
      <TiraDias dias={dias} sel={actual} onElegir={elegir} />
      {valor && <Confirmado texto={`Fecha reservada: ${valor}`} />}
      <div style={{ fontSize: 12.5, color: T.muted, marginTop: 12, lineHeight: 1.5 }}>
        Te confirmamos el horario por WhatsApp. Si después te queda mal, se cambia.
      </div>
    </div>
  );
}
