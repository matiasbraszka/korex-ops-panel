import { useLocation, useNavigate } from 'react-router-dom';
import { IcoHome, IcoDoc, IcoEmbudos, IcoUpload } from './icons';

// Navegación del prototipo: 4 tabs abajo en el celular; en PC (≥1024px) el CSS
// la vuelve menú lateral de 236px (data-kx-tabbar). Punto rojo en Guiones
// cuando hay grabaciones esperando.
const TABS = [
  { to: '/', label: 'Inicio', Ico: IcoHome },
  { to: '/guiones', label: 'Guiones', Ico: IcoDoc },
  { to: '/embudos', label: 'Embudos', Ico: IcoEmbudos },
  { to: '/material', label: 'Material', Ico: IcoUpload },
];

export default function BottomNav({ dotGuiones = false, activeOverride }) {
  const nav = useNavigate();
  const { pathname } = useLocation();
  return (
    <div data-kx-tabbar="" style={{ height: 86, flex: 'none', background: 'rgba(255,255,255,.96)', backdropFilter: 'blur(10px)', display: 'flex', padding: '12px 8px 24px', boxShadow: '0 -1px 0 var(--mk-border)' }}>
      {TABS.map(({ to, label, Ico }) => {
        const active = activeOverride != null
          ? activeOverride === to
          : (to === '/' ? pathname === '/' : pathname.startsWith(to)
            || (to === '/guiones' && pathname.startsWith('/documento'))
            || (to === '/embudos' && (pathname.startsWith('/embudo/') || pathname.startsWith('/entregables'))));
        return (
          <div key={to} data-active={active ? '1' : '0'} onClick={() => nav(to)} role="button" aria-label={label}
            style={{ cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, color: active ? 'var(--mk-blue-ops)' : 'var(--mk-text3)', position: 'relative' }}>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Ico size={20} stroke="currentColor" sw={active ? 2.3 : 1.8} />
              {to === '/guiones' && dotGuiones && (
                <span style={{ position: 'absolute', top: -2, right: -5, width: 8, height: 8, borderRadius: '50%', background: 'var(--mk-red)' }} />
              )}
            </span>
            <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 600 }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
