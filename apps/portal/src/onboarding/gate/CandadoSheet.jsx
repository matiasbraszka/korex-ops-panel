// La hoja que se abre cuando el cliente toca un tab con candado.
//
// No dice "no podés entrar": dice qué se abre y cuánto falta. La diferencia
// importa — un candado que explica motiva, un candado que rechaza frustra.
import { useNavigate } from 'react-router-dom';
import { T, display, bigBtn } from '../../components/theme';
import { IcoLock, IcoArrowR } from '../../components/icons';

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
        <div style={{ width: 44, height: 5, borderRadius: 999, background: T.border, margin: '0 auto 20px' }} />

        <div style={{
          width: 52, height: 52, borderRadius: 17, background: T.surface2,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
        }}>
          <IcoLock size={23} stroke={T.text2} />
        </div>

        <div style={{ ...display(22, '-0.025em'), lineHeight: 1.2 }}>{info.titulo}</div>
        <div style={{ fontSize: 15.5, lineHeight: 1.6, color: T.text2, marginTop: 10 }}>
          {info.texto}
        </div>
        <div style={{ fontSize: 15.5, lineHeight: 1.6, color: T.textSoft, marginTop: 12 }}>
          Se abre cuando termines tu onboarding — es de donde sacamos todo esto.
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ height: 7, borderRadius: 999, background: T.surface2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999, background: T.primary,
              width: `${pct || 0}%`, transition: 'width .5s ease',
            }} />
          </div>
          <div style={{ fontSize: 13.5, color: T.text2, marginTop: 8 }}>
            Llevás {pct || 0}% completo
          </div>
        </div>

        <button
          type="button"
          onClick={() => { onCerrar?.(); navigate('/onboarding'); }}
          style={{ ...bigBtn(T.primary, 52), marginTop: 20 }}
        >
          SEGUIR DONDE QUEDÉ <IcoArrowR size={17} stroke="#fff" />
        </button>
      </div>
    </div>
  );
}
