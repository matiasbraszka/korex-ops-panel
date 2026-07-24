import { useNavigate } from 'react-router-dom';
import { ChevronRight, AlertCircle, ExternalLink } from 'lucide-react';
import { Screen, Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { T, cardStyle, microLabel, bigBtn, pill } from '../components/theme';

// TUS EMBUDOS: cada campaña con su avance real, la razón en cristiano y, si ya
// está al aire, el link a su página. "TE TOCA A TI" cuando falta algo del cliente.
export default function EmbudosScreen() {
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.embudos(), []);
  if (loading) return <Loading label="Cargando tus embudos…" />;
  const embudos = Array.isArray(data) ? data : [];
  const alAire = embudos.filter((e) => e.etiqueta === 'al_aire').length;
  const enObra = embudos.length - alAire;

  return (
    <Screen style={{ background: T.bg }}>
      {isDemo() && <DemoBanner />}
      <h1 style={{ margin: '4px 0 6px', fontSize: 26, fontWeight: 800, color: T.ink, letterSpacing: '-0.03em' }}>Tus embudos</h1>
      <p style={{ margin: '0 0 18px', fontSize: 15, color: T.text2, lineHeight: 1.45 }}>
        {embudos.length === 0 ? 'Cuando arranquemos tu primera campaña, aparece aquí.'
          : `Tienes ${embudos.length} ${embudos.length === 1 ? 'campaña' : 'campañas'}.${enObra > 0 ? ` ${enObra === 1 ? 'Una la estamos armando' : `${enObra} las estamos armando`},` : ''}${alAire > 0 ? ` ${alAire === 1 ? 'una ya está al aire' : `${alAire} ya están al aire`}.` : ''}`}
      </p>

      <div className="mk-grid2">
        {embudos.map((e, i) => {
          const teToca = e.etiqueta === 'te_toca';
          const aire = e.etiqueta === 'al_aire';
          const color = aire ? T.green : T.primary;
          return (
            <div key={e.id} style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ height: 5, background: color }} />
              <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: aire ? T.greenSoft : T.primarySoft, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ flex: 1 }} />
                  <span style={pill(aire ? T.green : teToca ? T.primary : '#EDEFF5', aire || teToca ? '#fff' : T.text2)}>
                    {aire ? 'Al aire' : teToca ? 'Te toca a ti' : 'En armado'}
                  </span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, letterSpacing: '-0.02em', lineHeight: 1.2 }}>{e.name}</div>
                <div style={{ fontSize: 12.5, color: T.text3, marginTop: 3 }}>
                  {aire ? 'Al aire' : 'Empezado'}{e.startDate ? ` desde el ${fmtFecha(e.startDate)}` : ''}
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 }}>
                  <div>
                    <div style={microLabel()}>Avance del embudo</div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginTop: 2 }}>{e.razon}</div>
                  </div>
                  <span style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-0.02em' }}>{e.progreso}%</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#EDEFF5', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 999, background: color, width: `${Math.min(100, e.progreso || 0)}%` }} />
                </div>

                {teToca && e.grabPendiente?.pend && (
                  <div style={{ display: 'flex', gap: 9, background: T.redSoft, border: '1px solid #F6C9C9', borderRadius: 12, padding: '10px 12px', marginTop: 12 }}>
                    <AlertCircle size={16} color={T.red} style={{ flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#991B1B' }}>Falta que grabes tus videos</div>
                      <div style={{ fontSize: 12.5, color: '#B45454' }}>Te lo pedimos {e.grabPendiente.dias === 0 ? 'hoy' : `hace ${e.grabPendiente.dias} ${e.grabPendiente.dias === 1 ? 'día' : 'días'}`}.</div>
                    </div>
                  </div>
                )}

                {teToca ? (
                  <button onClick={() => nav(`/documento/${e.id}/ads`)} style={{ ...bigBtn(), marginTop: 12 }}>Abrir este embudo <ChevronRight size={15} /></button>
                ) : aire && e.pagina ? (
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={microLabel()}>Tu página</span>
                    <a href={/^https?:\/\//.test(e.pagina) ? e.pagina : 'https://' + e.pagina} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13.5, fontWeight: 800, color: T.green, textDecoration: 'none' }}>
                      {String(e.pagina).replace(/^https?:\/\//, '')} <ExternalLink size={13} />
                    </a>
                  </div>
                ) : aire ? (
                  <div style={{ marginTop: 12, fontSize: 13, color: T.text3 }}>Está corriendo. No necesitas hacer nada.</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {embudos.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12.5, color: T.text3 }}>
          Un embudo es una campaña completa: anuncios, video y página.
        </div>
      )}
    </Screen>
  );
}

function fmtFecha(d) {
  try { const [y, m, dd] = String(d).split('-'); return `${dd}/${m}`; } catch { return d; }
}
