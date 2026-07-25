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
import { IcoCalendar, IcoCheck, IcoArrowR, IcoChevL, IcoChevR, IcoWarn } from '../../components/icons';
import { Loading, Spinner } from '../../components/ui';
import { TO, F, dsp, btn, btnTexto, label } from '../tokens';
import { useOnboarding } from '../OnboardingProvider';
import { OnbShell, OnbHeader, OnbFooter } from '../components/OnbShell';
import { onb, agendaSlots, agendaReservar } from '../api';

// Guion de la sesión, por si la base todavía no lo tiene cargado. Vive en
// app_settings.onboarding_config.sesion_agenda y se edita sin deploy.
const SESION_FALLBACK = [
  { titulo: 'Resolvemos tus dudas del onboarding',
    texto: 'Repasamos juntos lo que completaste acá. Por eso es fundamental que lo termines antes de la reunión.' },
  { titulo: 'Configuramos tu Meta Business',
    texto: 'Necesitás tener acceso a una página de Facebook y a un Instagram. Si no los tenés, vamos a tener que reagendar.',
    aviso: true },
  { titulo: 'Dejamos definidos los próximos pasos',
    texto: 'Qué hacemos nosotros, qué necesitamos de vos y cuándo sale cada cosa.' },
];

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
        <div className="kxs" style={{ flex: 1, paddingTop: 30, paddingBottom: 30, textAlign: 'center' }}>
          <div style={{
            width: 70, height: 70, borderRadius: '50%', background: TO.greenInk, margin: '0 auto 22px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'kxPop .5s ease',
          }}><IcoCheck size={32} stroke="#fff" sw={2.6} /></div>
          <div style={{ ...dsp(F.h2), lineHeight: 1.2 }}>Tu sesión está reservada</div>
          {f && (
            <div style={{ fontSize: 20, color: TO.ink, marginTop: 14, fontWeight: 800, letterSpacing: '-0.02em' }}>
              {f.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
              {' · '}
              {f.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <div style={{ fontSize: F.sub, color: TO.body, marginTop: 12, lineHeight: 1.55 }}>
            Te mandamos la invitación por mail y por WhatsApp con el link para entrar.
          </div>

          <div style={{ textAlign: 'left', marginTop: 26 }}>
            <GuionSesion items={datos?.sesion} />
          </div>
        </div>
        <OnbFooter>
          <button type="button" onClick={() => navigate(primerTramo ? `/onboarding/${primerTramo.skey}` : '/onboarding')}
            style={btn()}>
            EMPEZAR EL ONBOARDING <IcoArrowR size={18} stroke="#fff" sw={2.4} />
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

      <div className="kxs" style={{ flex: 1, paddingTop: 24, paddingBottom: 30 }}>
        <div style={{ ...label(TO.blue), marginBottom: 10 }}>Primer paso</div>
        <div style={{ ...dsp(F.h1, '-0.032em'), lineHeight: 1.14 }}>
          Reservá el día en que nos vemos
        </div>
        <div style={{ fontSize: F.body, lineHeight: 1.55, color: TO.body, marginTop: 12, textWrap: 'pretty' }}>
          Es una videollamada de una hora.
          <strong style={{ color: TO.ink }}> Elegila primero</strong> y después
          completás el onboarding con tranquilidad: tenés hasta ese día.
        </div>

        {/* Qué se hace en la sesión. Va ARRIBA, antes de elegir el horario, no
            en la confirmación: el punto de Facebook e Instagram es el que hoy
            obliga a reagendar reuniones, y el cliente lo tiene que leer cuando
            todavía está a tiempo de resolverlo. */}
        <GuionSesion items={datos?.sesion} />

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
              marginTop: 28, marginBottom: 14,
            }}>
              <button
                type="button" disabled={mesMinimo} aria-label="Mes anterior"
                onClick={() => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { ...c, m: c.m - 1 }))}
                style={{ ...btnMes, opacity: mesMinimo ? 0.35 : 1 }}
              ><IcoChevL size={20} stroke={TO.body} sw={2.2} /></button>
              <div style={{ fontSize: 19, fontWeight: 800, color: TO.ink, textTransform: 'capitalize', letterSpacing: '-0.02em' }}>
                {nombreMes}
              </div>
              <button
                type="button" aria-label="Mes siguiente"
                onClick={() => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { ...c, m: c.m + 1 }))}
                style={btnMes}
              ><IcoChevR size={20} stroke={TO.body} sw={2.2} /></button>
            </div>

            {cargando ? <Loading label="Buscando horarios…" /> : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
                  {DIAS.map((d) => (
                    <div key={d} style={{
                      textAlign: 'center', fontSize: 13, fontWeight: 800, color: TO.meta,
                      letterSpacing: '0.06em', paddingBottom: 6,
                    }}>{d}</div>
                  ))}
                  {diasDelMes.map((c, i) => {
                    if (!c) return <div key={`v${i}`} />;
                    const activo = sel.dia === c.iso;
                    return (
                      <button
                        key={c.iso} type="button" disabled={!c.libre}
                        aria-label={`${c.dia}${c.libre ? '' : ', sin horarios'}`}
                        onClick={() => setSel({ dia: c.iso, hora: null })}
                        style={{
                          aspectRatio: '1', borderRadius: 14, cursor: c.libre ? 'pointer' : 'default',
                          fontSize: 17, fontWeight: activo || c.libre ? 800 : 500,
                          // Los días libres llevan borde además de fondo: sin él,
                          // el celeste sobre blanco casi no se distingue del vacío.
                          border: c.libre ? `2px solid ${activo ? TO.blueBtn : TO.blueLine}` : '2px solid transparent',
                          background: activo ? TO.blueBtn : c.libre ? TO.blueWash : 'transparent',
                          color: activo ? '#fff' : c.libre ? TO.blue : TO.faint,
                          transition: 'all .15s',
                        }}
                      >{c.dia}</button>
                    );
                  })}
                </div>

                {Object.keys(dias).length === 0 && (
                  <div style={{ fontSize: F.sub, color: TO.body, textAlign: 'center', marginTop: 22, lineHeight: 1.55 }}>
                    No hay horarios libres este mes. Probá con el siguiente.
                  </div>
                )}

                {/* Horas */}
                {sel.dia && (
                  <div style={{ marginTop: 26, animation: 'kxUp .25s ease' }}>
                    <div style={{ ...label(), marginBottom: 11 }}>
                      Horarios disponibles · hora de {tz.split('/').pop().replace(/_/g, ' ')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))', gap: 9 }}>
                      {horas.map((h) => {
                        const activa = sel.hora === h;
                        return (
                          <button
                            key={h} type="button" onClick={() => setSel((s) => ({ ...s, hora: h }))}
                            aria-pressed={activa}
                            style={{
                              height: 56, borderRadius: 14, cursor: 'pointer', fontSize: 17, fontWeight: 800,
                              border: `2px solid ${activa ? TO.blueBtn : TO.lineStrong}`,
                              background: activa ? TO.blueBtn : '#fff',
                              color: activa ? '#fff' : TO.ink,
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
                    marginTop: 24, padding: '16px 18px', borderRadius: 16,
                    background: TO.bg, border: `1px solid ${TO.line}`,
                  }}>
                    <div style={{ ...label(), marginBottom: 9 }}>Antes de la reunión</div>
                    <ul style={{ margin: 0, paddingLeft: 20, fontSize: F.meta, lineHeight: 1.7, color: TO.body }}>
                      {evento.confirm_instructions.map((x, i) => <li key={i}>{x}</li>)}
                    </ul>
                  </div>
                )}

                {errorReserva && (
                  <div style={{
                    marginTop: 18, padding: '14px 16px', borderRadius: 14, background: TO.redWash,
                    border: '1px solid #E8A0A0', fontSize: F.meta, lineHeight: 1.55,
                    color: TO.redInk, fontWeight: 600,
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
            style={{ ...btn(), opacity: !sel.hora || reservando ? 0.5 : 1 }}
          >
            {reservando ? <Spinner size={19} color="#fff" /> : <IcoCalendar size={18} stroke="#fff" sw={2.2} />}
            {reservando ? 'RESERVANDO…' : 'RESERVAR ESTE HORARIO'}
          </button>
          <button type="button" onClick={() => omitir('ya_agende')} style={btnTexto}>
            Ya la agendé por otro lado
          </button>
        </OnbFooter>
      )}
    </OnbShell>
  );
}

/**
 * Qué se hace en la sesión de onboarding.
 *
 * El punto del medio (Facebook e Instagram) es la razón por la que hoy se
 * reagendan reuniones, así que se pinta distinto del resto: si el cliente lee
 * una sola cosa de esta pantalla, tiene que ser esa.
 */
function GuionSesion({ items }) {
  const lista = Array.isArray(items) && items.length ? items : SESION_FALLBACK;
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ ...label(), marginBottom: 12 }}>Qué hacemos en esa reunión</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {lista.map((x, i) => (
          <div key={x.titulo || i} style={{
            display: 'flex', gap: 13, padding: '16px 17px', borderRadius: 16,
            background: x.aviso ? TO.amberWash : '#fff',
            border: `${x.aviso ? 2 : 1}px solid ${x.aviso ? '#E0A96A' : TO.line}`,
          }}>
            <span style={{
              width: 28, height: 28, borderRadius: '50%', flex: 'none', marginTop: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: x.aviso ? TO.amber : TO.blueBtn, color: '#fff',
              fontSize: 14, fontWeight: 800,
            }}>{x.aviso ? '!' : i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 17, fontWeight: 800, lineHeight: 1.3, letterSpacing: '-0.01em',
                color: x.aviso ? TO.amber : TO.ink,
              }}>{x.titulo}</div>
              <div style={{
                fontSize: F.meta, lineHeight: 1.55, marginTop: 5,
                color: x.aviso ? TO.amber : TO.body,
                fontWeight: x.aviso ? 600 : 400,
              }}>{x.texto}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Aviso({ texto, onSeguir }) {
  return (
    <div style={{
      marginTop: 24, padding: '17px 18px', borderRadius: 16,
      background: TO.amberWash, border: '2px solid #E0A96A',
    }}>
      <div style={{ display: 'flex', gap: 11 }}>
        <IcoWarn size={21} stroke={TO.amber} style={{ flex: 'none', marginTop: 2 }} />
        <div style={{ fontSize: F.sub, lineHeight: 1.55, color: TO.amber }}>{texto}</div>
      </div>
      <button type="button" onClick={onSeguir} style={{ ...btn(TO.ink, 52), marginTop: 16 }}>
        SEGUIR CON EL ONBOARDING <IcoArrowR size={17} stroke="#fff" sw={2.4} />
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
  width: 48, height: 48, borderRadius: 14, border: `2px solid ${TO.lineStrong}`,
  background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
};
