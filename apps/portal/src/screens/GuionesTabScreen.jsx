import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, Clapperboard, ChevronRight, Menu, MessageSquare, UploadCloud } from 'lucide-react';
import { Screen, Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { T, cardStyle, microLabel, bigBtn } from '../components/theme';

const WELCOME_KEY = 'korex_portal_guiones_bienvenida';

// Tab GUIONES: la primera vez muestra la bienvenida guiada (3 gestos); después,
// la lista de documentos por embudo (Ads / VSL) para entrar a leer, comentar y
// subir las grabaciones.
export default function GuionesTabScreen() {
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.funnels(), []);
  const [welcome, setWelcome] = useState(() => { try { return !localStorage.getItem(WELCOME_KEY); } catch { return false; } });
  const cerrar = () => { try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* */ } setWelcome(false); };

  if (loading) return <Loading label="Buscando tus guiones…" />;
  const funnels = (Array.isArray(data) ? data : []).filter((f) => (f.guionesTotal || 0) > 0);

  return (
    <Screen style={{ background: T.bg }}>
      {isDemo() && <DemoBanner />}
      <h1 style={{ margin: '4px 0 6px', fontSize: 26, fontWeight: 800, color: T.ink, letterSpacing: '-0.03em' }}>Tus guiones</h1>
      <p style={{ margin: '0 0 18px', fontSize: 15, color: T.text2, lineHeight: 1.45 }}>Listos para leer, comentar y grabar. Toca un documento para abrirlo.</p>

      {funnels.length === 0 ? (
        <div style={{ ...cardStyle, padding: 22, textAlign: 'center', color: T.text2, fontSize: 14.5 }}>
          Todavía no hay guiones para grabar. En cuanto el equipo los marque, aparecen aquí.
        </div>
      ) : (
        <div className="mk-grid2">
          {funnels.map((f) => (
            <div key={f.id} style={{ ...cardStyle, padding: 16 }}>
              <div style={microLabel(T.primary)}>Embudo</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, margin: '3px 0 12px' }}>{f.name}</div>
              <DocRow Icon={Megaphone} label="Anuncios (Ads)" sub="Todos los anuncios, en una sola pestaña" onClick={() => nav(`/documento/${f.id}/ads`)} />
              <DocRow Icon={Clapperboard} label="VSL" sub="El video largo, en su propia pestaña" onClick={() => nav(`/documento/${f.id}/vsl`)} />
            </div>
          ))}
        </div>
      )}

      {/* ── BIENVENIDA (una sola vez): los 3 gestos ── */}
      {welcome && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(10,14,25,.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12 }}>
          <div className="mk-sheet" style={{ background: '#fff', borderRadius: 22, padding: '22px 20px', boxShadow: '0 24px 80px rgba(10,22,40,.35)' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: 21, fontWeight: 800, color: T.ink, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Aquí viven tus guiones, listos para leer y grabar.</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, color: T.text2 }}>Tres cosas y ya eres autónomo:</p>
            <PasoW n={1} Icon={Menu} titulo="Encuentra cualquier guion" sub="Toca las tres rayitas arriba a la izquierda del documento y elige el guion que quieras." />
            <PasoW n={2} Icon={MessageSquare} titulo="Comenta lo que quieras cambiar" sub="Mantén el dedo y selecciona un fragmento del texto. Aparece el botón para dejar tu nota." />
            <PasoW n={3} Icon={UploadCloud} titulo="Graba y sube todo junto" sub="Al final de cada documento hay un botón para subir tus videos, todos de una vez." />
            <button onClick={cerrar} style={{ ...bigBtn(), marginTop: 14 }}>Ver mis guiones <ChevronRight size={15} /></button>
            <div style={{ textAlign: 'center', marginTop: 9, fontSize: 12, color: T.text3 }}>No te lo mostramos de nuevo</div>
          </div>
        </div>
      )}
    </Screen>
  );
}

function DocRow({ Icon, label, sub, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: '1px solid #F0F2F5', cursor: 'pointer' }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: T.primarySoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={19} color={T.primary} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{label}</div>
        <div style={{ fontSize: 12.5, color: T.text3 }}>{sub}</div>
      </div>
      <ChevronRight size={18} color="#C4C9D4" />
    </div>
  );
}

function PasoW({ n, Icon, titulo, sub }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 13 }}>
      <span style={{ width: 30, height: 30, borderRadius: 999, background: T.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13.5, fontWeight: 800, flexShrink: 0 }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14.5, fontWeight: 800, color: T.ink }}><Icon size={15} color={T.primary} />{titulo}</div>
        <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.45, marginTop: 3 }}>{sub}</div>
      </div>
    </div>
  );
}
