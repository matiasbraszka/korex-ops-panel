import { useNavigate } from 'react-router-dom';
import { Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { T, display } from '../components/theme';
import { IcoChevR, IcoExternal } from '../components/icons';

// TUS EMBUDOS — exacta al prototipo: tarjetas numeradas con barra de color,
// etiqueta de estado, avance grande, el aviso de qué falta y TU PÁGINA.
const fmt = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
  if (m) return `${m[3]}/${m[2]}`;   // fecha "YYYY-MM-DD" sin corrimiento de zona horaria
  try { const x = new Date(d); return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`; } catch { return ''; }
};

export default function EmbudosScreen() {
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.embudos(), []);

  if (loading) return <Loading label="Cargando tus embudos…" />;
  const embudos = Array.isArray(data) ? data : [];
  const alAire = embudos.filter((e) => e.etiqueta === 'al_aire' || e.etiqueta === 'completo').length;
  const resto = embudos.length - alAire;
  const intro = embudos.length === 0 ? 'Cuando armemos tu primera campaña, aparece aquí.'
    : resto === 0 ? `Tienes ${embudos.length === 1 ? '1 campaña y ya está al aire' : `${embudos.length} campañas y ya están todas al aire`}.`
    : alAire === 0 ? `Tienes ${embudos.length === 1 ? '1 campaña. La estamos armando' : `${embudos.length} campañas. Las estamos armando`}.`
    : `Tienes ${embudos.length} campañas. ${resto === 1 ? '1 está en armado' : `${resto} están en armado`}, ${alAire === 1 ? 'la otra ya está al aire' : `las otras ${alAire} ya están al aire`}.`;

  return (
    <>
      {isDemo() && <div style={{ padding: '12px 22px 0' }}><DemoBanner /></div>}
      <div style={{ padding: '22px 22px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={display(30, '-0.035em')}>Tus embudos</div>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: T.text2, textWrap: 'pretty' }}>{intro}</div>
      </div>

      <div style={{ padding: '24px 20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {embudos.map((e, i) => <EmbudoCard key={e.id} e={e} n={i + 1} nav={nav} />)}
      </div>

      <div style={{ padding: '26px 22px 20px', fontSize: 12.5, lineHeight: 1.5, color: T.text3, textAlign: 'center' }}>
        Un embudo es una campaña completa: anuncios, video y página.
      </div>
    </>
  );
}

function EmbudoCard({ e, n, nav }) {
  const alAire = e.etiqueta === 'al_aire';
  const completo = e.etiqueta === 'completo';   // embudo viejo/entregado
  const terminado = alAire || completo;
  const pend = !!e.grabPendiente?.pend;
  const acento = terminado ? 'var(--mk-green)' : 'var(--mk-blue-ops)';
  const acentoSuave = terminado ? 'var(--mk-green-bg)' : 'var(--mk-blue-bg)';
  const etiqueta = completo ? 'Completo' : alAire ? 'Al aire' : e.etiqueta === 'te_toca' ? 'Te toca a ti' : e.etapa === 3 ? 'Editando' : 'En armado';
  const sub = completo ? 'Embudo terminado'
    : alAire ? (e.startDate ? `Al aire desde el ${fmt(e.startDate)}` : 'Al aire')
    : (e.startDate ? `Empezado el ${fmt(e.startDate)}` : 'En curso');
  // Una sola línea de "qué falta": lo del cliente en rojo, el resto suave.
  const falta = terminado ? null : pend ? 'Falta que grabes tus anuncios' : (e.razon || null);
  const pagina = e.pagina;

  return (
    <div style={{ borderRadius: 20, overflow: 'hidden', background: '#fff', border: '1px solid var(--mk-border)', boxShadow: 'var(--shadow-md)' }}>
      <div style={{ height: 4, background: acento }} />
      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ width: 38, height: 38, flex: 'none', borderRadius: 11, background: acentoSuave, color: acento, fontFamily: "'Montserrat', sans-serif", fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{n}</div>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fff', background: acento, padding: '6px 11px', borderRadius: 999, whiteSpace: 'nowrap', flex: 'none' }}>{etiqueta}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: -6 }}>
          <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em', color: T.ink, lineHeight: 1.12 }}>{e.name}</div>
          <div style={{ fontSize: 12.5, color: T.text3 }}>{sub}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3 }}>Avance del embudo</span>
            <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, color: acento }}>{e.progreso}%</span>
          </div>
          {/* Una sola barra: simple y clara. El detalle vive dentro del embudo. */}
          <div style={{ height: 9, borderRadius: 999, background: T.surface2, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 999, background: acento, transition: 'width .35s ease', width: `${e.progreso}%` }} />
          </div>
          {falta && (
            <div style={{ fontSize: 13, lineHeight: 1.4, fontWeight: 600, color: pend ? 'var(--mk-red)' : T.text2 }}>{falta}</div>
          )}
        </div>

        {terminado ? (
          <>
            {pagina && (
              <a href={/^https?:\/\//.test(pagina) ? pagina : 'https://' + pagina} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 14, background: 'var(--mk-bg-panel)', border: '1px solid var(--mk-border)', textDecoration: 'none' }}>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3 }}>Tu página</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: T.primaryInk, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(pagina).replace(/^https?:\/\//, '')}</span>
                </div>
                <div style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', background: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IcoExternal size={15} stroke="#fff" sw={2.4} />
                </div>
              </a>
            )}
            <div onClick={() => nav(`/embudo/${e.id}`)} role="button" style={{ cursor: 'pointer', textAlign: 'center', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.text3 }}>
              Ver el detalle
            </div>
          </>
        ) : (
          <div onClick={() => nav(`/embudo/${e.id}`)} role="button" style={{ cursor: 'pointer', height: 46, borderRadius: 999, background: acento, color: '#fff', fontSize: 11.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
            Abrir este embudo
            <IcoChevR size={15} stroke="#fff" sw={2.5} />
          </div>
        )}
      </div>
    </div>
  );
}
