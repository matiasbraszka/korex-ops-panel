import { useLocation, useNavigate } from 'react-router-dom';
import { House, FileText, SlidersHorizontal, UploadCloud } from 'lucide-react';
import { T } from './theme';

// Navegación inferior del portal v2: Inicio · Guiones · Embudos · Material.
// `dotGuiones` = puntito rojo cuando hay guiones esperando grabación.
const TABS = [
  { to: '/', label: 'Inicio', Icon: House },
  { to: '/guiones', label: 'Guiones', Icon: FileText },
  { to: '/embudos', label: 'Embudos', Icon: SlidersHorizontal },
  { to: '/material', label: 'Material', Icon: UploadCloud },
];

export default function BottomNav({ dotGuiones = false }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  return (
    <nav style={{ position: 'sticky', bottom: 0, zIndex: 40, background: '#FFFFFF', borderTop: `1px solid ${T.border}`, display: 'flex', padding: '6px 6px calc(8px + env(safe-area-inset-bottom))' }}>
      {TABS.map(({ to, label, Icon }) => {
        const active = to === '/' ? pathname === '/' : pathname.startsWith(to) || (to === '/guiones' && pathname.startsWith('/documento'));
        return (
          <button key={to} onClick={() => nav(to)} aria-label={label} style={{ flex: 1, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '7px 0 4px', position: 'relative' }}>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Icon size={21} color={active ? T.primary : T.text3} strokeWidth={active ? 2.4 : 2} />
              {to === '/guiones' && dotGuiones && (
                <span style={{ position: 'absolute', top: -2, right: -4, width: 7, height: 7, borderRadius: 999, background: T.red, border: '1.5px solid #fff' }} />
              )}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: active ? 800 : 600, color: active ? T.primary : T.text3 }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
