import { useNavigate, useParams } from 'react-router-dom';
import PhoneFrame, { KxScreen } from '../components/PhoneFrame';
import BottomNav from '../components/BottomNav';
import { Loading, useAsync } from '../components/ui';
import { api } from '../data/portalApi';
import { T, display, pill } from '../components/theme';
import { IcoChevL, IcoChevR, IcoCheck } from '../components/icons';

// EMBUDO (detalle) — exacta al prototipo: "Cómo va" con los 4 pasos y
// "Lo que necesitamos de este embudo" con el estado de cada cosa.
export default function EmbudoScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: embudos, loading: l1 } = useAsync(() => api.embudos(), [id]);
  const { data: material, loading: l2 } = useAsync(() => api.material(), [id]);
  const { data: inicio } = useAsync(() => api.inicio(), [id]);
  const { data: optMap } = useAsync(() => api.optimizacion(), [id]);

  if (l1 || l2) return <PhoneFrame><Loading label="Abriendo el embudo…" /></PhoneFrame>;
  const e = (Array.isArray(embudos) ? embudos : []).find((x) => x.id === id);
  if (!e) return <PhoneFrame><div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>No encontramos este embudo.</div></PhoneFrame>;

  const alAire = e.etiqueta === 'al_aire';
  const pend = !!e.grabPendiente?.pend;
  const completo = e.etiqueta === 'completo';   // embudo viejo/entregado (status 'antiguo')
  const terminado = alAire || completo;          // estados "verdes" (nada pendiente)
  const acento = terminado ? 'var(--mk-green)' : 'var(--mk-blue-ops)';
  const opt = optMap?.[id];
  const m = material || {};
  const grabs = (Array.isArray(m.grabaciones) ? m.grabaciones : []).filter((g) => g.strategyId === id);
  const grabsSubidas = grabs.length > 0 && grabs.every((g) => g.estado === 'subido');
  // "Grabación recibida" solo si el freno NO la marca pendiente. Así el detalle
  // nunca dice "recibimos tus videos" mientras el avance sigue trabado por grabar.
  const grabRecibida = !pend && (grabsSubidas || e.etapa >= 3);
  const devol = (Array.isArray(m.devoluciones) ? m.devoluciones : []).find((d) => d.strategyId === id);
  const marca = Array.isArray(m.marca) ? m.marca : [];
  const fotos = marca.find((x) => x.tipo === 'fotos') || marca[0];
  const accesoMeta = m.accesoMeta || 'sin_pedido';
  const metaPedido = (Array.isArray(inicio?.pendientes) ? inicio.pendientes : []).find((p) => p.tipo === 'acceso_meta');

  // Fechas de entrega por etapa (DD/MM, null si esa etapa no tiene material en el sistema).
  const fe = e.fechas || {};
  const conFecha = (texto, fecha) => fecha ? `${texto} · ${fecha}` : texto;

  const resumen = completo ? 'Este embudo ya está terminado. Fue parte de una etapa anterior de tu proyecto.'
    : alAire ? 'Está al aire. Nosotros seguimos optimizando los resultados.'
    : pend ? 'Falta que grabes tus anuncios. Todo lo demás de este embudo ya lo tenemos.'
    : grabRecibida ? 'Ya tenemos todas tus grabaciones. Estamos editando y después lo publicamos.'
    : e.razon;

  const chip = (estado) => estado === 'subido' || estado === 'listo'
    ? <span style={pill('var(--mk-green-bg)', 'var(--mk-green)')}>Subido</span>
    : estado === 'validando'
    ? <span style={pill('var(--mk-blue-bg)', 'var(--mk-blue-ops)')}>Validando</span>
    : <span style={pill('var(--mk-red-bg)', 'var(--mk-red)')}>Falta</span>;

  // Los 4 pasos del recorrido del cliente (para el timeline vertical): qué hicimos
  // (Estrategia/guiones · Grabación · Edición · Publicado), en qué estamos y el botón.
  // Todos los botones del recorrido van del MISMO color (el acento del embudo),
  // para no ensuciar la pantalla con negro/azul/blanco mezclados.
  const btnGrab = grabRecibida
    ? { label: 'Ver tus grabaciones', onClick: () => nav(`/entregables/${id}?tipo=grabaciones`) }
    : pend ? { label: 'Grabar mis anuncios', onClick: () => nav(`/documento/${id}/ads`) }
    : null;
  const timelineSteps = [
    { num: 1, titulo: 'Estrategia y guiones',
      estado: e.etapa >= 2 ? conFecha('Terminado', fe.guiones) : 'Estamos con esto ahora',
      state: e.etapa >= 2 ? 'done' : 'current',
      boton: e.etapa >= 2 ? { label: 'Ver la estrategia y los guiones', onClick: () => nav(`/documento/${id}/estrategia`) } : null },
    { num: 2, titulo: 'Grabación',
      estado: grabRecibida ? conFecha('Recibimos tus videos', fe.grabacion) : pend ? 'Te toca a ti' : 'Después de los guiones',
      state: grabRecibida ? 'done' : (pend || e.etapa >= 2 ? 'current' : 'pending'),
      boton: btnGrab },
    { num: 3, titulo: 'Edición',
      estado: e.etapa >= 4 ? conFecha('Terminada', fe.edicion) : e.etapa >= 3 ? (devol ? 'Estamos editando · hay videos listos' : 'Estamos editando tus videos') : 'Arranca cuando recibamos tus videos',
      state: e.etapa >= 4 ? 'done' : (e.etapa >= 3 ? 'current' : 'pending'),
      boton: (devol || e.etapa >= 4) ? { label: 'Ver lo que editamos', onClick: () => nav(`/entregables/${id}`) } : null },
    { num: 4, titulo: 'Publicado',
      estado: alAire ? (fe.publicado ? `Al aire desde el ${fe.publicado}` : 'Al aire') : 'Cuando esté al aire lo vas a ver aquí',
      state: alAire ? 'done' : 'pending',
      boton: (alAire && e.pagina) ? { label: 'Ver tu página', href: /^https?:\/\//.test(e.pagina) ? e.pagina : `https://${e.pagina}` } : null },
  ].map((s) => s.boton ? { ...s, boton: { ...s.boton, bg: acento, color: '#fff' } } : s);

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
              <span style={pill(terminado ? 'var(--mk-green-bg)' : 'var(--mk-purple-bg)', terminado ? 'var(--mk-green)' : 'var(--mk-purple)')}>{completo ? 'Completo' : alAire ? 'Al aire' : 'En curso'}</span>
            </div>
            <div style={{ fontSize: 14.5, lineHeight: 1.5, color: T.text2, textWrap: 'pretty' }}>{resumen}</div>
          </div>

          {/* Avance */}
          <div style={{ padding: '22px 22px 0' }}>
            <div style={{ background: '#fff', border: '1px solid var(--mk-border)', borderRadius: 20, padding: 20, boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3 }}>Avance de este embudo</span>
                <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 38, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: acento }}>{e.progreso}%</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: T.surface2, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, background: acento, transition: 'width .35s ease', width: `${e.progreso}%` }} />
              </div>
            </div>
          </div>

          {/* Cómo va — timeline vertical: qué entregamos, en qué paso estamos.
              La Optimización va como un paso más del mismo roadmap (al final). */}
          <div style={{ padding: '26px 22px 0' }}>
            <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 19, fontWeight: 800, letterSpacing: '-0.028em', color: T.ink, marginBottom: 16 }}>Cómo va</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {timelineSteps.map((s, i) => <TimelineRow key={i} s={s} last={!opt && i === timelineSteps.length - 1} />)}
              {opt && <OptTimelineRow opt={opt} id={id} nav={nav} />}
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

