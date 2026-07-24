import { useLocation, useNavigate } from 'react-router-dom';
import { House, Layers, FolderOpen, UserRound } from 'lucide-react';

// Navegación inferior del portal: Home · Funnels · Recursos · Perfil.
const TABS = [
  { to: '/', label: 'Home', Icon: House },
  { to: '/funnels', label: 'Funnels', Icon: Layers },
  { to: '/recursos', label: 'Recursos', Icon: FolderOpen },
  { to: '/perfil', label: 'Perfil', Icon: UserRound },
];

export default function BottomNav() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  return (
    <nav style={{ position: 'sticky', bottom: 0, zIndex: 40, background: '#FFFFFF', borderTop: '1px solid #E2E5EB', display: 'flex', padding: '6px 6px calc(6px + env(safe-area-inset-bottom))' }}>
      {TABS.map(({ to, label, Icon }) => {
        const active = to === '/' ? pathname === '/' : pathname.startsWith(to);
        return (
          <button key={to} onClick={() => nav(to)} aria-label={label} style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '7px 0 5px', borderRadius: 12 }}>
            <Icon size={22} color={active ? '#0A0A0A' : '#9CA3AF'} strokeWidth={active ? 2.4 : 2} />
            <span style={{ fontSize: 11, fontWeight: active ? 800 : 600, color: active ? '#0A0A0A' : '#9CA3AF' }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
