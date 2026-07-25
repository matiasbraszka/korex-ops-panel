// La hoja que se abre cuando el cliente toca un tab con candado.
//
// No dice "no podés entrar": dice qué se abre y cuánto falta. La diferencia
// importa — un candado que explica motiva, un candado que rechaza frustra.
import { useNavigate } from 'react-router-dom';
import { IcoLock, IcoArrowR } from '../../components/icons';
import { TO, F, dsp, btn } from '../tokens';

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
        <div style={{ width: 46, height: 5, borderRadius: 999, background: TO.lineStrong, margin: '0 auto 20px' }} />

        <div style={{
          width: 56, height: 56, borderRadius: 18, background: TO.fill,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18,
        }}>
          <IcoLock size={25} stroke={TO.body} sw={2.2} />
        </div>

        <div style={{ ...dsp(F.h2 - 2, '-0.025em'), lineHeight: 1.2 }}>{info.titulo}</div>
        <div style={{ fontSize: F.sub, lineHeight: 1.6, color: TO.body, marginTop: 12 }}>
          {info.texto}
        </div>
        <div style={{ fontSize: F.sub, lineHeight: 1.6, color: TO.ink, marginTop: 12, fontWeight: 600 }}>
          Se abre cuando termines tu onboarding — es de donde sacamos todo esto.
        </div>

        <div style={{ marginTop: 22 }}>
          <div style={{ height: 9, borderRadius: 999, background: TO.fill, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999, background: TO.blueBtn,
              width: `${pct || 0}%`, transition: 'width .5s ease',
            }} />
          </div>
          <div style={{ fontSize: F.meta, fontWeight: 600, color: TO.meta, marginTop: 9 }}>
            Llevás {pct || 0}% completo
          </div>
        </div>

        <button
          type="button"
          onClick={() => { onCerrar?.(); navigate('/onboarding'); }}
          style={{ ...btn(), marginTop: 22 }}
        >
          SEGUIR DONDE QUEDÉ <IcoArrowR size={18} stroke="#fff" sw={2.4} />
        </button>
      </div>
    </div>
  );
}
