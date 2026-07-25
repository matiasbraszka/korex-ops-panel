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
import { IcoChevL, IcoX, IcoCheck, IcoUpload } from '../../components/icons';
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

/** Barra superior: volver, progreso, dónde estoy, y salir sin perder nada. */
export function OnbHeader({ titulo, paso, total, onVolver, ocultarProgreso }) {
  const navigate = useNavigate();
  const { progreso, sync, subiendo, flush } = useOnboarding();

  const subiendoAhora = subiendo.filter((s) => !s.done && !s.error).length;

  const salir = async () => { await flush(); navigate('/'); };

  return (
    <div style={{
      flex: 'none', background: '#fff',
      borderBottom: `1px solid ${TO.line}`, padding: '8px 14px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 48 }}>
        <button
          type="button" onClick={onVolver || (() => navigate(-1))}
          aria-label="Volver"
          style={btnIcono}
        ><IcoChevL size={24} stroke={TO.body} sw={2.2} /></button>

        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <div style={{
            fontSize: 16, fontWeight: 800, color: TO.ink, letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{titulo}</div>
          {paso != null && total != null && (
            <div style={{ fontSize: 14, fontWeight: 600, color: TO.meta, marginTop: 1 }}>
              {paso} de {total}
            </div>
          )}
        </div>

        <button type="button" onClick={salir} aria-label="Salir" style={btnIcono}>
          <IcoX size={22} stroke={TO.body} sw={2.2} />
        </button>
      </div>

      {!ocultarProgreso && (
        <div style={{ padding: '8px 0 10px' }}>
          {/* 7px, no 4px: una barra de 4px sobre un relleno casi blanco no se ve
              en un celular con brillo bajo, y la barra ES el motor del avance. */}
          <div
            role="progressbar" aria-valuenow={progreso.pct} aria-valuemin={0} aria-valuemax={100}
            aria-label="Progreso del onboarding"
            style={{ height: 7, borderRadius: 999, background: TO.fill, overflow: 'hidden' }}
          >
            <div style={{
              height: '100%', borderRadius: 999, background: TO.blueBtn,
              width: `${progreso.pct}%`, transition: 'width .5s ease',
            }} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 6, fontSize: 14, fontWeight: 600, color: TO.meta,
          }}>
            <span>{progreso.pct}% completo</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {subiendoAhora > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: TO.blue }}>
                  <IcoUpload size={14} stroke={TO.blue} /> {subiendoAhora} subiendo
                </span>
              )}
              <span style={{ color: sync === 'pendiente' ? TO.amber : TO.meta }}>
                {sync === 'guardando' ? 'Guardando…'
                  : sync === 'pendiente' ? 'Se guarda al volver la señal'
                  : 'Guardado'}
              </span>
            </span>
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

      <div style={{ marginBottom: 22 }}>
        <div style={{
          fontFamily: "'Montserrat', sans-serif", fontSize: 34, fontWeight: 800,
          letterSpacing: '-0.03em', color: TO.ink, lineHeight: 1,
        }}>{progreso.pct}%</div>
        <div style={{ height: 7, borderRadius: 999, background: TO.fill, marginTop: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 999, background: TO.blueBtn,
            width: `${progreso.pct}%`, transition: 'width .5s ease',
          }} />
        </div>
        {minutos > 0 && (
          <div style={{ fontSize: F.meta, fontWeight: 600, color: TO.meta, marginTop: 9 }}>
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
