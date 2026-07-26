// La hoja que se abre cuando el cliente toca un tab con candado.
//
// No dice "no podés entrar": dice qué se abre y cuánto falta. La diferencia
// importa — un candado que explica motiva, un candado que rechaza frustra.
import { useNavigate } from 'react-router-dom';
import { IcoLock, IcoArrowR } from '../../components/icons';
import { T, FUENTE, btn } from '../tokens';

const QUE_HAY = {
  '/guiones': {
    titulo: 'Tus guiones',
    texto: 'Acá van a estar los textos que escribimos para tus videos y tus anuncios, listos para que los grabes.',
  },
  '/embudos': {
    titulo: 'Tus embudos',
    texto: 'Acá vas a ver cómo avanza cada campaña: la estrategia, las páginas y cuándo sale al aire.',
  },
  '/material': {
    titulo: 'Tu material',
    texto: 'Acá vas a tener todo junto: lo que nos mandaste y lo que te devolvemos editado.',
  },
};

export default function CandadoSheet({ ruta, pct, onCerrar }) {
  const navigate = useNavigate();
  const info = QUE_HAY[ruta] || { titulo: 'Esta sección', texto: 'Se abre cuando termines tu onboarding.' };

  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,22,40,.45)', zIndex: 70,
        display: 'flex', alignItems: 'flex-end', animation: 'kxFade .2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mk-sheet"
        style={{
          background: '#fff', borderRadius: '22px 22px 0 0', padding: '10px 22px 26px',
          animation: 'kxUp .26s ease',
        }}
      >
        <div style={{ width: 46, height: 5, borderRadius: 999, background: T.lineFuerte, margin: '0 auto 20px' }} />

        <div style={{
          width: 56, height: 56, borderRadius: 18, background: T.fill,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
        }}>
          <IcoLock size={25} stroke={T.soft} sw={2.2} />
        </div>

        <div style={{ fontFamily: FUENTE.display, fontSize: 24, fontWeight: 800, letterSpacing: '-.025em', lineHeight: 1.2 }}>{info.titulo}</div>
        <div style={{ fontSize: 15.5, lineHeight: 1.6, color: T.soft, marginTop: 12 }}>
          {info.texto}
        </div>
        <div style={{ fontSize: 15.5, lineHeight: 1.6, color: T.ink, marginTop: 12, fontWeight: 600 }}>
          Se abre cuando termines tu onboarding — es de donde sacamos todo esto.
        </div>

        <div style={{ marginTop: 22 }}>
          <div style={{ height: 9, borderRadius: 999, background: T.fill, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999, background: T.azul,
              width: `${pct || 0}%`, transition: 'width .5s ease',
            }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.muted, marginTop: 9 }}>
            Llevás {pct || 0}% completo
          </div>
        </div>

        <button
          type="button"
          onClick={() => { onCerrar?.(); navigate('/onboarding'); }}
          style={{ ...btn(true), marginTop: 22 }}
        >
          SEGUIR DONDE QUEDÉ <IcoArrowR size={18} stroke="#fff" sw={2.4} />
        </button>
      </div>
    </div>
  );
}
