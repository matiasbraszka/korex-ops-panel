// ─────────────────────────────────────────────────────────────────────────────
// El arranque del onboarding, en TRES pantallas:
//   1. Bienvenida + video            → "Continuar"
//   2. Roadmap (cómo trabajamos)     → "Continuar"
//   3. Reglas del servicio + acepto  → "Empezar" (deja constancia y entra al form)
//
// El video de bienvenida se muestra solo si está cargado. Si el cliente ya
// arrancó antes, no lo hacemos pasar de nuevo por el gate: va directo.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { T, FUENTE, btn, kicker } from '../tokens';
import { IcoCheck } from '../../components/icons';
import { limpiarHtml } from '../../components/richHtml';
import { useOnboarding } from '../OnboardingProvider';
import OnbShell from '../components/OnbShell';
import Roadmap from '../components/Roadmap';

const CHIPS = ['≈ 45 minutos', 'Se guarda solo', 'Podés volver cuando quieras'];

// Fila de pie con Atrás + acción principal.
function PieGate({ onAtras, etiqueta, activo = true, onSeguir, pista }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {onAtras && (
          <button type="button" onClick={onAtras} style={{
            flex: '0 0 auto', height: 54, padding: '0 20px', borderRadius: 999,
            border: `1px solid ${T.line}`, background: '#fff', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, color: T.muted,
          }}>Atrás</button>
        )}
        <button type="button" onClick={activo ? onSeguir : undefined} disabled={!activo} style={{
          ...btn(activo), flex: 1, height: 54, cursor: activo ? 'pointer' : 'not-allowed',
        }}>
          <span>{etiqueta}</span>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      {pista && <div style={{ textAlign: 'center', fontSize: 12, color: T.faint, marginTop: 12 }}>{pista}</div>}
    </div>
  );
}

