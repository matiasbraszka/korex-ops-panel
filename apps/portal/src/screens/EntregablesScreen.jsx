import { useNavigate, useParams } from 'react-router-dom';
import PhoneFrame, { KxScreen } from '../components/PhoneFrame';
import BottomNav from '../components/BottomNav';
import { Loading, useAsync } from '../components/ui';
import { api } from '../data/portalApi';
import { T, display, pill } from '../components/theme';
import { IcoChevL, IcoPlay, IcoComment } from '../components/icons';

// LO QUE EDITAMOS — exacta al prototipo: los videos ya editados del embudo,
// listos para ver, con NUEVO en lo recién publicado por el equipo.
const gradientes = ['linear-gradient(160deg,#22262E,#0F1116)', 'linear-gradient(160deg,#242A34,#12151B)', 'linear-gradient(160deg,#1B2029,#0B0D11)'];

export default function EntregablesScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.material(), [id]);

  if (loading) return <PhoneFrame><Loading label="Buscando tus videos…" /></PhoneFrame>;
  const devol = (Array.isArray(data?.devoluciones) ? data.devoluciones : []).find((d) => d.strategyId === id);
  const items = Array.isArray(devol?.items) ? devol.items : [];
  const ads = items.filter((it) => it.bucket !== 'vsl_edit');
  const vsl = items.filter((it) => it.bucket === 'vsl_edit');

  const card = (it, i) => (
    <a key={i} href={it.url || '#'} target={it.url ? '_blank' : undefined} rel="noreferrer" style={{ display: 'block', background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)', textDecoration: 'none' }}>
      <div style={{ height: 184, background: gradientes[i % gradientes.length], display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IcoPlay size={24} />
        </div>
      </div>
      <div style={{ padding: '15px 17px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo}</span>
          <span style={{ fontSize: 12.5, color: T.text3 }}>{it.fecha ? `Editado el ${it.fecha}` : 'Editado por el equipo'}</span>
        </div>
        {devol?.nuevo && <span style={pill('var(--mk-blue-bg)', 'var(--mk-blue-ink)')}>Nuevo</span>}
      </div>
    </a>
  );

  return (
    <PhoneFrame>
      <KxScreen>
        <div className="kxs" style={{ flex: 1, overflowY: 'auto' }}>
          <div onClick={() => nav(`/embudo/${id}`)} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px 0', color: T.primary, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <IcoChevL size={17} stroke="var(--mk-blue-ops)" sw={2.4} />
            {devol?.funnel || 'Tu embudo'}
          </div>

          <div style={{ padding: '16px 22px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={display(28, '-0.035em')}>Lo que editamos</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.5, color: T.text2, textWrap: 'pretty' }}>
              Tus grabaciones ya editadas, listas para publicar. Si algo no te gusta, dinos y lo cambiamos.
            </div>
          </div>

          <div style={{ padding: '24px 22px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {items.length === 0 && (
              <div style={{ background: '#fff', borderRadius: 20, padding: 22, textAlign: 'center', color: T.text2, fontSize: 14, boxShadow: 'var(--shadow-md)' }}>
                Todavía no hay videos editados aquí. En cuanto publiquemos los primeros, los ves en esta pantalla.
              </div>
            )}

            {ads.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3 }}>{devol?.funnel} · Anuncios</div>
                {ads.map(card)}
              </>
            )}
            {vsl.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3, paddingTop: ads.length > 0 ? 6 : 0 }}>{devol?.funnel} · VSL</div>
                {vsl.map(card)}
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 17px', borderRadius: 16, background: T.surface2 }}>
              <IcoComment size={18} stroke="var(--mk-text2)" sw={2.1} />
              <span style={{ fontSize: 13, lineHeight: 1.45, color: T.textSoft, flex: 1 }}>¿Quieres cambiar algo de un video? Escríbenos y lo ajustamos.</span>
            </div>
          </div>
          <div style={{ height: 26 }} />
        </div>

        <BottomNav activeOverride="/embudos" />
      </KxScreen>
    </PhoneFrame>
  );
}
