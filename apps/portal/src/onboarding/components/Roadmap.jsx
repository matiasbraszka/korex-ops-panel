// El "roadmap" de los próximos 15 días. Un timeline vertical: nodos numerados
// unidos por una línea, y a la derecha la tarjeta de cada fase. Cuando el
// cliente ya reservó su sesión / eligió su día de grabación, esas fechas reales
// aparecen encima de la fase que corresponde.
//
// Se usa en dos lados: en la bienvenida (variant="preview", para que vea el
// plan al entrar) y al cerrar el onboarding (variant="cierre").
import { T, FUENTE, kicker } from '../tokens';
import { IcoCalendar } from '../../components/icons';

// Las 5 fases del plan. `tuParte` marca la única que depende del cliente.
export const FASES = [
  { n: 1, cuando: 'Días 1-3 · ya en marcha', titulo: 'Estrategia y guiones', desc: 'Definimos tus avatares, tu oferta y escribimos tus anuncios y tu VSL.', color: '#5B7CF5' },
  { n: 2, cuando: 'Días 3-5 · tu parte', titulo: 'Tu grabación', desc: 'El único paso que depende de vos. Ya está agendado. Todo lo demás avanza en paralelo.', color: '#F97316', tuParte: true },
  { n: 3, cuando: 'Días 1-7 · en paralelo', titulo: 'Construcción de tu embudo', desc: 'Tu landing se monta mientras grabás — no espera a nada.', color: '#8B5CF6' },
  { n: 4, cuando: 'Días 8-10 · lanzamiento', titulo: 'Salimos a pauta', desc: 'Ensamblamos, probamos todo de punta a punta y encendemos las campañas.', color: '#06B6D4' },
  { n: 5, cuando: 'Días 10-15 · crecimiento', titulo: 'Optimización y resultados', desc: 'Monitoreamos, ajustamos y te reportamos. Acá empieza lo bueno.', color: '#22C55E' },
];

function PillFecha({ texto }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
      background: T.dark, color: '#fff', borderRadius: 999, padding: '5px 11px',
      fontSize: 12, fontWeight: 700, letterSpacing: '-.01em',
    }}>
      <IcoCalendar size={12} stroke="#fff" sw={2.2} /> {texto}
    </span>
  );
}

export default function Roadmap({ variant = 'preview', grabacion, sesion, heading }) {
  const titulo = heading || (variant === 'cierre' ? 'Así serán tus próximos 15 días' : 'Tu plan de los próximos 15 días');

  return (
    <div>
      <div style={{ ...kicker(T.faint, 11), marginBottom: 4 }}>El roadmap de tu proyecto</div>
      <h2 style={{ fontFamily: FUENTE.display, fontSize: 'clamp(19px,4vw,24px)', fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 18px 0' }}>
        {titulo}
      </h2>

      <div style={{ position: 'relative' }}>
        {FASES.map((f, i) => {
          const ultimo = i === FASES.length - 1;
          const fechaFase = f.tuParte ? grabacion : (f.n === 1 ? sesion : null);
          return (
            <div key={f.n} style={{ display: 'flex', gap: 15, position: 'relative' }}>
              {/* Rail: nodo numerado + línea conectora */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', background: f.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 800, fontSize: 14.5,
                  boxShadow: `0 4px 12px ${f.color}55`, zIndex: 1,
                }}>{f.n}</div>
                {!ultimo && (
                  <div style={{ width: 2, flex: 1, minHeight: 26, background: T.line, marginTop: 2, marginBottom: 2 }} />
                )}
              </div>

              {/* Tarjeta de la fase */}
              <div style={{
                flex: 1, minWidth: 0, marginBottom: ultimo ? 0 : 14,
                background: '#fff', border: `1px solid ${T.line}`, borderRadius: 14,
                padding: '14px 16px', borderLeft: `4px solid ${f.color}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ ...kicker(f.color, 10.5), letterSpacing: '.08em', fontWeight: 800 }}>{f.cuando}</span>
                  {f.tuParte && (
                    <span style={{
                      fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em',
                      color: '#B45309', background: '#FEF3C7', borderRadius: 999, padding: '2px 7px',
                    }}>Tu parte</span>
                  )}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.015em', margin: '5px 0 3px' }}>{f.titulo}</div>
                <div style={{ fontSize: 13, lineHeight: 1.55, color: T.muted }}>{f.desc}</div>
                {fechaFase && <PillFecha texto={f.tuParte ? `Tu grabación: ${fechaFase}` : `Tu sesión: ${fechaFase}`} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
