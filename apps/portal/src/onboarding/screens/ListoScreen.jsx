// ─────────────────────────────────────────────────────────────────────────────
// El cierre. Es la pantalla que convierte "llené un formulario larguísimo" en
// "arrancó mi proyecto".
//
// La celebración es INFORMACIÓN, no palmadita: en vez de "¡felicitaciones!",
// una lista de lo que acaba de pasar sin que el cliente hiciera nada más, y el
// cronograma de sus próximos 15 días. Un adulto que acaba de trabajar una hora
// y media quiere ver qué compró con ese esfuerzo.
//
// Si el cierre falla —la guarda anti-catástrofe frenó el documento, falta algo—
// NO se muestra la celebración: se muestra qué falta y un botón que lleva ahí.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { T, FUENTE, btn, kicker } from '../tokens';
import { onb } from '../api';
import { useOnboarding } from '../OnboardingProvider';
import OnbShell from '../components/OnbShell';

const HECHO = [
  { t: 'Tu alta quedó registrada', d: 'tu proyecto ya existe en nuestro sistema con tu equipo asignado' },
  { t: 'Tus datos quedaron registrados', d: 'tu contrato sale a firma hoy mismo' },
  { t: 'Tu grabación quedó agendada', d: 'con fecha firme y plan B definido' },
  { t: 'Tu dominio entró en proceso', d: 'la URL de tu funnel se congela hoy' },
  { t: 'Tus claims prohibidos ya son un filtro activo', d: 'ningún anuncio saldrá fuera de norma' },
  { t: 'Si tu empresa exige compliance, el trámite arrancó hoy', d: 'en paralelo, sin frenar nada' },
];

const FASES = [
  { cuando: 'Días 1-3 · ya en marcha', titulo: 'Estrategia y guiones', desc: 'Definimos tus avatares, tu oferta y escribimos tus anuncios y tu VSL.', color: '#5B7CF5' },
  { cuando: 'Días 3-5 · tu parte', titulo: 'Tu grabación', desc: 'El único paso que depende de vos. Ya está agendado. Todo lo demás avanza en paralelo.', color: '#F97316' },
  { cuando: 'Días 1-7 · en paralelo', titulo: 'Construcción de tu embudo', desc: 'Tu landing se monta mientras grabás — no espera a nada.', color: '#8B5CF6' },
  { cuando: 'Días 8-10 · lanzamiento', titulo: 'Salimos a pauta', desc: 'Ensamblamos, probamos todo de punta a punta y encendemos las campañas.', color: '#06B6D4' },
  { cuando: 'Días 10-15 · crecimiento', titulo: 'Optimización y resultados', desc: 'Monitoreamos, ajustamos y te reportamos. Acá empieza lo bueno.', color: '#22C55E' },
];

