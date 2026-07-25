import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { T, display, pill } from '../components/theme';
import { IcoVideo, IcoImage, IcoKey, IcoCheck, IcoFolder } from '../components/icons';

// TU MATERIAL — exacta al prototipo: secciones con título afuera de la tarjeta
// (Tus grabaciones · Materiales de marca · Accesos · Lo que te devolvemos),
// filas con chips SUBIDO/FALTA y "Pedido hace N días" en naranja.
export default function MaterialScreen() {
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.material(), []);

  // Al abrir Material, marcamos "visto": los NUEVO de esta visita se apagan para la próxima.
  useEffect(() => { if (data) api.materialVisto().catch(() => {}); }, [data]);

  if (loading) return <Loading label="Cargando tu material…" />;
  const d = data || {};
  const grab = Array.isArray(d.grabaciones) ? d.grabaciones : [];
  const marca = Array.isArray(d.marca) ? d.marca : [];
  const devol = Array.isArray(d.devoluciones) ? d.devoluciones : [];
  const faltan = grab.filter((g) => g.estado === 'falta').length
    + marca.filter((m) => m.estado === 'pendiente' || m.estado === 'cliente_dice_listo').length
    + (d.accesoMeta === 'pendiente' ? 1 : 0);

  // Grabaciones agrupadas por embudo.
  const porFunnel = [];
  for (const g of grab) {
    let f = porFunnel.find((x) => x.funnel === g.funnel);
    if (!f) { f = { funnel: g.funnel, items: [] }; porFunnel.push(f); }
    f.items.push(g);
  }

  const chipSubido = <span style={pill('var(--mk-green-bg)', 'var(--mk-green)')}>Subido</span>;
  const chipFalta = <span style={pill('var(--mk-red-bg)', 'var(--mk-red)')}>Falta</span>;

  return (
    <>
      {isDemo() && <div style={{ padding: '12px 22px 0' }}><DemoBanner /></div>}
      <div style={{ padding: '22px 22px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={display(30, '-0.035em')}>Tu material</div>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: T.text2, textWrap: 'pretty' }}>
          {faltan === 0 ? 'Todo lo que necesitábamos de ti ya está aquí.' : `Todo lo que necesitamos de ti, en un solo lugar. Nos ${faltan === 1 ? 'falta 1' : `faltan ${faltan}`}.`}
        </div>
      </div>

      <div style={{ padding: '26px 22px 0', display: 'flex', flexDirection: 'column', gap: 26 }}>

        {/* Tus grabaciones: UNA tarjeta por embudo, con sus carpetas adentro */}
        {porFunnel.length > 0 && (
          <div style={seccion}>
            <div style={secHead}>
              <IcoVideo size={19} stroke="var(--mk-blue-ops)" sw={2.1} />
              <span style={secTitulo}>Tus grabaciones</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: T.text2, margin: '-4px 0 2px' }}>Cada embudo tiene sus carpetas: una para los anuncios y otra para el VSL.</div>
            {porFunnel.map((f) => (
              <div key={f.funnel} style={cardLista}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 4px' }}>
                  <IcoFolder size={14} stroke="var(--mk-blue-ops)" sw={2.2} />
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mk-blue-ops)' }}>{f.funnel}</span>
                </div>
                {f.items.map((g, i) => (
                  <div key={i} onClick={() => nav(`/documento/${g.strategyId}/${g.tipo}`)} role="button" style={{ ...fila, borderTop: i > 0 ? '1px solid #EEF0F4' : 'none' }}>
                    <CarpetaTile lleno={g.estado === 'subido'} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={filaTitulo}>{g.titulo}</span>
                      <span style={filaSub}>
                        {g.estado === 'subido'
                          ? (g.subidos > 0 ? (g.ultimo || `${g.subidos} ${g.subidos === 1 ? 'video' : 'videos'}`) : 'Recibido · ya está en edición')
                          : g.tipo === 'vsl' ? 'El video largo, en una toma' : 'Uno por cada guion de anuncio'}
                      </span>
                      {g.estado !== 'subido' && g.dias != null && <span style={filaNaranja}>Pedido {g.dias === 0 ? 'hoy' : `hace ${g.dias} ${g.dias === 1 ? 'día' : 'días'}`}</span>}
                    </div>
                    {g.estado === 'subido' ? chipSubido : chipFalta}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Materiales de marca */}
        {marca.length > 0 && (
          <div style={seccion}>
            <div style={secHead}>
              <IcoImage size={19} stroke="var(--mk-blue-ops)" sw={2.1} />
              <span style={secTitulo}>Materiales de marca</span>
            </div>
            <div style={cardLista}>
              {marca.map((m, mi) => {
                const completo = m.estado === 'completo' || m.estado === 'validado';
                const n = m.subidos ?? 0;
                return (
                  <div key={m.id} onClick={() => nav(`/pedido/${m.id}`, { state: { pedido: m } })} role="button" style={{ ...fila, padding: '14px 16px', borderTop: mi > 0 ? '1px solid #EEF0F4' : 'none' }}>
                    <CarpetaTile lleno={n > 0} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={filaTitulo}>{String(m.titulo || '').replace(/^Sube /, '').replace(/^./, (c) => c.toUpperCase())}</span>
                      <span style={filaSub}>{m.target ? `${Math.min(n, m.target)} de ${m.target} subidas${n > m.target ? ` (¡nos diste ${n}!)` : ''}` : `${n} ${n === 1 ? 'archivo' : 'archivos'}`}</span>
                      {!completo && m.dias != null && <span style={filaNaranja}>Pedido {m.dias === 0 ? 'hoy' : `hace ${m.dias} ${m.dias === 1 ? 'día' : 'días'}`}</span>}
                    </div>
                    {completo ? chipSubido : chipFalta}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Accesos */}
        {d.accesoMeta !== 'sin_pedido' && (
          <div style={seccion}>
            <div style={secHead}>
              <IcoKey size={19} stroke="var(--mk-blue-ops)" sw={2.1} />
              <span style={secTitulo}>Accesos</span>
            </div>
            <div style={cardLista}>
              <div onClick={() => nav('/meta')} role="button" style={{ ...fila, padding: '14px 16px' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={filaTitulo}>Meta Business</span>
                  <span style={filaSub}>{d.accesoMeta === 'validado' ? 'Acceso confirmado' : d.accesoMeta === 'cliente_dice_listo' ? 'Lo estamos validando' : 'Sin esto no podemos publicar'}</span>
                </div>
                {d.accesoMeta === 'validado' ? <span style={pill('var(--mk-green-bg)', 'var(--mk-green)')}>Listo</span>
                  : d.accesoMeta === 'cliente_dice_listo' ? <span style={pill('var(--mk-blue-bg)', 'var(--mk-blue-ops)')}>Validando</span>
                  : chipFalta}
              </div>
            </div>
          </div>
        )}

        {/* Lo que te devolvemos (las páginas al aire ya se ven en Embudos) */}
        {devol.length > 0 && (
          <div style={seccion}>
            <div style={secHead}>
              <IcoCheck size={19} stroke="var(--mk-green)" sw={2.1} />
              <span style={secTitulo}>Lo que te devolvemos</span>
            </div>
            <div style={cardLista}>
              {devol.map((dv, i) => (
                <div key={i} onClick={() => nav(`/entregables/${dv.strategyId}`)} role="button" style={{ ...fila, padding: '14px 16px' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span style={filaTitulo}>Anuncios y VSL editados</span>
                    <span style={filaSub}>{dv.funnel} · {dv.count} {dv.count === 1 ? 'archivo' : 'archivos'}</span>
                  </div>
                  {dv.nuevo && <span style={pill('var(--mk-blue-bg)', 'var(--mk-blue-ink)')}>Nuevo</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '26px 22px 20px', fontSize: 12.5, lineHeight: 1.5, color: T.text3, textAlign: 'center' }}>
        ¿No sabes qué es algo de esto? Escríbenos y te lo explicamos.
      </div>
    </>
  );
}

// Tile de carpeta: roja si está vacía (falta contenido), verde si ya tiene.
function CarpetaTile({ lleno }) {
  return (
    <div style={{ width: 40, height: 40, flex: 'none', borderRadius: 12, background: lleno ? 'var(--mk-green-bg)' : 'var(--mk-red-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <IcoFolder size={18} stroke={lleno ? 'var(--mk-green)' : 'var(--mk-red)'} sw={2.1} />
    </div>
  );
}

const seccion = { display: 'flex', flexDirection: 'column', gap: 12 };
const secHead = { display: 'flex', alignItems: 'center', gap: 10 };
const secTitulo = { fontFamily: "'Montserrat', sans-serif", fontSize: 19, fontWeight: 800, letterSpacing: '-0.028em', color: 'var(--mk-ink)' };
const cardLista = { background: '#fff', borderRadius: 20, padding: '6px 4px', boxShadow: 'var(--shadow-md)' };
const fila = { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' };
const filaTitulo = { fontSize: 15, fontWeight: 600, color: 'var(--mk-text)' };
const filaSub = { fontSize: 12.5, color: 'var(--mk-text3)' };
const filaNaranja = { fontSize: 12, fontWeight: 600, color: 'var(--mk-orange)' };
