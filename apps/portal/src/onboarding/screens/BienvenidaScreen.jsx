// ─────────────────────────────────────────────────────────────────────────────
// La primera pantalla. Es donde aterriza el magic link.
//
// No es un formulario que arranca: es la explicación de por qué vale la pena
// completarlo. "Cada respuesta que dejes acá se convierte directamente en tus
// anuncios, tu video de ventas y tu embudo" es la frase que sostiene los 90
// minutos que vienen.
//
// El video de bienvenida se renderiza SOLO si está cargado. Un reproductor que
// no reproduce nada es peor que no tener video.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { T, FUENTE, btn } from '../tokens';
import { useOnboarding } from '../OnboardingProvider';
import OnbShell from '../components/OnbShell';

const CHIPS = ['≈ 45 minutos', 'Se guarda solo', 'Podés volver cuando quieras'];

export default function BienvenidaScreen() {
  const navigate = useNavigate();
  const { lista, progreso, catalogo, cargando, completo } = useOnboarding();
  const [vio, setVio] = useState(false);

  const video = catalogo?.videoBienvenida || '';

  // Si ya terminó, no tiene sentido volver a mostrarle la bienvenida.
  useEffect(() => {
    if (completo) navigate('/onboarding/listo', { replace: true });
  }, [completo, navigate]);

  const arrancar = () => {
    // Al primer nodo sin completar; si está todo, a la portada del primer paso.
    const n = lista[0];
    navigate(n ? `/onboarding/${n.paso.skey}` : '/onboarding/avance');
  };

  if (cargando && !catalogo) {
    return (
      <OnbShell mostrarProgreso={false}>
        <div style={{ color: T.muted, fontSize: 15 }}>Abriendo tu onboarding…</div>
      </OnbShell>
    );
  }

  return (
    <OnbShell mostrarProgreso={false}>
      <div style={{ animation: 'mkrise .4s ease both' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, background: T.azulWash,
          color: T.azulTinta, fontSize: 11, fontWeight: 700, letterSpacing: '.12em',
          textTransform: 'uppercase', padding: '7px 13px', borderRadius: 999, marginBottom: 20,
        }}>Bienvenido a Método Korex</div>

        <h1 style={{
          fontFamily: FUENTE.display, fontSize: 'clamp(30px,7vw,48px)', fontWeight: 800,
          letterSpacing: '-.035em', lineHeight: 1.03, margin: '0 0 18px 0',
        }}>
          En los próximos 45 minutos tu negocio{' '}
          <em style={{ fontStyle: 'normal', color: T.azulMarca }}>empieza a escalar</em>
        </h1>

        <p style={{
          fontSize: 'clamp(15px,2.2vw,17px)', lineHeight: 1.6, color: T.soft, margin: '0 0 26px 0',
        }}>
          Esto no es un formulario más. Cada respuesta que dejes acá se convierte
          directamente en tus anuncios, tu video de ventas y tu embudo.{' '}
          <strong style={{ color: T.ink }}>Cuanto más te abras, más lejos llegamos juntos.</strong>
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginBottom: 26 }}>
          {CHIPS.map((c) => (
            <div key={c} style={{
              display: 'flex', alignItems: 'center', gap: 7, background: '#fff',
              border: `1px solid ${T.line}`, borderRadius: 999, padding: '9px 15px',
              fontSize: 12.5, fontWeight: 600, color: T.soft,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: T.azul }} />
              <span>{c}</span>
            </div>
          ))}
        </div>

        {video && (
          <div style={{
            position: 'relative', width: '100%', aspectRatio: '16/9', minHeight: 190,
            borderRadius: 20, overflow: 'hidden', background: T.dark, marginBottom: 26,
            boxShadow: '0 12px 32px rgba(10,22,40,.14)',
          }}>
            {vio ? (
              <iframe src={video} title="Tu bienvenida" allowFullScreen
                      style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
            ) : (
              <button type="button" onClick={() => setVio(true)} style={{
                position: 'absolute', inset: 0, width: '100%', border: 'none',
                background: 'none', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', padding: 0,
              }}>
                <span style={{
                  position: 'absolute', inset: 0,
                  background: 'radial-gradient(circle at 50% 42%, rgba(72,120,255,.26) 0%, rgba(72,120,255,0) 62%)',
                }} />
                <span style={{
                  position: 'relative', width: 'clamp(62px,15vw,82px)', height: 'clamp(62px,15vw,82px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{
                    position: 'absolute', inset: 0, borderRadius: '50%', background: T.azulMarca,
                    opacity: .28, animation: 'mkpulse 2.4s ease-out infinite',
                  }} />
                  <span style={{
                    position: 'relative', width: '100%', height: '100%', borderRadius: '50%',
                    background: T.azulMarca, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', boxShadow: '0 8px 24px rgba(72,120,255,.42)',
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" stroke="none"
                         style={{ marginLeft: 4 }}>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </span>
                <span style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0,
                  padding: 'clamp(14px,4vw,20px)', textAlign: 'left',
                  background: 'linear-gradient(180deg, rgba(13,17,23,0) 0%, rgba(13,17,23,.92) 58%)',
                  fontSize: 'clamp(13px,3vw,15px)', fontWeight: 700, color: '#fff',
                  letterSpacing: '-.01em',
                }}>Míralo antes de empezar · 90 segundos</span>
              </button>
            )}
          </div>
        )}

        <button type="button" onClick={arrancar} style={{
          ...btn(true), height: 'auto', padding: '19px 24px', fontSize: 14,
          letterSpacing: '.06em', boxShadow: '0 4px 12px rgba(91,124,245,.28)',
        }}>
          <span>{progreso.pct > 0 ? 'Seguir donde quedé' : 'Empezar'}</span>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
          </svg>
        </button>
        <div style={{ textAlign: 'center', fontSize: 12, color: T.faint, marginTop: 13 }}>
          Empezamos reservando tu sesión de onboarding. Dos minutos.
        </div>
      </div>
    </OnbShell>
  );
}