// ── Fase de optimización (embudo ya lanzado): anuncios de más + lo nuevo que
//    le pedimos, con sus demoras. No toca el 100%. ──
const statNum = { fontFamily: "'Montserrat', sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--mk-ink)' };
const statLbl = { fontSize: 11.5, fontWeight: 600, color: 'var(--mk-text3)', lineHeight: 1.3 };

// Optimización como ÚLTIMO paso del roadmap: un nodo verde más en la misma línea
// de tiempo, con los anuncios de más y lo nuevo que le pedimos (sin tocar el 100%).
function OptTimelineRow({ opt, id, nav }) {
  const pend = Array.isArray(opt.pendientes) ? opt.pendientes : [];
  const atraso = pend.reduce((m, p) => Math.max(m, p.dias || 0), 0);
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      {/* Riel: nodo verde de optimización (último, sin conector) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 30, flex: 'none' }}>
        <div style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: 'var(--mk-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 800 }}>✨</div>
      </div>
      {/* Contenido */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '15px 16px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--mk-green-bg)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--mk-ink)' }}>Optimización</span>
              <span style={pill('var(--mk-green-bg)', 'var(--mk-green)')}>Al aire</span>
            </div>
            <span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--mk-text3)' }}>Tu embudo ya está entregado al 100%. Acá lo seguimos mejorando con anuncios nuevos.</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={optTile}>
              <span style={statNum}>{opt.entregados ?? 0}</span>
              <span style={statLbl}>anuncios entregados{opt.target ? ` de ${opt.target}` : ''}</span>
            </div>
            <div style={{ ...optTile, background: 'var(--mk-green-bg)' }}>
              <span style={{ ...statNum, color: 'var(--mk-green)' }}>+{opt.extras ?? 0}</span>
              <span style={statLbl}>de más (optimización)</span>
            </div>
          </div>

          {pend.length > 0 && (
            <div style={{ background: 'var(--mk-bg-panel)', borderRadius: 14, padding: '4px 2px' }}>
              <div style={{ padding: '10px 14px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3 }}>Lo nuevo que te pedimos</span>
                {atraso > 0 && <span style={pill('var(--mk-red-bg)', 'var(--mk-red)')}>Demora {atraso} {atraso === 1 ? 'día' : 'días'}</span>}
              </div>
              {pend.map((p, i) => (
                <div key={i} onClick={() => nav('/guiones')} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titulo}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: (p.dias > 3) ? 'var(--mk-red)' : 'var(--mk-orange)' }}>
                      {p.tipo === 'revisar' ? 'Revisar' : 'Grabar'} · {p.dias === 0 ? 'pedido hoy' : `hace ${p.dias} ${p.dias === 1 ? 'día' : 'días'}`}
                    </span>
                  </div>
                  <IcoChevR size={16} stroke={T.text3} sw={2.2} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
const optTile = { background: 'var(--mk-bg-panel)', borderRadius: 13, padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 3 };

// Botón de un paso (relleno o "ghost" con borde).
const botonStyle = (b) => ({
  cursor: 'pointer', height: 42, borderRadius: 999,
  background: b.variant === 'ghost' ? '#fff' : (b.bg || 'var(--mk-blue-ops)'),
  color: b.variant === 'ghost' ? 'var(--mk-text-soft)' : (b.color || '#fff'),
  border: b.variant === 'ghost' ? '1px solid var(--mk-border)' : 'none',
  fontSize: 11.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none',
});

// Una fila del timeline: rieles (nodo + línea) + tarjeta del paso.
function TimelineRow({ s, last }) {
  const done = s.state === 'done';
  const current = s.state === 'current';
  const nodeBg = done ? 'var(--mk-green)' : current ? 'var(--mk-blue-ops)' : 'var(--mk-surface3)';
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      {/* Riel: nodo + conector */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 30, flex: 'none' }}>
        <div style={{ width: 30, height: 30, flex: 'none', borderRadius: '50%', background: nodeBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: (done || current) ? '#fff' : 'var(--mk-text2)', fontSize: 13, fontWeight: 800, boxShadow: current ? '0 0 0 4px var(--mk-blue-bg)' : 'none' }}>
          {done ? <IcoCheck size={16} stroke="#fff" sw={3} /> : s.num}
        </div>
        {!last && <div style={{ flex: 1, width: 2, minHeight: 26, background: done ? 'var(--mk-green)' : 'var(--mk-border)', margin: '6px 0', borderRadius: 2 }} />}
      </div>
      {/* Contenido */}
      <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 4 : 18, opacity: s.state === 'pending' ? 0.7 : 1 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '13px 16px', boxShadow: 'var(--shadow-md)', border: current ? '1px solid var(--mk-blue-ops)' : '1px solid transparent', display: 'flex', flexDirection: 'column', gap: s.boton ? 12 : 3 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--mk-ink)' }}>{s.titulo}</span>
              {current && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mk-blue-ops)', background: 'var(--mk-blue-bg)', padding: '3px 8px', borderRadius: 999 }}>Ahora</span>}
              {done && <IcoCheck size={14} stroke="var(--mk-green)" sw={3} />}
            </div>
            <span style={{ fontSize: 12.5, color: 'var(--mk-text3)' }}>{s.estado}</span>
          </div>
          {s.boton && (s.boton.href
            ? <a href={s.boton.href} target="_blank" rel="noreferrer" style={botonStyle(s.boton)}>{s.boton.label}<IcoChevR size={14} stroke="currentColor" sw={2.4} /></a>
            : <div onClick={s.boton.onClick} role="button" style={botonStyle(s.boton)}>{s.boton.label}<IcoChevR size={14} stroke="currentColor" sw={2.4} /></div>)}
        </div>
      </div>
    </div>
  );
}
