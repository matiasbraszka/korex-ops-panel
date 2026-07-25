// El final.
//
// Celebración adulta: "esto ahora es tuyo", no videojuego. Sin confeti, sin
// sonido. Lo que se celebra no es el esfuerzo sino lo que se abrió — por eso
// los cuatro iconos de la plataforma aparecen uno por uno: el desbloqueo se
// VE, no se anuncia.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { T, display, bigBtn } from '../../components/theme';
import { IcoCheck, IcoHome, IcoDoc, IcoEmbudos, IcoFolder, IcoCalendar } from '../../components/icons';
import { useOnboarding } from '../OnboardingProvider';
import { OnbShell } from '../components/OnbShell';

const TABS = [
  { Ico: IcoHome, label: 'Inicio' },
  { Ico: IcoDoc, label: 'Guiones' },
  { Ico: IcoEmbudos, label: 'Embudos' },
  { Ico: IcoFolder, label: 'Material' },
];

export default function CelebracionScreen() {
  const navigate = useNavigate();
  const { agenda, prefill } = useOnboarding();
  const [n, setN] = useState(0);

  // El 100% contando de verdad: llegar al número es parte del premio.
  useEffect(() => {
    let v = 0;
    const t = setInterval(() => {
      v += 4;
      setN(Math.min(100, v));
      if (v >= 100) clearInterval(t);
    }, 22);
    return () => clearInterval(t);
  }, []);

  const primer = String(prefill?.nombre || '').split(/\s+/)[0];
  const f = agenda?.at ? new Date(agenda.at) : null;

  return (
    <OnbShell indice={false}>
      <div className="kxs" style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        textAlign: 'center', paddingBlock: 40,
      }}>
        <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 26px' }}>
          <div style={{
            position: 'absolute', inset: 4, borderRadius: '50%', background: T.green,
            animation: 'kxRing 2s ease-out infinite',
          }} />
          <div style={{
            position: 'relative', width: 96, height: 96, borderRadius: '50%', background: T.green,
            display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'kxPop .6s ease',
          }}>
            <IcoCheck size={44} stroke="#fff" sw={2.6} />
          </div>
        </div>

        <div style={{
          fontFamily: "'Montserrat', sans-serif", fontSize: 46, fontWeight: 800,
          letterSpacing: '-0.04em', color: T.ink, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>{n}%</div>

        <div style={{ ...display(28, '-0.033em'), lineHeight: 1.15, marginTop: 20, animation: 'kxUp .5s ease' }}>
          {primer ? `Terminaste, ${primer}.` : 'Terminaste.'}
        </div>
        <div style={{
          fontSize: 17, lineHeight: 1.55, color: T.textSoft, marginTop: 10,
          maxWidth: 380, marginInline: 'auto', animation: 'kxUp .6s ease',
        }}>
          Ahora empezamos nosotros. Con lo que nos contaste ya podemos armar tu
          estrategia, tus anuncios y tu video de ventas.
        </div>

        {f && (
          <div style={{
            marginTop: 26, padding: '15px 18px', borderRadius: 18, background: '#fff',
            boxShadow: 'var(--shadow-md)', maxWidth: 380, marginInline: 'auto',
            display: 'flex', alignItems: 'center', gap: 13, textAlign: 'left',
            animation: 'kxUp .7s ease',
          }}>
            <span style={{
              width: 44, height: 44, borderRadius: 15, background: T.primarySoft, flex: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><IcoCalendar size={20} stroke={T.primaryInk} /></span>
            <div>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: T.ink }}>Nos vemos el {
                f.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
              }</div>
              <div style={{ fontSize: 14.5, color: T.text2, marginTop: 2 }}>
                a las {f.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} · te llega el link por mail
              </div>
            </div>
          </div>
        )}

        {/* El desbloqueo, en vivo */}
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 13.5, color: T.text2, marginBottom: 14 }}>
            Se te abrió toda la plataforma
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 22 }}>
            {TABS.map(({ Ico, label }, i) => (
              <div key={label} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                animation: `kxPop .5s ease ${0.3 + i * 0.12}s both`,
              }}>
                <span style={{
                  width: 46, height: 46, borderRadius: 15, background: T.primarySoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Ico size={21} stroke={T.primaryInk} /></span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: T.text2 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 'none', padding: '14px 20px calc(18px + env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={() => navigate('/', { replace: true })} style={bigBtn(T.primary, 54)}>
          ENTRAR A MI ESPACIO
        </button>
      </div>
    </OnbShell>
  );
}
