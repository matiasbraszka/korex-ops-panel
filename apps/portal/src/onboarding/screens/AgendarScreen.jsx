// ─────────────────────────────────────────────────────────────────────────────
// Paso 0: reservar la sesión de onboarding.
//
// Usa el SISTEMA DE AGENDA DE KOREX (edge function `agenda-publica` +
// booking_calendars + appointments). No se reimplementa nada: esa función ya
// cruza la disponibilidad de cada consultor con el free/busy real de Google,
// crea el evento en Calendar, saca el link de Zoom, le manda el WhatsApp de
// confirmación al cliente en SU zona horaria y al equipo en hora de España, y
// programa los recordatorios.
//
// Lo que sí es propio es la pantalla: la página pública /agendar está pensada
// para un lead frío y pide nombre, email, teléfono y país. Acá el cliente ya
// está logueado y el sistema tiene todos sus datos, así que solo elige día y
// hora. Volver a pedírselos contradiría el tramo "confirmá, no repreguntes".
//
// El calendario NO es un muro: si el sistema no responde, o si todavía no
// cargaron la disponibilidad del equipo, el cliente puede seguir igual. Que un
// problema de calendario congele todos los onboardings no es aceptable.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { T, display, bigBtn, microLabel } from '../../components/theme';
import { IcoCalendar, IcoCheck, IcoArrowR, IcoChevL, IcoChevR, IcoWarn } from '../../components/icons';
import { Loading, Spinner } from '../../components/ui';
import { useOnboarding } from '../OnboardingProvider';
import { OnbShell, OnbHeader, OnbFooter } from '../components/OnbShell';
import { onb, agendaSlots, agendaReservar } from '../api';

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const hoy = () => new Date();
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export default function AgendarScreen() {
  const navigate = useNavigate();
  const { agenda, tramos, setEstado, flush } = useOnboarding();

  const [datos, setDatos] = useState(null);
  const [cursor, setCursor] = useState(() => ({ y: hoy().getFullYear(), m: hoy().getMonth() }));
  const [dias, setDias] = useState({});
  const [evento, setEvento] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [problema, setProblema] = useState(null);      // 'sin_config' | 'error'
  const [sel, setSel] = useState({ dia: null, hora: null });
  const [reservando, setReservando] = useState(false);
  const [errorReserva, setErrorReserva] = useState('');

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const primerTramo = tramos[0];

  // ── Carga ──────────────────────────────────────────────────────────────────
  const cargarSlots = useCallback(async (token, y, m) => {
    setCargando(true); setProblema(null);
    try {
      const r = await agendaSlots(token, y, m);
      if (!r?.ok) throw new Error(r?.error || 'slots');
      setDias(r.days || {});
      setEvento(r.event || null);
      // configured:false = el calendario existe pero algún consultor no tiene
      // horarios cargados. No es culpa del cliente y no puede frenarlo.
      if (r.configured === false) setProblema('sin_config');
    } catch {
      setProblema('error');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    onb.agendaDatos()
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        if (!d?.token) { setProblema('sin_config'); setCargando(false); return; }
        cargarSlots(d.token, cursor.y, cursor.m);
      })
      .catch(() => { if (vivo) { setProblema('error'); setCargando(false); } });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (datos?.token) cargarSlots(datos.token, cursor.y, cursor.m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor.y, cursor.m]);

  // ── Acciones ───────────────────────────────────────────────────────────────
  const reservar = async () => {
    if (!sel.dia || !sel.hora) return;
    setReservando(true); setErrorReserva('');
    try {
      const r = await agendaReservar({
        token: datos.token, date: sel.dia, time: sel.hora,
        nombre: datos.nombre, email: datos.email, telefono: datos.telefono, tz,
      });
      await onb.agendaRegistrar(r.appointment_id);
      setEstado((e) => (e ? {
        ...e,
        agenda: { estado: 'agendado', at: r?.event?.start_at || null },
      } : e));
      await flush();
      navigate(primerTramo ? `/onboarding/${primerTramo.skey}` : '/onboarding');
    } catch (e) {
      const m = String(e?.message || '');
      setErrorReserva(
        m.includes('slot_taken') ? 'Justo te ganaron ese horario. Elegí otro, hay más disponibles.'
          : m.includes('too_many') ? 'Ya tenés varias reuniones agendadas con nosotros. Escribinos por WhatsApp y lo resolvemos.'
          : 'No pudimos reservar el horario. Probá con otro, o seguí y lo agendamos nosotros.',
      );
    } finally {
      setReservando(false);
    }
  };

  const omitir = async (motivo) => {
    await onb.agendaOmitir(motivo).catch(() => {});
    setEstado((e) => (e ? { ...e, agenda: { estado: 'omitido' } } : e));
    await flush();
    navigate(primerTramo ? `/onboarding/${primerTramo.skey}` : '/onboarding');
  };

  // ── Ya agendado ────────────────────────────────────────────────────────────
  if (agenda?.estado === 'agendado') {
    const f = agenda.at ? new Date(agenda.at) : null;
    return (
      <OnbShell>
        <OnbHeader titulo="Tu sesión" ocultarProgreso onVolver={() => navigate('/onboarding')} />
        <div className="kxs" style={{
          flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center',
        }}>
          <div style={{
            width: 66, height: 66, borderRadius: '50%', background: T.green, margin: '0 auto 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'kxPop .5s ease',
          }}><IcoCheck size={30} stroke="#fff" sw={2.6} /></div>
          <div style={{ ...display(26, '-0.03em'), lineHeight: 1.2 }}>Tu sesión está reservada</div>
          {f && (
            <div style={{ fontSize: 18, color: T.textSoft, marginTop: 12, fontWeight: 600 }}>
              {f.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
              {' · '}
              {f.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <div style={{ fontSize: 15, color: T.text2, marginTop: 10, lineHeight: 1.55 }}>
            Te mandamos la invitación por mail y por WhatsApp con el link para entrar.
          </div>
        </div>
        <OnbFooter>
          <button type="button" onClick={() => navigate(primerTramo ? `/onboarding/${primerTramo.skey}` : '/onboarding')}
            style={bigBtn(T.primary, 52)}>
            EMPEZAR EL ONBOARDING <IcoArrowR size={17} stroke="#fff" />
          </button>
        </OnbFooter>
      </OnbShell>
    );
  }

  // ── Selector ───────────────────────────────────────────────────────────────
  const diasDelMes = construirGrilla(cursor.y, cursor.m, dias);
  const horas = sel.dia ? (dias[sel.dia] || []) : [];
  const nombreMes = `${MESES[cursor.m]} ${cursor.y}`;
  const mesMinimo = cursor.y === hoy().getFullYear() && cursor.m === hoy().getMonth();

  return (
    <OnbShell indice={false}>
      <OnbHeader titulo="Agendá tu sesión" ocultarProgreso onVolver={() => navigate('/onboarding')} />

      <div className="kxs" style={{ flex: 1, paddingTop: 22, paddingBottom: 28 }}>
        <div style={{ ...microLabel(T.primaryInk), marginBottom: 10 }}>Primer paso</div>
        <div style={{ ...display(27, '-0.032em'), lineHeight: 1.15 }}>
          Reservá el día en que nos vemos
        </div>
        <div style={{ fontSize: 16, lineHeight: 1.55, color: T.text2, marginTop: 11, textWrap: 'pretty' }}>
          Es una videollamada de una hora donde repasamos todo lo que vas a completar
          acá y dejamos listo el acceso a tu Facebook e Instagram.
          <strong style={{ color: T.textSoft }}> Elegila primero</strong> y después
          completás con tranquilidad: tenés hasta ese día.
        </div>

        {problema === 'sin_config' && (
          <Aviso
            texto="Todavía no tenemos horarios publicados. Seguí con el onboarding tranquilo: nosotros te escribimos para coordinar la sesión."
            onSeguir={() => omitir('sin_disponibilidad')}
          />
        )}
        {problema === 'error' && (
          <Aviso
            texto="No pudimos cargar el calendario en este momento. Podés seguir con el onboarding y lo agendamos nosotros."
            onSeguir={() => omitir('calendario_caido')}
          />
        )}

        {!problema && (
          <>
            {/* Mes */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 26, marginBottom: 12,
            }}>
              <button
                type="button" disabled={mesMinimo} aria-label="Mes anterior"
                onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { ...c, m: c.m - 1 }))}
                style={{ ...btnMes, opacity: mesMinimo ? 0.3 : 1 }}
              ><IcoChevL size={18} stroke={T.text2} /></button>
              <div style={{ fontSize: 16.5, fontWeight: 700, color: T.ink, textTransform: 'capitalize' }}>
                {nombreMes}
              </div>
              <button
                type="button" aria-label="Mes siguiente"
                onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { ...c, m: c.m + 1 }))}
                style={btnMes}
              ><IcoChevR size={18} stroke={T.text2} /></button>
            </div>

            {cargando ? <Loading label="Buscando horarios…" /> : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
                  {DIAS.map((d) => (
                    <div key={d} style={{
                      textAlign: 'center', fontSize: 11.5, fontWeight: 800, color: T.text3,
                      letterSpacing: '0.06em', paddingBottom: 5,
                    }}>{d}</div>
                  ))}
                  {diasDelMes.map((c, i) => {
                    if (!c) return <div key={`v${i}`} />;
                    const activo = sel.dia === c.iso;
                    return (
                      <button
                        key={c.iso} type="button" disabled={!c.libre}
                        onClick={() => setSel({ dia: c.iso, hora: null })}
                        style={{
                          aspectRatio: '1', border: 'none', borderRadius: 13, cursor: c.libre ? 'pointer' : 'default',
                          fontSize: 15.5, fontWeight: activo ? 800 : c.libre ? 700 : 400,
                          background: activo ? T.primary : c.libre ? T.primarySoft : 'transparent',
                          color: activo ? '#fff' : c.libre ? T.primaryInk : T.text3,
                          opacity: c.libre ? 1 : 0.45, transition: 'all .15s',
                        }}
                      >{c.dia}</button>
                    );
                  })}
                </div>

                {Object.keys(dias).length === 0 && (
                  <div style={{ fontSize: 14.5, color: T.text2, textAlign: 'center', marginTop: 20, lineHeight: 1.55 }}>
                    No hay horarios libres este mes. Probá con el siguiente.
                  </div>
                )}

                {/* Horas */}
                {sel.dia && (
                  <div style={{ marginTop: 24, animation: 'kxUp .25s ease' }}>
                    <div style={{ ...microLabel(), marginBottom: 10 }}>
                      Horarios disponibles · hora de {tz.split('/').pop().replace(/_/g, ' ')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(88px,1fr))', gap: 8 }}>
                      {horas.map((h) => {
                        const activa = sel.hora === h;
                        return (
                          <button
                            key={h} type="button" onClick={() => setSel((s) => ({ ...s, hora: h }))}
                            style={{
                              height: 48, borderRadius: 13, cursor: 'pointer', fontSize: 15.5, fontWeight: 700,
                              border: `1.5px solid ${activa ? T.primary : T.border}`,
                              background: activa ? T.primary : '#fff',
                              color: activa ? '#fff' : T.text,
                              fontVariantNumeric: 'tabular-nums', transition: 'all .15s',
                            }}
                          >{h}</button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {evento?.confirm_instructions?.length > 0 && sel.hora && (
                  <div style={{
                    marginTop: 22, padding: '15px 17px', borderRadius: 16,
                    background: T.primaryWash, border: '1px solid #E3E9FB',
                  }}>
                    <div style={{ ...microLabel(T.primaryInk), marginBottom: 8 }}>Cómo es la sesión</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14.5, lineHeight: 1.65, color: T.textSoft }}>
                      {evento.confirm_instructions.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  </div>
                )}

                {errorReserva && (
                  <div style={{
                    marginTop: 16, padding: '12px 14px', borderRadius: 13, background: T.redSoft,
                    fontSize: 14.5, lineHeight: 1.55, color: '#991B1B',
                  }}>{errorReserva}</div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {!problema && (
        <OnbFooter>
          <button
            type="button" onClick={reservar} disabled={!sel.hora || reservando}
            style={{ ...bigBtn(T.primary, 52), opacity: !sel.hora || reservando ? 0.45 : 1 }}
          >
            {reservando ? <Spinner size={18} color="#fff" /> : <IcoCalendar size={17} stroke="#fff" />}
            {reservando ? 'RESERVANDO…' : 'RESERVAR ESTE HORARIO'}
          </button>
          <button type="button" onClick={() => omitir('ya_agende')} style={{
            display: 'block', width: '100%', marginTop: 12, background: 'none', border: 'none',
            padding: '6px 0', cursor: 'pointer', fontSize: 14.5, color: T.text2,
          }}>
            Ya la agendé por otro lado
          </button>
        </OnbFooter>
      )}
    </OnbShell>
  );
}

function Aviso({ texto, onSeguir }) {
  return (
    <div style={{
      marginTop: 22, padding: '16px 17px', borderRadius: 16,
      background: T.amberSoft, border: '1px solid #FDE68A',
    }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <IcoWarn size={19} stroke={T.orange} style={{ flex: 'none', marginTop: 1 }} />
        <div style={{ fontSize: 14.5, lineHeight: 1.55, color: '#92400E' }}>{texto}</div>
      </div>
      <button type="button" onClick={onSeguir} style={{ ...bigBtn(T.ink, 48), marginTop: 15 }}>
        SEGUIR CON EL ONBOARDING <IcoArrowR size={16} stroke="#fff" />
      </button>
    </div>
  );
}

/** Grilla del mes con lunes primero, marcando qué días tienen horarios. */
function construirGrilla(y, m, dias) {
  const primero = new Date(y, m, 1);
  const offset = (primero.getDay() + 6) % 7;      // 0 = lunes
  const total = new Date(y, m + 1, 0).getDate();
  const celdas = Array(offset).fill(null);
  for (let d = 1; d <= total; d += 1) {
    const k = iso(y, m, d);
    celdas.push({ dia: d, iso: k, libre: (dias[k] || []).length > 0 });
  }
  return celdas;
}

const btnMes = {
  width: 40, height: 40, borderRadius: 12, border: '1px solid var(--mk-border)',
  background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};
