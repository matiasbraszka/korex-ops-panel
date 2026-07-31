import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PhoneFrame, { KxScreen } from '../components/PhoneFrame';
import BottomNav from '../components/BottomNav';
import { Loading, useAsync } from '../components/ui';
import MediaViewer from '../components/MediaViewer';
import { api } from '../data/portalApi';
import { T, display } from '../components/theme';
import { IcoChevL, IcoPlay, IcoComment } from '../components/icons';

// LA CARPETA DEL EMBUDO — dos modos con la misma pantalla:
//   /entregables/:id                    → "Lo que editamos" (vsl_edit + ad_edit)
//   /entregables/:id?tipo=grabaciones   → "Tus grabaciones" (vsl_rec + ad_rec)
// El cliente ve el material real del sistema (miniatura de Bunny si hay), cada
// tarjeta abre el video/imagen en una pestaña nueva.
const gradientes = ['linear-gradient(160deg,#22262E,#0F1116)', 'linear-gradient(160deg,#242A34,#12151B)', 'linear-gradient(160deg,#1B2029,#0B0D11)'];

export default function EntregablesScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const esGrab = params.get('tipo') === 'grabaciones';
  const [ver, setVer] = useState(null);
  const { data, loading } = useAsync(() => api.carpetaEmbudo(id, esGrab ? 'grabaciones' : 'ediciones'), [id, esGrab]);

  if (loading) return <PhoneFrame><Loading label="Buscando tus videos…" /></PhoneFrame>;
  const items = Array.isArray(data?.items) ? data.items : [];
  const ads = items.filter((it) => it.bucket !== 'vsl_edit' && it.bucket !== 'vsl_rec');
  const vsl = items.filter((it) => it.bucket === 'vsl_edit' || it.bucket === 'vsl_rec');
  const funnel = data?.funnel || 'Tu embudo';

  const card = (it, i) => (
    <div key={i} role="button" onClick={() => it.url && setVer({ url: it.url, kind: it.kind || 'video', provider: it.provider, title: it.titulo })}
      style={{ display: 'block', cursor: it.url ? 'pointer' : 'default', background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: 'var(--shadow-md)', textDecoration: 'none' }}>
      <div style={{ height: 184, background: it.thumb ? `#0F1116 url(${it.thumb}) center/cover no-repeat` : gradientes[i % gradientes.length], display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <IcoPlay size={24} />
        </div>
      </div>
      <div style={{ padding: '15px 17px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo}</span>
          <span style={{ fontSize: 12.5, color: T.text3 }}>
            {esGrab
              ? (it.fecha ? `Lo recibimos el ${it.fecha}` : 'Recibido')
              : (it.fecha ? `Editado el ${it.fecha}` : 'Editado por el equipo')}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <PhoneFrame>
      <KxScreen>
        <div className="kxs" style={{ flex: 1, overflowY: 'auto' }}>
          <div onClick={() => nav(`/embudo/${id}`)} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px 0', color: T.primary, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <IcoChevL size={17} stroke="var(--mk-blue-ops)" sw={2.4} />
            {funnel}
          </div>

          <div style={{ padding: '16px 22px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={display(28, '-0.035em')}>{esGrab ? 'Tus grabaciones' : 'Lo que editamos'}</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.5, color: T.text2, textWrap: 'pretty' }}>
              {esGrab
                ? 'Los videos que nos enviaste para este embudo, tal como los recibimos.'
                : 'Tus grabaciones ya editadas, listas para publicar. Si algo no te gusta, dinos y lo cambiamos.'}
            </div>
          </div>

          <div style={{ padding: '24px 22px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {items.length === 0 && (
              <div style={{ background: '#fff', borderRadius: 20, padding: 22, textAlign: 'center', color: T.text2, fontSize: 14, boxShadow: 'var(--shadow-md)' }}>
                {esGrab
                  ? 'Todavía no hay grabaciones aquí. En cuanto subas las primeras, las ves en esta pantalla.'
                  : 'Todavía no hay videos editados aquí. En cuanto publiquemos los primeros, los ves en esta pantalla.'}
              </div>
            )}

            {ads.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3 }}>{funnel} · Anuncios</div>
                {ads.map(card)}
              </>
            )}
            {vsl.length > 0 && (
              <>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3, paddingTop: ads.length > 0 ? 6 : 0 }}>{funnel} · VSL</div>
                {vsl.map(card)}
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 17px', borderRadius: 16, background: T.surface2 }}>
              <IcoComment size={18} stroke="var(--mk-text2)" sw={2.1} />
              <span style={{ fontSize: 13, lineHeight: 1.45, color: T.textSoft, flex: 1 }}>
                {esGrab ? '¿Falta alguna toma o quieres reemplazar una? Súbela desde tus guiones o escríbenos.' : '¿Quieres cambiar algo de un video? Escríbenos y lo ajustamos.'}
              </span>
            </div>
          </div>
          <div style={{ height: 26 }} />
        </div>

        <BottomNav activeOverride="/embudos" />
        {ver && <MediaViewer item={ver} onClose={() => setVer(null)} />}
      </KxScreen>
    </PhoneFrame>
  );
}
