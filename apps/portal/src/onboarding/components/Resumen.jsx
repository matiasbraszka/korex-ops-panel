// El control de calidad del último paso: qué está cerrado y qué falta, con un
// botón que lleva directo a lo que falta.
//
// No dice "te falta algo": dice qué paso y cuántas preguntas, y te lleva. Un
// pendiente que no se puede encontrar es un pendiente que no se completa.
import { T, kicker } from '../tokens';
import { useOnboarding } from '../OnboardingProvider';
import { statsPaso, pantallasDe } from '../progreso';

export default function Resumen({ onIr }) {
  const { pasos, respuestas, bloqueantes } = useOnboarding();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {pasos.map((p) => {
        const s = statsPaso(p, respuestas, bloqueantes);
        // Un paso sin preguntas visibles no se muestra: si todo su contenido
        // dependía de una condición que no se cumple, no hay nada que revisar.
        if (s.total === 0) return null;
        const ok = s.completo;
        return (
          <div key={p.skey} style={{
            background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14,
            padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 34, height: 34, flex: '0 0 34px', borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: ok ? T.verdeWash : T.ambarWash,
            }}>
              {ok ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.verde}
                     strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={T.ambar}
                     strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                </svg>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-.01em' }}>
                {p.badge} · {p.titulo}
              </div>
              <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                {ok ? 'Completo' : `${s.total - s.hechas} de ${s.total} sin responder`}
              </div>
            </div>
            {!ok && (
              <button type="button" style={{
                flex: '0 0 auto', border: `1px solid ${T.line}`, background: '#fff',
                borderRadius: 999, padding: '8px 14px', fontSize: 12, fontWeight: 700,
                color: T.azulTinta, cursor: 'pointer',
              }} onClick={() => {
                const pant = pantallasDe(p, respuestas)[0];
                onIr(pant ? `/onboarding/${p.skey}/${pant.id}` : `/onboarding/${p.skey}`);
              }}>Completar</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
