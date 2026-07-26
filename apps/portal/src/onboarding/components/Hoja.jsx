// Hoja inferior del onboarding.
//
// Existe para sacar cajas de la pantalla principal. Antes la ayuda y el ejemplo
// vivían como bloques permanentes debajo de la pregunta: dos recuadros de color
// compitiendo con el enunciado, y el cliente tenía que decidir cuál leer
// primero. La información no se pierde, se guarda acá y se abre cuando la pide.
//
// En móvil entra desde abajo (el pulgar está ahí); en PC el CSS de .mk-sheet la
// acota y la centra.
import { useEffect } from 'react';
import { IcoX } from '../../components/icons';
import { TO, F, dsp } from '../tokens';

export default function Hoja({ titulo, children, onCerrar, pie }) {
  // Escape cierra: hay clientes completando esto con teclado desde la compu.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCerrar?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar]);

  return (
    <div
      onClick={onCerrar}
      role="dialog" aria-modal="true" aria-label={titulo}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,22,40,.5)', zIndex: 70,
        display: 'flex', alignItems: 'flex-end', animation: 'kxFade .2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mk-sheet"
        style={{
          background: '#fff', borderRadius: '24px 24px 0 0',
          animation: 'kxUp .26s ease', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          flex: 'none', padding: '14px 20px 12px', borderBottom: `1px solid ${TO.line}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ ...dsp(19, '-0.02em'), flex: 1, lineHeight: 1.25 }}>{titulo}</div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" style={{
            width: 44, height: 44, borderRadius: 14, border: 'none', background: TO.fill,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flex: 'none',
          }}><IcoX size={20} stroke={TO.body} sw={2.2} /></button>
        </div>

        <div className="kxs" style={{ padding: '18px 20px 22px', flex: 1 }}>
          {children}
        </div>

        {pie && (
          <div style={{
            flex: 'none', padding: '12px 20px calc(16px + env(safe-area-inset-bottom))',
            borderTop: `1px solid ${TO.line}`,
          }}>{pie}</div>
        )}
      </div>
    </div>
  );
}

/** Bloque de la hoja: micro-título + cuerpo. Sin recuadro ni color de fondo. */
export function BloqueHoja({ titulo, children, primero }) {
  return (
    <div style={primero ? undefined : { marginTop: 22, paddingTop: 20, borderTop: `1px solid ${TO.line}` }}>
      <div style={{
        fontSize: 12, fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: TO.meta, marginBottom: 8,
      }}>{titulo}</div>
      <div style={{ fontSize: F.sub, lineHeight: 1.65, color: TO.body, whiteSpace: 'pre-wrap' }}>
        {children}
      </div>
    </div>
  );
}
