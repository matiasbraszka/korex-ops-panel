import { useLocation, useNavigate } from 'react-router-dom';
import { IcoHome, IcoDoc, IcoEmbudos, IcoUpload, IcoLock } from './icons';

// Navegación del prototipo: 4 tabs abajo en el celular; en PC (≥1024px) el CSS
// la vuelve menú lateral de 236px (data-kx-tabbar). Punto rojo en Guiones
// cuando hay grabaciones esperando.
const TABS = [
  { to: '/', label: 'Inicio', Ico: IcoHome },
  { to: '/guiones', label: 'Guiones', Ico: IcoDoc },
  { to: '/embudos', label: 'Embudos', Ico: IcoEmbudos },
  { to: '/material', label: 'Material', Ico: IcoUpload },
];

// `bloqueados`: rutas con candado mientras el cliente no termina su onboarding.
// El candado NO navega: abre una hoja que explica qué falta. Es un muro suave —
// el cliente VE que hay más plataforma esperándolo, que es justamente lo que lo
// empuja a terminar; esconderlo no motivaría a nadie.
export default function BottomNav({ dotGuiones = false, activeOverride, bloqueados = [], onBloqueado }) {
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
        const trabado = bloqueados.includes(to);
        return (
          <div key={to} data-active={active ? '1' : '0'}
            onClick={() => (trabado ? onBloqueado?.(to) : nav(to))}
            role="button" aria-label={trabado ? `${label} (se abre al terminar tu onboarding)` : label}
            style={{ cursor: 'pointer', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, color: active ? 'var(--mk-blue-ops)' : 'var(--mk-text3)', position: 'relative', opacity: trabado ? 0.45 : 1 }}>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Ico size={20} stroke="currentColor" sw={active ? 2.3 : 1.8} />
              {trabado && (
                <span style={{ position: 'absolute', top: -3, right: -6, width: 13, height: 13, borderRadius: '50%', background: 'var(--mk-surface3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <IcoLock size={8} stroke="var(--mk-text2)" sw={2.6} />
                </span>
              )}
              {to === '/guiones' && dotGuiones && !trabado && (
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
