import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { HelpCircle, X, Play, LogOut } from 'lucide-react';
import PhoneFrame from './PhoneFrame';
import { api } from '../data/portalApi';
import { useAsync } from './ui';
import { usePortalAuth } from '../auth/PortalAuthProvider';

function Header({ clientName, onTutoriales, onSignOut }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 40, background: '#FFFFFF', borderBottom: '1px solid #E2E5EB', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, fontSize: 17, color: '#FFFFFF', letterSpacing: '-0.03em' }}>K</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9CA3AF' }}>Método Korex</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D26', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clientName || '…'}</div>
      </div>
      <button onClick={onTutoriales} aria-label="Tutoriales" style={iconBtn}>
        <HelpCircle size={22} color="#5B7CF5" />
      </button>
      <button onClick={onSignOut} aria-label="Salir" style={iconBtn}>
        <LogOut size={20} color="#9CA3AF" />
      </button>
    </header>
  );
}

const iconBtn = { width: 44, height: 44, borderRadius: 12, border: '1px solid #E2E5EB', background: '#F7F8FA', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };

function TutorialesSheet({ onClose }) {
  const { data } = useAsync(() => api.tutoriales(), []);
  const items = data || [];
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(10,22,40,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: '#FFFFFF', borderRadius: '22px 22px 0 0', maxHeight: '82vh', overflowY: 'auto', padding: '8px 18px 28px' }}>
        <div style={{ width: 44, height: 5, borderRadius: 999, background: '#E2E5EB', margin: '10px auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.02em' }}>Tutoriales</h2>
          <button onClick={onClose} aria-label="Cerrar" style={{ width: 38, height: 38, borderRadius: 999, border: 'none', background: '#F0F2F5', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={20} color="#6B7280" />
          </button>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 15, color: '#6B7280', lineHeight: 1.4 }}>Videos cortos para que grabes como un profesional. Tocá para ver.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((t) => (
            <a key={t.id} href={t.url || '#'} target={t.url ? '_blank' : undefined} rel="noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 14, background: '#F7F8FA', border: '1px solid #E2E5EB', borderRadius: 16, padding: 12, cursor: 'pointer' }}>
              <div style={{ width: 76, height: 60, borderRadius: 12, background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Play size={26} color="#FFFFFF" fill="#FFFFFF" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D26', lineHeight: 1.3 }}>{t.titulo}</div>
                <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 3 }}>{t.dur}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const [tut, setTut] = useState(false);
  const { signOut } = usePortalAuth();
  const { data: me } = useAsync(() => api.me(), []);
  const clientName = me?.name || me?.clientName;

  return (
    <PhoneFrame>
      <Header clientName={clientName} onTutoriales={() => setTut(true)} onSignOut={signOut} />
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <Outlet />
        <div style={{ height: 12 }} />
      </main>
      {tut && <TutorialesSheet onClose={() => setTut(false)} />}
    </PhoneFrame>
  );
}
