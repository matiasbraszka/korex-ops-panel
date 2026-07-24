import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Film, Camera, KeyRound, Sparkles, ExternalLink } from 'lucide-react';
import { Screen, Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { T, cardStyle, microLabel, pill } from '../components/theme';

// TU MATERIAL: todo lo que necesitamos del cliente en un solo lugar —
// grabaciones por embudo, materiales de marca (X de Y), accesos y lo que
// le devolvemos (ediciones publicadas, con badge NUEVO).
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
  const paginas = Array.isArray(d.paginas) ? d.paginas : [];
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

  return (
    <Screen style={{ background: T.bg }}>
      {isDemo() && <DemoBanner />}
      <h1 style={{ margin: '4px 0 6px', fontSize: 26, fontWeight: 800, color: T.ink, letterSpacing: '-0.03em' }}>Tu material</h1>
      <p style={{ margin: '0 0 18px', fontSize: 15, color: T.text2, lineHeight: 1.45 }}>
        Todo lo que necesitamos de ti, en un solo lugar.{faltan > 0 ? ` Nos ${faltan === 1 ? 'falta 1' : `faltan ${faltan}`}.` : ' Está todo. 🎉'}
      </p>

      {/* Tus grabaciones */}
      {porFunnel.length > 0 && (
        <Seccion titulo="Tus grabaciones" sub="Se organizan por embudo.">
          {porFunnel.map((f) => (
            <div key={f.funnel} style={{ marginBottom: 6 }}>
              <div style={{ ...microLabel(), margin: '10px 2px 6px' }}>{f.funnel}</div>
              {f.items.map((g, i) => (
                <Fila key={i} Icon={Film}
                  titulo={g.titulo}
                  sub={g.estado === 'subido' ? (g.ultimo || `${g.subidos} ${g.subidos === 1 ? 'video' : 'videos'}`) : `Pedido ${g.dias === 0 ? 'hoy' : `hace ${g.dias} ${g.dias === 1 ? 'día' : 'días'}`}`}
                  estado={g.estado === 'subido' ? 'subido' : 'falta'}
                  onClick={() => nav(`/documento/${g.strategyId}/${g.tipo}`)} />
              ))}
            </div>
          ))}
        </Seccion>
      )}

      {/* Materiales de marca */}
      {marca.length > 0 && (
        <Seccion titulo="Materiales de marca">
          {marca.map((m) => {
            const completo = m.estado === 'completo' || m.estado === 'validado';
            return (
              <Fila key={m.id} Icon={Camera}
                titulo={m.titulo.replace(/^Sube /, '').replace(/^./, (c) => c.toUpperCase())}
                sub={m.target ? `${m.subidos ?? 0} de ${m.target} subidas` : (completo ? `${m.subidos} archivos` : `Pedido hace ${m.dias} días`)}
                estado={completo ? 'subido' : 'falta'}
                onClick={() => nav(`/pedido/${m.id}`, { state: { pedido: m } })} />
            );
          })}
        </Seccion>
      )}

      {/* Accesos */}
      {d.accesoMeta !== 'sin_pedido' && (
        <Seccion titulo="Accesos">
          <Fila Icon={KeyRound} titulo="Meta Business"
            sub={d.accesoMeta === 'validado' ? 'Acceso confirmado' : d.accesoMeta === 'cliente_dice_listo' ? 'Lo estamos validando' : 'Sin esto no podemos publicar'}
            estado={d.accesoMeta === 'validado' ? 'subido' : d.accesoMeta === 'cliente_dice_listo' ? 'validando' : 'falta'}
            onClick={() => nav('/meta')} />
        </Seccion>
      )}

      {/* Lo que te devolvemos */}
      {devol.length > 0 && (
        <Seccion titulo="Lo que te devolvemos" sub="Tus videos ya editados por el equipo.">
          {devol.map((dv, i) => (
            <div key={i} style={{ padding: '10px 0', borderTop: '1px solid #F0F2F5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, background: T.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Sparkles size={18} color={T.green} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>Anuncios y VSL editados</div>
                  <div style={{ fontSize: 12.5, color: T.text3 }}>{dv.funnel} · {dv.count} {dv.count === 1 ? 'archivo' : 'archivos'} · {dv.ultimo}</div>
                </div>
                {dv.nuevo && <span style={pill(T.primary, '#fff')}>Nuevo</span>}
              </div>
              {(dv.items || []).slice(0, 4).map((it, j) => (
                <a key={j} href={it.url || '#'} target={it.url ? '_blank' : undefined} rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 0 50px', fontSize: 13, fontWeight: 600, color: T.primary, textDecoration: 'none' }}>
                  <Film size={13} /><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo}</span>
                </a>
              ))}
            </div>
          ))}
        </Seccion>
      )}

      {/* Tus páginas */}
      {paginas.length > 0 && (
        <Seccion titulo="Tus páginas al aire">
          {paginas.map((p, i) => (
            <a key={i} href={/^https?:\/\//.test(p.url) ? p.url : 'https://' + p.url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid #F0F2F5', textDecoration: 'none' }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: T.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><ExternalLink size={16} color={T.green} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>{p.funnel}</div>
                <div style={{ fontSize: 12.5, color: T.green, fontWeight: 700 }}>{String(p.url).replace(/^https?:\/\//, '')}</div>
              </div>
              <ChevronRight size={17} color="#C4C9D4" />
            </a>
          ))}
        </Seccion>
      )}

      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 12.5, color: T.text3 }}>
        ¿No sabes qué es algo de esto? Escríbenos y te lo explicamos.
      </div>
    </Screen>
  );
}

function Seccion({ titulo, sub, children }) {
  return (
    <div style={{ ...cardStyle, padding: '14px 16px', marginBottom: 14 }}>
      <div style={{ fontSize: 16.5, fontWeight: 800, color: T.ink }}>{titulo}</div>
      {sub && <div style={{ fontSize: 12.5, color: T.text3, marginTop: 2, marginBottom: 4 }}>{sub}</div>}
      {children}
    </div>
  );
}

function Fila({ Icon, titulo, sub, estado, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '1px solid #F0F2F5', cursor: 'pointer' }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: estado === 'subido' ? T.greenSoft : T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={estado === 'subido' ? T.green : T.primary} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink }}>{titulo}</div>
        <div style={{ fontSize: 12.5, color: T.text3 }}>{sub}</div>
      </div>
      {estado === 'subido' && <span style={pill(T.greenSoft, T.green)}>Subido</span>}
      {estado === 'falta' && <span style={pill(T.redSoft, T.red)}>Falta</span>}
      {estado === 'validando' && <span style={pill(T.primarySoft, T.primary)}>Validando</span>}
      <ChevronRight size={17} color="#C4C9D4" />
    </div>
  );
}
