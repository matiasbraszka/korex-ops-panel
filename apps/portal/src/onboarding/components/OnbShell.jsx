// ─────────────────────────────────────────────────────────────────────────────
// El marco del onboarding, calcado del HTML: barra lateral de 240px a partir de
// 900px de ancho, header de 60px con la barra de progreso debajo, cuerpo
// scrolleable de 760px máximo y pie fijo con Atrás / Continuar.
//
// Ocupa la pantalla entera (100dvh) y no usa el <Layout> del portal: no hay
// menú inferior ni pestañas, porque el cliente no tiene que irse a ningún lado
// hasta terminar. Las pestañas aparecen en la barra lateral con candado, y se
// van abriendo a medida que cierra bloques — verlas abrirse a mitad de camino
// es lo que sostiene el esfuerzo.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { T, FUENTE, kicker, btn } from '../tokens';
import { useOnboarding } from '../OnboardingProvider';

const ANCHO_PC = 900;

/** ¿Estamos en pantalla ancha? El HTML corta en 900px. */
export function usaAncho() {
  const [ancho, setAncho] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth >= ANCHO_PC : true));
  useEffect(() => {
    const medir = () => setAncho(window.innerWidth >= ANCHO_PC);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);
  return ancho;
}

const IcoCheckSvg = ({ size = 13, color = 'currentColor', sw = 3 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const IcoCandado = ({ size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const IcoTarea = ({ size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 11l3 3L22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

/**
 * Las cuatro pestañas del portal, con su candado.
 *
 * Cuál abre cada bloque sale de `desbloquea` en la base, así que el equipo lo
 * puede cambiar desde el constructor sin tocar código. "Avance del proyecto"
 * viaja con Material porque en el portal ambos viven en la misma pantalla.
 */
const TABS = [
  { nombre: 'Guiones', ruta: '/guiones' },
  { nombre: 'Embudos', ruta: '/embudos' },
  { nombre: 'Material', ruta: '/material' },
  { nombre: 'Avance del proyecto', ruta: '/material' },
];

function BarraLateral() {
  const { bloques } = useOnboarding();
  const abiertas = new Set(
    bloques.filter((b) => b.completo).flatMap((b) => b.desbloquea || []));

  return (
    <aside style={{
      width: 240, flex: '0 0 240px', background: '#fff',
      borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column',
      padding: '18px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '8px 8px 24px 8px' }}>
        <img src="/mk-logo.svg" alt="Método Korex" style={{ height: 30, width: 'auto', display: 'block' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px',
          borderRadius: 12, background: T.azulWash, color: T.azulTinta,
          fontSize: 13, fontWeight: 600,
        }}>
          <IcoTarea />
          <span>Onboarding</span>
        </div>

        {TABS.map((t) => {
          const abierta = abiertas.has(t.ruta);
          return (
            <div key={t.nombre} style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px',
              borderRadius: 12, color: abierta ? T.soft : T.faint,
              fontSize: 13, fontWeight: 500,
            }}>
              <IcoCandado />
              <span style={{ flex: 1 }}>{t.nombre}</span>
              {abierta && <IcoCheckSvg color={T.verde} />}
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ borderTop: `1px solid ${T.line}`, padding: '16px 10px 4px 10px' }}>
        <div style={{ ...kicker(T.faint, 10), letterSpacing: '.1em', marginBottom: 9 }}>
          Tus bloques
        </div>
        {bloques.map((b) => (
          <div key={b.bkey} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0' }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flex: '0 0 7px',
              background: b.completo ? T.verde : b.hechas > 0 ? T.azul : T.lineFuerte,
            }} />
            <span style={{
              flex: 1, fontSize: 12, fontWeight: 600,
              color: b.hechas > 0 ? T.ink : T.muted,
            }}>{b.corto}</span>
            <span style={{ fontSize: 11, color: T.faint, fontVariantNumeric: 'tabular-nums' }}>
              {b.hechas}/{b.total}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

/**
 * El armazón. `contador` es la línea "Paso 4 de 23 · Bloque 2 · Estrategia";
 * `pie` es lo que va en el footer fijo (normalmente Atrás + Continuar).
 */
export default function OnbShell({ children, contador = '', pie = null, mostrarProgreso = true }) {
  const ancho = usaAncho();
  const navigate = useNavigate();
  const { progreso, sync, estado, prefill, subiendo } = useOnboarding();

  const nombre = prefill?.nombre || '';
  const iniciales = nombre.split(' ').filter(Boolean).map((x) => x[0]).join('').slice(0, 2).toUpperCase() || '—';
  const pct = estado?.completo ? 100 : progreso.pct;
  const subiendoAhora = subiendo.filter((s) => !s.done && !s.error).length;

  const guardado = sync === 'guardando' ? 'Guardando…'
    : sync === 'pendiente' ? 'Se guarda al volver la señal'
    : 'Guardado';

  return (
    <div data-kx-onb="" style={{
      display: 'flex',
      // Le descuenta el cartel del modo prueba, que va arriba y empuja. En
      // producción la variable no existe y esto es 100dvh a secas.
      height: 'calc(100dvh - var(--kx-demo-alto, 0px))',
      width: '100%', overflow: 'hidden',
      background: T.bg, fontFamily: FUENTE.ui, color: T.ink,
    }}>
      {ancho && <BarraLateral />}

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ flex: '0 0 auto', background: '#fff', borderBottom: `1px solid ${T.line}` }}>
          <div style={{
            height: 60, display: 'flex', alignItems: 'center', gap: 12,
            padding: '0 clamp(16px,4vw,40px)',
          }}>
            {!ancho && (
              <img src="/mk-logo.svg" alt="Método Korex"
                   style={{ height: 22, width: 'auto', display: 'block' }} />
            )}
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-.01em' }}>Tu onboarding</div>
            <div style={{ flex: 1 }} />
            <button
              type="button" onClick={() => navigate('/onboarding/avance')}
              style={{
                border: `1px solid ${T.line}`, background: '#fff', color: T.soft,
                fontSize: 12, fontWeight: 600, padding: '8px 13px',
                borderRadius: 999, cursor: 'pointer',
              }}>
              Ver mi avance
            </button>
            <div style={{
              width: 34, height: 34, borderRadius: '50%', background: T.fill,
              border: `1px solid ${T.line}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 12, fontWeight: 700, color: T.soft,
            }}>{iniciales}</div>
          </div>

          {mostrarProgreso && (
            <div style={{ padding: '0 clamp(16px,4vw,40px) 13px clamp(16px,4vw,40px)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
                <span style={{
                  flex: 1, minWidth: 0, ...kicker(T.faint, 11), letterSpacing: '.08em',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{contador}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: T.azulTinta, letterSpacing: '-.01em' }}>
                  {pct}%
                </span>
                <div style={{
                  flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 600,
                }}>
                  {sync === 'guardando'
                    ? <span style={{
                        width: 6, height: 6, borderRadius: '50%', background: T.faint,
                        animation: 'mkdot .8s ease-in-out infinite',
                      }} />
                    : <IcoCheckSvg color={T.verde} />}
                  <span style={{ color: T.muted, fontWeight: 600 }}>
                    {subiendoAhora > 0 ? `${subiendoAhora} subiendo · ${guardado}` : guardado}
                  </span>
                </div>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: T.fill2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 999, background: T.azul,
                  width: `${pct}%`, transition: 'width .4s cubic-bezier(.4,0,.2,1)',
                }} />
              </div>
            </div>
          )}
        </header>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{
            maxWidth: 760, margin: '0 auto',
            padding: 'clamp(22px,5vw,44px) clamp(16px,4vw,40px) 130px clamp(16px,4vw,40px)',
          }}>
            {children}
          </div>
        </div>

        {pie && (
          <div style={{
            flex: '0 0 auto', background: '#fff', borderTop: `1px solid ${T.line}`,
            padding: '13px clamp(16px,4vw,40px)',
            boxShadow: '0 -4px 12px rgba(10,22,40,.04)',
          }}>
            {pie}
          </div>
        )}
      </main>
    </div>
  );
}

/** El pie estándar: Atrás a la izquierda, la acción principal ocupando el resto. */
export function Pie({ onAtras, onSeguir, etiqueta = 'Continuar', activo = true, pista = '' }) {
  return (
    <>
      <div style={{
        maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        {onAtras && (
          <button type="button" onClick={onAtras} style={{
            flex: '0 0 auto', height: 52, padding: '0 18px', borderRadius: 999,
            border: `1px solid ${T.line}`, background: '#fff', cursor: 'pointer',
            fontSize: 13, fontWeight: 700, color: T.muted,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><path d="M11 18l-6-6 6-6" />
            </svg>
            <span>Atrás</span>
          </button>
        )}
        <button type="button" onClick={onSeguir} style={{ ...btn(activo), flex: 1 }}>
          <span>{etiqueta}</span>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" /><path d="M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      {/* La pista aparece cuando falta algo, pero el botón NUNCA se bloquea:
          bloquear a alguien porque escribió poco lo humilla y hace que abandone,
          no que escriba más. */}
      {pista && (
        <div style={{
          maxWidth: 760, margin: '9px auto 0 auto', fontSize: 11.5,
          color: T.muted, textAlign: 'center',
        }}>{pista}</div>
      )}
    </>
  );
}
