import { useNavigate } from 'react-router-dom';
import PhoneFrame, { KxScreen } from '../components/PhoneFrame';
import { useAsync } from '../components/ui';
import { api } from '../data/portalApi';
import { T, display } from '../components/theme';
import { IcoChevL, IcoCheck, IcoInfo, IcoVideo } from '../components/icons';

// ACCESO A META — flujo simple (decisión de Matías): el cliente NO configura
// nada solo. Son 2 pasos: definir desde qué Facebook/Instagram sale la
// publicidad, y agendar una sesión de 15 minutos donde el equipo configura todo.
export default function AccesoMetaScreen() {
  const nav = useNavigate();
  const { data } = useAsync(() => api.meta(), []);

  const estado = data?.estado || 'pendiente';
  const wa = (data?.whatsapp || '').replace(/\D/g, '');
  const agenda = (data?.agenda || '').trim();
  const linkAgenda = agenda ? (/^https?:\/\//.test(agenda) ? agenda : 'https://' + agenda)
    : wa ? `https://wa.me/${wa}?text=${encodeURIComponent('Hola, quiero agendar la sesión de 15 minutos para configurar mi Meta.')}` : '';

  const numChip = (n) => (
    <span style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
  );

  return (
    <PhoneFrame>
      <KxScreen>
        <div className="kxs" style={{ flex: 1, overflowY: 'auto' }}>
          <div onClick={() => nav(-1)} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px 0', color: T.primary, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <IcoChevL size={17} stroke="var(--mk-blue-ops)" sw={2.4} />
            Volver
          </div>

          <div style={{ padding: '18px 22px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ ...display(29, '-0.035em'), textWrap: 'balance' }}>Conectemos tu Meta</div>
            <div style={{ fontSize: 15, lineHeight: 1.55, color: T.textSoft, textWrap: 'pretty' }}>
              No tienes que configurar nada solo. Son 2 pasos y el resto lo hacemos contigo.
            </div>
          </div>

          <div style={{ padding: '22px 22px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Paso 1 · Definir el Facebook e Instagram */}
            <div style={cardPaso}>
              <div style={pasoHead}>{numChip(1)}<span style={pasoTitulo}>Define tu Facebook e Instagram</span></div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: T.text2 }}>
                Elige desde qué página de Facebook y qué Instagram vamos a lanzar tu publicidad.
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'var(--mk-blue-bg2)', border: '1px solid var(--mk-border)' }}>
                <IcoInfo size={16} stroke="var(--mk-blue-ops)" sw={2.2} style={{ flex: 'none', marginTop: 1 }} />
                <span style={{ fontSize: 13, lineHeight: 1.5, color: T.textSoft }}>
                  Idealmente que estén relacionados con lo que vamos a lanzar. <b style={{ color: T.ink }}>No importa si tienen pocos o muchos seguidores.</b>
                </span>
              </div>
            </div>

            {/* Paso 2 · Agendar la sesión */}
            <div style={cardPaso}>
              <div style={pasoHead}>{numChip(2)}<span style={pasoTitulo}>Agenda una sesión de 15 minutos</span></div>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: T.text2 }}>
                Nos conectamos contigo y te configuramos todo: los accesos, la cuenta publicitaria y lo que haga falta. Tú solo entras con tu Facebook.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: 14, background: T.surface2 }}>
                <IcoVideo size={17} stroke="var(--mk-text2)" sw={2} style={{ flex: 'none' }} />
                <span style={{ fontSize: 13, lineHeight: 1.45, color: T.textSoft }}>Es una videollamada corta. Hazla desde la computadora si puedes.</span>
              </div>
            </div>
          </div>
          <div style={{ height: 26 }} />
        </div>

        {/* Footer fijo */}
        <div data-kx-footer="" style={{ flex: 'none', padding: '16px 22px 28px', background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(10px)', boxShadow: '0 -1px 0 var(--mk-border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {estado === 'validado' ? (
            <div onClick={() => nav('/')} role="button" style={{ cursor: 'pointer', height: 52, borderRadius: 999, background: 'var(--mk-green-bg)', color: T.textSoft, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <IcoCheck size={18} stroke="var(--mk-green)" sw={2.6} />
              Tu Meta ya está configurada
            </div>
          ) : linkAgenda ? (
            <a href={linkAgenda} target="_blank" rel="noreferrer" style={{ height: 52, borderRadius: 999, background: T.primary, color: '#fff', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', boxShadow: '0 8px 22px rgba(91,124,245,.34)' }}>
              Agendar la sesión de 15 minutos
            </a>
          ) : (
            <div style={{ height: 52, borderRadius: 999, background: T.surface2, color: T.text2, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              Escríbenos por WhatsApp y la agendamos
            </div>
          )}
        </div>
      </KxScreen>
    </PhoneFrame>
  );
}

const cardPaso = { background: '#fff', borderRadius: 20, padding: 18, boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 12 };
const pasoHead = { display: 'flex', alignItems: 'center', gap: 11 };
const pasoTitulo = { fontSize: 16, fontWeight: 800, color: 'var(--mk-ink)' };
