// Marco del onboarding: header con la barra de progreso, índice de tramos en PC
// y footer fijo con la acción principal.
//
// Deliberadamente NO usa <KxScreen>: ese componente lleva [data-kx-screen], que
// en PC aplica un padding-left de 236px pensado para el menú lateral del portal.
// El onboarding no tiene menú — es pantalla completa para que el cliente no se
// distraiga — así que usa su propio wrapper [data-kx-onb].
import { useNavigate } from 'react-router-dom';
import { T, microLabel } from '../../components/theme';
import { IcoChevL, IcoX, IcoCheck, IcoUpload } from '../../components/icons';
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
      flex: 'none', background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(10px)',
      borderBottom: '1px solid var(--mk-border)', padding: '10px 16px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40 }}>
        <button
          type="button" onClick={onVolver || (() => navigate(-1))}
          aria-label="Volver"
          style={btnIcono}
        ><IcoChevL size={20} stroke={T.text2} /></button>

        <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: T.ink,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{titulo}</div>
          {paso != null && total != null && (
            <div style={{ fontSize: 12, color: T.text3, marginTop: 1 }}>{paso} de {total}</div>
          )}
        </div>

        <button type="button" onClick={salir} aria-label="Salir" style={btnIcono}>
          <IcoX size={19} stroke={T.text2} />
        </button>
      </div>

      {!ocultarProgreso && (
        <div style={{ padding: '9px 0 10px' }}>
          <div style={{ height: 4, borderRadius: 999, background: T.surface2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999, background: T.primary,
              width: `${progreso.pct}%`, transition: 'width .5s ease',
            }} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 5, fontSize: 11.5, color: T.text3,
          }}>
            <span>{progreso.pct}% completo</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {subiendoAhora > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.primaryInk }}>
                  <IcoUpload size={12} stroke={T.primaryInk} /> {subiendoAhora} subiendo
                </span>
              )}
              <span style={{ color: sync === 'pendiente' ? T.orange : T.text3 }}>
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
      flex: 'none', padding: '12px 20px calc(14px + env(safe-area-inset-bottom))',
      background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(10px)',
      borderTop: '1px solid var(--mk-border)',
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
      <div style={{ ...microLabel(), marginBottom: 14 }}>Tu onboarding</div>

      <div style={{ marginBottom: 22 }}>
        <div style={{
          fontFamily: "'Montserrat', sans-serif", fontSize: 30, fontWeight: 800,
          letterSpacing: '-0.03em', color: T.ink, lineHeight: 1,
        }}>{progreso.pct}%</div>
        <div style={{ height: 5, borderRadius: 999, background: T.surface2, marginTop: 9, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 999, background: T.primary,
            width: `${progreso.pct}%`, transition: 'width .5s ease',
          }} />
        </div>
        {minutos > 0 && (
          <div style={{ fontSize: 12.5, color: T.text2, marginTop: 8 }}>
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
      padding: '10px 10px', borderRadius: 11, border: 'none', background: 'none',
      cursor: 'pointer',
    }}>
      <span style={{
        width: 24, height: 24, borderRadius: '50%', flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hecho ? T.green : T.surface2,
        color: hecho ? '#fff' : T.text3,
        fontSize: 12, fontWeight: 800,
      }}>
        {hecho ? <IcoCheck size={13} stroke="#fff" sw={3} /> : n}
      </span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 14, fontWeight: hecho ? 500 : 600,
        color: hecho ? T.text2 : T.text, lineHeight: 1.3,
      }}>{titulo}</span>
    </button>
  );
}

const btnIcono = {
  width: 38, height: 38, borderRadius: 12, border: 'none', background: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none',
};
