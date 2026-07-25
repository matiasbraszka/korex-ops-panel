import { useNavigate, useParams } from 'react-router-dom';
import PhoneFrame, { KxScreen } from '../components/PhoneFrame';
import BottomNav from '../components/BottomNav';
import { Loading, useAsync } from '../components/ui';
import { api } from '../data/portalApi';
import { T, display, pill } from '../components/theme';
import { IcoChevL, IcoChevR, IcoCheck, IcoInfo } from '../components/icons';

// EMBUDO (detalle) — exacta al prototipo: "Cómo va" con los 4 pasos y
// "Lo que necesitamos de este embudo" con el estado de cada cosa.
export default function EmbudoScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: embudos, loading: l1 } = useAsync(() => api.embudos(), [id]);
  const { data: material, loading: l2 } = useAsync(() => api.material(), [id]);
  const { data: inicio } = useAsync(() => api.inicio(), [id]);

  if (l1 || l2) return <PhoneFrame><Loading label="Abriendo el embudo…" /></PhoneFrame>;
  const e = (Array.isArray(embudos) ? embudos : []).find((x) => x.id === id);
  if (!e) return <PhoneFrame><div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>No encontramos este embudo.</div></PhoneFrame>;

  const alAire = e.etiqueta === 'al_aire';
  const pend = !!e.grabPendiente?.pend;
  const acento = alAire ? 'var(--mk-green)' : 'var(--mk-blue-ops)';
  const m = material || {};
  const grabs = (Array.isArray(m.grabaciones) ? m.grabaciones : []).filter((g) => g.strategyId === id);
  const grabsSubidas = grabs.length > 0 && grabs.every((g) => g.estado === 'subido');
  const devol = (Array.isArray(m.devoluciones) ? m.devoluciones : []).find((d) => d.strategyId === id);
  const marca = Array.isArray(m.marca) ? m.marca : [];
  const fotos = marca.find((x) => x.tipo === 'fotos') || marca[0];
  const accesoMeta = m.accesoMeta || 'sin_pedido';
  const metaPedido = (Array.isArray(inicio?.pendientes) ? inicio.pendientes : []).find((p) => p.tipo === 'acceso_meta');

  const resumen = alAire ? 'Está al aire. Nosotros seguimos optimizando los resultados.'
    : pend ? 'Falta que grabes tus anuncios. Todo lo demás de este embudo ya lo tenemos.'
    : grabsSubidas ? 'Ya tenemos todas tus grabaciones. Estamos editando y después lo publicamos.'
    : e.razon;

  const chip = (estado) => estado === 'subido' || estado === 'listo'
    ? <span style={pill('var(--mk-green-bg)', 'var(--mk-green)')}>Subido</span>
    : estado === 'validando'
    ? <span style={pill('var(--mk-blue-bg)', 'var(--mk-blue-ops)')}>Validando</span>
    : <span style={pill('var(--mk-red-bg)', 'var(--mk-red)')}>Falta</span>;

  return (
    <PhoneFrame>
      <KxScreen>
        <div className="kxs" style={{ flex: 1, overflowY: 'auto' }}>
          <div onClick={() => nav('/embudos')} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px 0', color: T.primary, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            <IcoChevL size={17} stroke="var(--mk-blue-ops)" sw={2.4} />
            Tus embudos
          </div>

          <div style={{ padding: '16px 22px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={display(28, '-0.035em')}>{e.name}</div>
              <span style={pill(alAire ? 'var(--mk-green-bg)' : 'var(--mk-purple-bg)', alAire ? 'var(--mk-green)' : 'var(--mk-purple)')}>{alAire ? 'Al aire' : 'En curso'}</span>
            </div>
            <div style={{ fontSize: 14.5, lineHeight: 1.5, color: T.text2, textWrap: 'pretty' }}>{resumen}</div>
          </div>

          {/* Avance */}
          <div style={{ padding: '22px 22px 0' }}>
            <div style={{ background: '#fff', border: '1px solid var(--mk-border)', borderRadius: 20, padding: 20, boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3 }}>Avance de este embudo</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.textSoft }}>{e.razon}</span>
                </div>
                <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 38, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: acento }}>{e.progreso}%</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: T.surface2, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, background: acento, transition: 'width .35s ease', width: `${e.progreso}%` }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '12px 14px', borderRadius: 14, background: pend ? 'var(--mk-red-bg)' : 'var(--mk-green-bg)' }}>
                <IcoInfo size={16} stroke="var(--mk-text2)" sw={2.1} style={{ flex: 'none', marginTop: 1 }} />
                <span style={{ fontSize: 12.5, lineHeight: 1.45, color: T.textSoft, flex: 1 }}>
                  {pend ? 'Este número sube cuando subes el material que falta. Sin eso no podemos seguir.' : 'Ya entregaste todo lo de este embudo. De aquí en adelante avanzamos nosotros.'}
                </span>
              </div>
            </div>
          </div>

          {/* Cómo va */}
          <div style={{ padding: '26px 22px 0' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 19, fontWeight: 800, letterSpacing: '-0.028em', color: T.ink, marginBottom: 14 }}>Cómo va</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* 1 · Estrategia y guiones */}
              <div style={pasoCard()}>
                <div style={pasoHead}>
                  {e.etapa >= 2 ? <PasoCheck /> : <PasoNum n={1} bg="var(--mk-blue-ops)" />}
                  <div style={pasoBody}>
                    <span style={pasoTitulo}>Estrategia y guiones</span>
                    <span style={pasoEstado}>{e.etapa >= 2 ? 'Terminado' : 'Estamos con esto ahora'}</span>
                  </div>
                </div>
                {e.etapa >= 2 && (
                  <div onClick={() => nav(`/documento/${id}/estrategia`)} role="button" style={{ cursor: 'pointer', height: 42, borderRadius: 999, border: '1px solid var(--mk-border)', background: '#fff', color: T.textSoft, fontSize: 11.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    Ver la estrategia y los guiones
                    <IcoChevR size={14} stroke="currentColor" sw={2.4} />
                  </div>
                )}
              </div>

              {/* 2 · Grabación */}
              <div style={pasoCard(pend ? 'var(--mk-blue-ops)' : null)}>
                <div style={pasoHead}>
                  {grabsSubidas || e.etapa >= 3 ? <PasoCheck /> : <PasoNum n={2} bg={pend ? 'var(--mk-blue-ops)' : 'var(--mk-surface3)'} ink={pend ? '#fff' : 'var(--mk-text2)'} />}
                  <div style={pasoBody}>
                    <span style={pasoTitulo}>Grabación</span>
                    <span style={pasoEstado}>{grabsSubidas || e.etapa >= 3 ? 'Recibimos tus videos' : pend ? 'Te toca a ti' : 'Después de los guiones'}</span>
                  </div>
                </div>
                {(pend || grabsSubidas || e.etapa >= 3) && (
                  <div onClick={() => nav(`/documento/${id}/ads`)} role="button" style={{ cursor: 'pointer', height: 44, borderRadius: 999, background: grabsSubidas || e.etapa >= 3 ? 'var(--mk-green)' : 'var(--mk-blue-ops)', color: '#fff', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {grabsSubidas || e.etapa >= 3 ? 'Ver tus grabaciones' : 'Grabar mis anuncios'}
                    <IcoChevR size={14} stroke="#fff" sw={2.4} />
                  </div>
                )}
              </div>

              {/* 3 · Edición */}
              <div style={pasoCard()}>
                <div style={pasoHead}>
                  {e.etapa >= 4 ? <PasoCheck /> : <PasoNum n={3} bg={e.etapa >= 3 ? 'var(--mk-blue-ops)' : 'var(--mk-surface3)'} ink={e.etapa >= 3 ? '#fff' : 'var(--mk-text2)'} />}
                  <div style={pasoBody}>
                    <span style={pasoTitulo}>Edición</span>
                    <span style={pasoEstado}>
                      {e.etapa >= 4 ? 'Terminada' : e.etapa >= 3 ? (devol ? 'Estamos editando · hay videos listos' : 'Estamos editando tus videos') : 'Arranca cuando recibamos tus videos'}
                    </span>
                  </div>
                </div>
                {devol && (
                  <div onClick={() => nav(`/entregables/${id}`)} role="button" style={{ cursor: 'pointer', height: 44, borderRadius: 999, background: T.ink, color: '#fff', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    Ver lo que editamos
                    <IcoChevR size={14} stroke="#fff" sw={2.4} />
                  </div>
                )}
              </div>

              {/* 4 · Publicado */}
              <div style={{ ...pasoCard(), opacity: alAire ? 1 : 0.72, flexDirection: 'row', alignItems: 'center', gap: 12, display: 'flex' }}>
                {alAire ? <PasoCheck /> : <PasoNum n={4} bg="var(--mk-surface3)" ink="var(--mk-text2)" />}
                <div style={pasoBody}>
                  <span style={pasoTitulo}>Publicado</span>
                  <span style={pasoEstado}>{alAire ? (e.pagina ? String(e.pagina).replace(/^https?:\/\//, '') : 'Al aire') : 'Cuando esté al aire lo vas a ver aquí'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Lo que necesitamos de este embudo */}
          {(grabs.length > 0 || fotos || accesoMeta !== 'sin_pedido') && (
            <div style={{ padding: '30px 22px 0' }}>
              <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 19, fontWeight: 800, letterSpacing: '-0.028em', color: T.ink, marginBottom: 6 }}>Lo que necesitamos de este embudo</div>
              <div style={{ fontSize: 13, lineHeight: 1.5, color: T.text2, marginBottom: 14 }}>Las grabaciones se organizan por avatar: cada avatar tiene sus anuncios y su VSL.</div>

              <div style={{ background: '#fff', borderRadius: 20, padding: '6px 4px', boxShadow: 'var(--shadow-md)' }}>
                {grabs.length > 0 && (
                  <>
                    <div style={{ padding: '12px 16px 6px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3 }}>Tus grabaciones</div>
                    {grabs.map((g, i) => (
                      <div key={i} onClick={() => nav(`/documento/${id}/${g.tipo}`, { state: { uploader: true } })} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{g.titulo}</span>
                          <span style={{ fontSize: 12.5, color: T.text3 }}>{g.estado === 'subido' ? (g.ultimo || 'Recibido') : g.tipo === 'vsl' ? 'El video largo, en una toma' : 'Uno por cada guion de anuncio'}</span>
                          {g.estado !== 'subido' && g.dias != null && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--mk-orange)' }}>Pedido {g.dias === 0 ? 'hoy' : `hace ${g.dias} ${g.dias === 1 ? 'día' : 'días'}`}</span>}
                        </div>
                        {chip(g.estado)}
                      </div>
                    ))}
                    <div style={{ height: 1, background: '#EEF0F4', margin: '6px 12px' }} />
                  </>
                )}
                <div style={{ padding: '10px 16px 6px', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3 }}>Del embudo</div>
                {fotos && (
                  <div onClick={() => nav(`/pedido/${fotos.id}`, { state: { pedido: fotos } })} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{String(fotos.titulo || 'Fotos tuyas').replace(/^Sube /, '').replace(/^./, (c) => c.toUpperCase())}</span>
                      <span style={{ fontSize: 12.5, color: T.text3 }}>{fotos.target ? `${fotos.subidos ?? 0} de ${fotos.target} subidas` : `${fotos.subidos ?? 0} archivos`}</span>
                      {fotos.estado === 'pendiente' && fotos.dias != null && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--mk-orange)' }}>Pedido {fotos.dias === 0 ? 'hoy' : `hace ${fotos.dias} ${fotos.dias === 1 ? 'día' : 'días'}`}</span>}
                    </div>
                    {chip(fotos.estado === 'completo' || fotos.estado === 'validado' ? 'subido' : 'falta')}
                  </div>
                )}
                {accesoMeta !== 'sin_pedido' && (
                  <div onClick={() => nav('/meta')} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>Acceso a Meta</span>
                      <span style={{ fontSize: 12.5, color: T.text3 }}>{accesoMeta === 'validado' ? 'Acceso confirmado' : accesoMeta === 'cliente_dice_listo' ? 'Lo estamos validando' : 'Sin esto no podemos publicar'}</span>
                      {accesoMeta === 'pendiente' && metaPedido?.dias != null && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--mk-orange)' }}>Pedido {metaPedido.dias === 0 ? 'hoy' : `hace ${metaPedido.dias} ${metaPedido.dias === 1 ? 'día' : 'días'}`}</span>}
                    </div>
                    {chip(accesoMeta === 'validado' ? 'listo' : accesoMeta === 'cliente_dice_listo' ? 'validando' : 'falta')}
                  </div>
                )}
              </div>
            </div>
          )}
          <div style={{ height: 26 }} />
        </div>

        <BottomNav activeOverride="/embudos" />
      </KxScreen>
    </PhoneFrame>
  );
}

const pasoCard = (borde) => ({ background: '#fff', borderRadius: 18, padding: '16px 18px', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 12, border: `1px solid ${borde || 'transparent'}` });
const pasoHead = { display: 'flex', alignItems: 'center', gap: 12 };
const pasoBody = { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 };
const pasoTitulo = { fontSize: 15.5, fontWeight: 700, color: 'var(--mk-ink)' };
const pasoEstado = { fontSize: 12.5, color: 'var(--mk-text3)' };

function PasoCheck() {
  return (
    <div style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: 'var(--mk-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <IcoCheck size={15} stroke="#fff" sw={3} />
    </div>
  );
}
function PasoNum({ n, bg, ink = '#fff' }) {
  return (
    <div style={{ width: 26, height: 26, flex: 'none', borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: ink }}>{n}</div>
  );
}