export default function ListoScreen() {
  const navigate = useNavigate();
  const { estado, agenda, respuestas, recargar, completo, flush } = useOnboarding();
  const [cerrando, setCerrando] = useState(!completo);
  const [faltan, setFaltan] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (completo) { setCerrando(false); return; }
    let vivo = true;
    (async () => {
      await flush();
      try {
        const r = await onb.completar();
        if (!vivo) return;
        if (r?.ok) { await recargar(); }
        else if (r?.error === 'faltan') setFaltan(r.faltan || []);
        else setError('No pudimos cerrar el onboarding. Escribinos y lo resolvemos en el momento.');
      } catch {
        if (vivo) setError('No pudimos cerrar el onboarding. Probá de nuevo en un momento.');
      } finally {
        if (vivo) setCerrando(false);
      }
    })();
    return () => { vivo = false; };
    // Solo al montar: cerrar es una acción única.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cerrando) {
    return (
      <OnbShell mostrarProgreso={false}>
        <div style={{ padding: '40px 0', textAlign: 'center', color: T.muted, fontSize: 15 }}>
          Guardando todo y armando tu proyecto…
        </div>
      </OnbShell>
    );
  }

  // ── Falta algo ─────────────────────────────────────────────────────────────
  if (faltan?.length) {
    return (
      <OnbShell contador="Casi">
        <h1 style={{
          fontFamily: FUENTE.display, fontSize: 'clamp(24px,5vw,34px)', fontWeight: 800,
          letterSpacing: '-.03em', margin: '0 0 10px 0',
        }}>Nos falta poco</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.muted, margin: '0 0 22px 0' }}>
          Quedaron {faltan.length} {faltan.length === 1 ? 'respuesta' : 'respuestas'} sin completar.
          Tocá cualquiera y te llevamos ahí.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {faltan.map((f) => (
            <button key={f.qkey} type="button"
              onClick={() => navigate(`/onboarding/${f.skey}/${f.qkey}`)}
              style={{
                textAlign: 'left', background: '#fff', border: `1px solid ${T.line}`,
                borderRadius: 12, padding: '13px 15px', cursor: 'pointer',
              }}>
              <div style={{ ...kicker(T.faint, 10.5), marginBottom: 4 }}>{f.seccion}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{f.label}</div>
            </button>
          ))}
        </div>
      </OnbShell>
    );
  }

  if (error) {
    return (
      <OnbShell contador="Un momento">
        <div style={{
          background: T.ambarWash, border: '1px solid #E0C067', borderRadius: 16, padding: 20,
        }}>
          <div style={{ fontSize: 15, lineHeight: 1.6, color: T.ambarTinta }}>{error}</div>
          <div style={{ fontSize: 13.5, color: T.muted, marginTop: 10 }}>
            Tus respuestas están guardadas. No perdiste nada.
          </div>
        </div>
      </OnbShell>
    );
  }

  // ── Celebración ────────────────────────────────────────────────────────────
  const sesion = respuestas.sesion?.valor;
  const grabacion = respuestas.grabacion?.valor || agenda?.grabacion;

  return (
    <OnbShell mostrarProgreso={false}>
      <div style={{ animation: 'mkrise .4s ease both' }}>
        <div style={{ textAlign: 'center', marginBottom: 34 }}>
          <div style={{ position: 'relative', width: 104, height: 104, margin: '0 auto 24px auto' }}>
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%', background: T.verde,
              opacity: .16, animation: 'mkpulse 2.2s ease-out infinite',
            }} />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%', background: T.verde,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'mkpop .5s cubic-bezier(.4,0,.2,1) both',
            }}>
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#fff"
                   strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
          </div>
          <div style={{ ...kicker(T.verdeTinta, 11), letterSpacing: '.14em', marginBottom: 14 }}>
            Onboarding completado
          </div>
          <h1 style={{
            fontFamily: FUENTE.display, fontSize: 'clamp(28px,6.5vw,44px)', fontWeight: 800,
            letterSpacing: '-.035em', lineHeight: 1.05, margin: '0 auto 14px auto', maxWidth: 560,
          }}>
            Tu reloj de 15 días{' '}
            <em style={{ fontStyle: 'normal', color: T.azulMarca }}>empieza a correr</em>
          </h1>
          <p style={{
            fontSize: 16, lineHeight: 1.6, color: T.soft, margin: '0 auto', maxWidth: 470,
          }}>
            Ya tenemos lo que necesitamos para arrancar. Mientras seguís con lo tuyo,
            esto ya se puso en marcha.
          </p>
        </div>

        <div style={{ ...kicker(T.faint, 11), marginBottom: 13 }}>
          Lo que acaba de pasar, sin que hicieras nada más
        </div>
        <div style={{
          background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16,
          overflow: 'hidden', marginBottom: 30,
        }}>
          {HECHO.map((d) => (
            <div key={d.t} style={{
              display: 'flex', alignItems: 'flex-start', gap: 13, padding: '14px 18px',
              borderBottom: `1px solid ${T.fill}`,
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.verde}
                   strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                   style={{ flex: '0 0 17px', marginTop: 2 }}>
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-.01em' }}>{d.t}</span>
                <span style={{ fontSize: 13, color: T.muted }}> — {d.d}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ ...kicker(T.faint, 11), marginBottom: 13 }}>Así serán tus próximos 15 días</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 30 }}>
          {FASES.map((f) => (
            <div key={f.titulo} style={{
              background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14,
              padding: '17px 19px', borderLeft: `4px solid ${f.color}`,
            }}>
              <div style={{ ...kicker(f.color, 10.5), letterSpacing: '.1em', fontWeight: 800, marginBottom: 6 }}>
                {f.cuando}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.015em', marginBottom: 4 }}>
                {f.titulo}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: T.muted }}>{f.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ background: T.dark, borderRadius: 18, padding: 24, marginBottom: 26 }}>
          <div style={{ ...kicker(T.azulClaro, 11), marginBottom: 8 }}>Lo próximo</div>
          <div style={{
            fontFamily: FUENTE.display, fontSize: 'clamp(19px,3.4vw,25px)', fontWeight: 700,
            color: '#fff', letterSpacing: '-.025em', lineHeight: 1.25, marginBottom: 12,
          }}>
            {sesion ? `Tu sesión de onboarding: ${sesion}.` : 'Tu sesión de onboarding ya está reservada.'}
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: T.faint }}>
            {grabacion
              ? `Tu grabación quedó firme para el ${grabacion}. Necesitás una hora y un lugar con buena luz — el resto lo hacemos nosotros.`
              : 'Tu grabación quedó agendada. Necesitás una hora y un lugar con buena luz — el resto lo hacemos nosotros.'}
          </div>
        </div>

        <button type="button" onClick={() => navigate('/', { replace: true })}
                style={{ ...btn(true), height: 'auto', padding: '18px 24px' }}>
          Entrar a mi plataforma
        </button>
        <div style={{ textAlign: 'center', fontSize: 12.5, color: T.faint, marginTop: 13 }}>
          Tu panel completo ya está abierto: guiones, embudos y el avance del proyecto.
        </div>
      </div>
    </OnbShell>
  );
}
