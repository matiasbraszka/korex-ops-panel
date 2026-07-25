// Marco del onboarding: header con la barra de progreso, índice de tramos en PC
// y footer fijo con la acción principal.
//
// Deliberadamente NO usa <KxScreen>: ese componente lleva [data-kx-screen], que
// en PC aplica un padding-left de 236px pensado para el menú lateral del portal.
// El onboarding no tiene menú — es pantalla completa para que el cliente no se
// distraiga — así que usa su propio wrapper [data-kx-onb].
//
// Todo el color de texto sale de TO (onboarding/tokens.js), no de T: los grises
// del portal no llegan al contraste que hace falta para una hora de lectura.
import { useNavigate } from 'react-router-dom';
import { IcoChevL, IcoX, IcoCheck } from '../../components/icons';
import { TO, F, label } from '../tokens';
import { useOnboarding } from '../OnboardingProvider';
import { tramoCompleto } from '../progreso';

export function OnbShell({ children, indice = true }) {
  return (
    <div data-kx-onb="">
      {indice && <IndiceTramos />}
      {children}
    </div>
  );
}

/**
 * Anillo de progreso.
 *
 * Reemplaza a la barra horizontal: en el celular, una barra acostada de lado a
 * lado se lee como un adorno del borde superior y el número queda perdido en una
 * esquina. El anillo centrado ES la pantalla — el cliente lo mira de frente cada
 * vez que pasa de pregunta, que es exactamente cuando el número se mueve.
 */
function Anillo({ pct, size = 52, grosor = 5 }) {
  const r = (size - grosor) / 2;
  const largo = 2 * Math.PI * r;
  return (
    <div
      role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
      aria-label={`Progreso del onboarding: ${pct} por ciento`}
      style={{ position: 'relative', width: size, height: size, flex: 'none' }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TO.fill} strokeWidth={grosor} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={pct >= 100 ? TO.greenInk : TO.blueBtn} strokeWidth={grosor} strokeLinecap="round"
          strokeDasharray={largo}
          strokeDashoffset={largo * (1 - Math.min(100, Math.max(0, pct)) / 100)}
          style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'baseline', justifyContent: 'center', gap: 1,
        paddingTop: size * 0.36,
        fontFamily: "'Montserrat', sans-serif", fontWeight: 800, color: TO.ink,
        letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ fontSize: Math.round(size * 0.32) }}>{pct}</span>
        <span style={{ fontSize: Math.round(size * 0.19), opacity: 0.65 }}>%</span>
      </div>
    </div>
  );
}

