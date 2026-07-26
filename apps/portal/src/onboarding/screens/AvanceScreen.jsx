// El índice: los 23 pasos con su estado, para entrar a cualquiera.
//
// Existe porque el onboarding es largo y el cliente vuelve varias veces. Sin
// esto, retomar significa acordarse por dónde iba; con esto, lo ve.
import { useNavigate } from 'react-router-dom';
import { T, FUENTE, btn } from '../tokens';
import { useOnboarding } from '../OnboardingProvider';
import OnbShell from '../components/OnbShell';
import { statsPaso, pantallasDe } from '../progreso';

export default function AvanceScreen() {
  const navigate = useNavigate();
  const { pasos, respuestas, bloqueantes, progreso, lista, flush } = useOnboarding();

  const ir = async (destino) => { await flush(); navigate(destino); };

  const seguir = () => {
    // El primer paso que no esté completo; si están todos, el control final.
    const pendiente = pasos.find((p) => !statsPaso(p, respuestas, bloqueantes).completo);
    const objetivo = pendiente || pasos[pasos.length - 1];
    if (!objetivo) return ir('/onboarding');
    const pant = pantallasDe(objetivo, respuestas)[0];
    return ir(pant ? `/onboarding/${objetivo.skey}/${pant.id}` : `/onboarding/${objetivo.skey}`);
  };

  return (
    <OnbShell contador="Tu avance">
      <div style={{ animation: 'mkrise .35s ease both' }}>
        <h1 style={{
          fontFamily: FUENTE.display, fontSize: 'clamp(24px,5vw,34px)', fontWeight: 800,
          letterSpacing: '-.03em', margin: '0 0 8px 0',
        }}>Tu avance</h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: T.muted, margin: '0 0 26px 0' }}>
          {progreso.pct === 100
            ? 'Está todo respondido. Podés finalizar el onboarding.'
            : `Vas ${progreso.pct}% y todo quedó guardado. Entrá al paso que quieras.`}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 26 }}>
          {pasos.map((p) => {
            const s = statsPaso(p, respuestas, bloqueantes);
            if (s.total === 0) return null;
            const enCurso = s.hechas > 0 && !s.completo;
            return (
              <button key={p.skey} type="button" onClick={() => {
                const pant = pantallasDe(p, respuestas)[0];
                ir(pant ? `/onboarding/${p.skey}/${pant.id}` : `/onboarding/${p.skey}`);
              }} style={{
                textAlign: 'left', width: '100%', background: '#fff',
                border: `1px solid ${T.line}`, borderRadius: 14, padding: '14px 16px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 13,
                transition: 'transform .15s, border-color .15s',
              }}>
                <div style={{
                  width: 30, height: 30, flex: '0 0 30px', borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11.5, fontWeight: 800,
                  background: s.completo ? T.verdeWash : enCurso ? T.azulWash : T.fill,
                  color: s.completo ? T.verdeTinta : enCurso ? T.azulTinta : T.muted,
                }}>{s.completo ? '✓' : p.badge}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em' }}>
                    {p.titulo}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.faint, marginTop: 3 }}>
                    {s.completo ? 'Completo'
                      : enCurso ? `${s.hechas} de ${s.total} respondidas`
                      : `${s.total} ${s.total === 1 ? 'pregunta' : 'preguntas'}`}
                  </div>
                </div>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.lineFuerte}
                     strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            );
          })}
        </div>

        <button type="button" onClick={seguir} style={{ ...btn(true), height: 'auto', padding: '17px 24px' }}>
          {progreso.pct === 100 ? 'Ir al control final' : 'Seguir donde quedé'}
        </button>
      </div>
    </OnbShell>
  );
}