export default function BienvenidaScreen() {
  const navigate = useNavigate();
  const {
    lista, progreso, catalogo, cargando, completo,
    reglas, reglasVersion, aceptarReglas, agenda, respuestas,
  } = useOnboarding();
  const [vio, setVio] = useState(false);
  const [acepto, setAcepto] = useState(false);
  const [paso, setPaso] = useState('video');   // video → roadmap → reglas

  const video = catalogo?.videoBienvenida || '';
  const hayReglas = !!String(reglas || '').trim();
  const yaEmpezo = (progreso?.pct || 0) > 0;   // ya pasó el gate antes
  const grabacion = respuestas?.grabacion?.valor || agenda?.grabacion;

  useEffect(() => { if (completo) navigate('/onboarding/listo', { replace: true }); }, [completo, navigate]);
  useEffect(() => { if (yaEmpezo) setAcepto(true); }, [yaEmpezo]);

  // Entra al formulario. La primera vez deja constancia de la aceptación.
  const irAlFormulario = async () => {
    if (hayReglas && acepto && !yaEmpezo) {
      try { await aceptarReglas(reglasVersion); } catch { /* la constancia no bloquea */ }
    }
    const n = lista[0];
    navigate(n ? `/onboarding/${n.paso.skey}` : '/onboarding/avance');
  };

  if (cargando && !catalogo) {
    return <OnbShell mostrarProgreso={false}><div style={{ color: T.muted, fontSize: 15 }}>Abriendo tu onboarding…</div></OnbShell>;
  }

  // ── Pantalla 1: bienvenida + video ─────────────────────────────────────────
  if (paso === 'video') {
    return (
      <OnbShell mostrarProgreso={false}>
        <div style={{ animation: 'mkrise .4s ease both' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, background: T.azulWash,
            color: T.azulTinta, fontSize: 11, fontWeight: 700, letterSpacing: '.12em',
            textTransform: 'uppercase', padding: '7px 13px', borderRadius: 999, marginBottom: 20,
          }}>Bienvenido a Método Korex</div>

          <h1 style={{ fontFamily: FUENTE.display, fontSize: 'clamp(30px,7vw,48px)', fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1.03, margin: '0 0 18px 0' }}>
            En los próximos 45 minutos tu negocio{' '}
            <em style={{ fontStyle: 'normal', color: T.azulMarca }}>empieza a escalar</em>
          </h1>

          <p style={{ fontSize: 'clamp(15px,2.2vw,17px)', lineHeight: 1.6, color: T.soft, margin: '0 0 26px 0' }}>
            Esto no es un formulario más. Cada respuesta que dejes acá se convierte directamente en
            tus anuncios, tu video de ventas y tu embudo.{' '}
            <strong style={{ color: T.ink }}>Cuanto más te abras, más lejos llegamos juntos.</strong>
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 26 }}>
            {CHIPS.map((c) => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: `1px solid ${T.line}`, borderRadius: 999, padding: '9px 15px', fontSize: 12.5, fontWeight: 600, color: T.soft }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.azul }} />
                <span>{c}</span>
              </div>
            ))}
          </div>

          {video && (
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', minHeight: 190, borderRadius: 20, overflow: 'hidden', background: T.dark, marginBottom: 6, boxShadow: '0 12px 32px rgba(10,22,40,.14)' }}>
              {vio ? (
                <iframe src={video} title="Tu bienvenida" allowFullScreen style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
              ) : (
                <button type="button" onClick={() => setVio(true)} style={{ position: 'absolute', inset: 0, width: '100%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                  <span style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 42%, rgba(72,120,255,.26) 0%, rgba(72,120,255,0) 62%)' }} />
                  <span style={{ position: 'relative', width: 'clamp(62px,15vw,82px)', height: 'clamp(62px,15vw,82px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: T.azulMarca, opacity: .28, animation: 'mkpulse 2.4s ease-out infinite' }} />
                    <span style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', background: T.azulMarca, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(72,120,255,.42)' }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" stroke="none" style={{ marginLeft: 4 }}><path d="M8 5v14l11-7z" /></svg>
                    </span>
                  </span>
                  <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 'clamp(14px,4vw,20px)', textAlign: 'left', background: 'linear-gradient(180deg, rgba(13,17,23,0) 0%, rgba(13,17,23,.92) 58%)', fontSize: 'clamp(13px,3vw,15px)', fontWeight: 700, color: '#fff', letterSpacing: '-.01em' }}>Míralo antes de empezar · 90 segundos</span>
                </button>
              )}
            </div>
          )}

          <PieGate
            etiqueta={yaEmpezo ? 'Seguir donde quedé' : 'Continuar'}
            onSeguir={yaEmpezo ? irAlFormulario : () => setPaso('roadmap')}
            pista={yaEmpezo ? '' : 'Primero te mostramos cómo trabajamos y las reglas del servicio.'}
          />
        </div>
      </OnbShell>
    );
  }

  // ── Pantalla 2: roadmap ─────────────────────────────────────────────────────
  if (paso === 'roadmap') {
    return (
      <OnbShell mostrarProgreso={false}>
        <div style={{ animation: 'mkrise .4s ease both' }}>
          <Roadmap grabacion={grabacion} />
          <PieGate
            onAtras={() => setPaso('video')}
            etiqueta="Continuar"
            onSeguir={() => (hayReglas ? setPaso('reglas') : irAlFormulario())}
          />
        </div>
      </OnbShell>
    );
  }

  // ── Pantalla 3: reglas del servicio + aceptar ───────────────────────────────
  return (
    <OnbShell mostrarProgreso={false}>
      <div style={{ animation: 'mkrise .4s ease both' }}>
        <div style={{ ...kicker(T.faint, 11), marginBottom: 6 }}>Antes de empezar</div>
        <h1 style={{ fontFamily: FUENTE.display, fontSize: 'clamp(24px,5vw,34px)', fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 10px 0' }}>
          Reglas del servicio
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.soft, margin: '0 0 20px 0' }}>
          Leé cómo trabajamos juntos. Para arrancar necesitamos que estés de acuerdo.
        </p>

        <div className="kx-rich" style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 16, padding: '18px 20px', marginBottom: 18 }}
          dangerouslySetInnerHTML={{ __html: limpiarHtml(reglas) }} />

        <button type="button" onClick={() => setAcepto((v) => !v)} style={{
          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: 11,
          background: acepto ? T.azulWash2 : '#fff', border: `1.5px solid ${acepto ? T.azul : T.line}`,
          borderRadius: 12, padding: '14px 15px', cursor: 'pointer',
        }}>
          <span style={{
            width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1,
            border: `1.5px solid ${acepto ? T.azul : T.lineFuerte}`, background: acepto ? T.azul : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{acepto && <IcoCheck size={13} stroke="#fff" sw={3} />}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, lineHeight: 1.45 }}>
            Leí y estoy de acuerdo con las Reglas del servicio.
          </span>
        </button>

        <PieGate
          onAtras={() => setPaso('roadmap')}
          etiqueta="Empezar"
          activo={acepto}
          onSeguir={irAlFormulario}
          pista={acepto ? '' : 'Marcá que leíste y estás de acuerdo para empezar.'}
        />
      </div>
    </OnbShell>
  );
}