/** Barra superior: volver, progreso, dónde estoy, y salir sin perder nada. */
export function OnbHeader({ titulo, paso, total, onVolver, ocultarProgreso }) {
  const navigate = useNavigate();
  const { progreso, sync, subiendo, flush } = useOnboarding();

  const subiendoAhora = subiendo.filter((s) => !s.done && !s.error).length;

  const salir = async () => { await flush(); navigate('/'); };

  // Una sola línea hace de subtítulo y de estado de guardado: dos renglones
  // separados para eso son 20px de alto que en el celular valen más como
  // contenido. "Guardado" fijo es la promesa de que no se pierde nada.
  const pie = [
    paso != null && total != null ? `${paso} de ${total}` : null,
    subiendoAhora > 0 ? `${subiendoAhora} subiendo` : null,
    sync === 'guardando' ? 'Guardando…'
      : sync === 'pendiente' ? 'Se guarda al volver la señal'
      : 'Guardado',
  ].filter(Boolean).join(' · ');

  return (
    <div style={{
      flex: 'none', background: '#fff', position: 'relative',
      borderBottom: `1px solid ${TO.line}`,
      padding: ocultarProgreso ? '8px 14px' : '8px 14px 14px',
    }}>
      {/* Los dos botones flotan sobre los bordes para que el bloque del medio
          quede centrado de verdad respecto de la pantalla, no del hueco entre
          ellos. */}
      <button
        type="button" onClick={onVolver || (() => navigate(-1))} aria-label="Volver"
        style={{ ...btnIcono, position: 'absolute', left: 8, top: 8, zIndex: 2 }}
      ><IcoChevL size={24} stroke={TO.body} sw={2.2} /></button>

      <button
        type="button" onClick={salir} aria-label="Salir"
        style={{ ...btnIcono, position: 'absolute', right: 8, top: 8, zIndex: 2 }}
      ><IcoX size={22} stroke={TO.body} sw={2.2} /></button>

      {ocultarProgreso ? (
        <div style={{
          minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 56px',
        }}>
          <div style={{
            fontSize: 16, fontWeight: 800, color: TO.ink, letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{titulo}</div>
        </div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
          padding: '2px 56px 0', textAlign: 'center',
        }}>
          {/* En PC el índice lateral ya muestra el anillo grande: repetirlo acá
              son dos porcentajes en la misma pantalla. El CSS lo oculta. */}
          <div data-kx-onbanillo=""><Anillo pct={progreso.pct} /></div>
          <div style={{ minWidth: 0, maxWidth: '100%' }}>
            <div style={{
              fontSize: 16, fontWeight: 800, color: TO.ink, letterSpacing: '-0.01em',
              lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{titulo}</div>
            <div style={{
              fontSize: 13.5, fontWeight: 600, marginTop: 3,
              color: sync === 'pendiente' ? TO.amber : TO.meta,
            }}>{pie}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Footer fijo con la acción principal. */
export function OnbFooter({ children }) {
  return (
    <div data-kx-onbfooter="" style={{
      flex: 'none', padding: '14px 20px calc(16px + env(safe-area-inset-bottom))',
      background: '#fff', borderTop: `1px solid ${TO.line}`,
    }}>
      {children}
    </div>
  );
}

/** Índice lateral: solo PC. En móvil el CSS lo oculta. */
function IndiceTramos() {
  const navigate = useNavigate();
  const { tramos, respuestas, bloqueantes, progreso, minutos, agenda } = useOnboarding();

  return (
    <div data-kx-onbindice="">
      <div style={{ ...label(), marginBottom: 14 }}>Tu onboarding</div>

      <div style={{
        marginBottom: 22, display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center', gap: 10,
      }}>
        <Anillo pct={progreso.pct} size={104} grosor={9} />
        {minutos > 0 && (
          <div style={{ fontSize: F.meta, fontWeight: 600, color: TO.meta }}>
            Te quedan unos {minutos} minutos
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 2 }}>
        <Fila
          n={0} titulo="Agendá tu sesión"
          hecho={agenda?.estado === 'agendado'}
          onClick={() => navigate('/onboarding/agendar')}
        />
        {tramos.map((s, i) => (
          <Fila
            key={s.skey} n={i + 1} titulo={s.titulo}
            hecho={tramoCompleto(s, respuestas, bloqueantes)}
            onClick={() => navigate(`/onboarding/${s.skey}`)}
          />
        ))}
      </div>
    </div>
  );
}

function Fila({ n, titulo, hecho, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left',
      padding: '11px 10px', borderRadius: 11, border: 'none', background: 'none',
      cursor: 'pointer',
    }}>
      <span style={{
        width: 26, height: 26, borderRadius: '50%', flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hecho ? TO.greenInk : TO.fill,
        color: hecho ? '#fff' : TO.meta,
        fontSize: 13, fontWeight: 800,
      }}>
        {hecho ? <IcoCheck size={14} stroke="#fff" sw={3} /> : n}
      </span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: hecho ? 600 : 700,
        color: hecho ? TO.meta : TO.ink, lineHeight: 1.3,
      }}>{titulo}</span>
    </button>
  );
}

// 48px: el mínimo táctil. Con 38px, en un celular en la calle, la mitad de los
// toques al botón de volver caen fuera.
const btnIcono = {
  width: 48, height: 48, borderRadius: 14, border: 'none', background: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none',
};
