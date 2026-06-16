import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { sbFetch } from '@korex/db';
import DashboardPage from './pages/DashboardPage.jsx';
import IngresosPage from './pages/IngresosPage.jsx';
import AcuerdosPage from './pages/AcuerdosPage.jsx';
import PagosPage from './pages/PagosPage.jsx';
import EgresosPage from './pages/EgresosPage.jsx';
import DeudaPage from './pages/DeudaPage.jsx';
import DirectorioPage from './pages/DirectorioPage.jsx';

// Navegación del área Finanzas (sidebar propio del diseño Claude Design).
// dot = color del punto; countKey = de dónde sale el número del contador.
export const financeNavItems = [
  { id: 'dashboard',  label: 'Dashboard',  path: '/finance/dashboard',  dot: '#0EA5A4' },
  { id: 'ingresos',   label: 'Ingresos',   path: '/finance/ingresos',   dot: '#0EA5A4', countKey: 'ingresos' },
  { id: 'acuerdos',   label: 'Acuerdos',   path: '/finance/acuerdos',   dot: '#6366f1', countKey: 'acuerdos' },
  { id: 'directorio', label: 'Directorio', path: '/finance/directorio', dot: '#0ea5e9', countKey: 'directorio' },
  { id: 'pagos',      label: 'Pagos',      path: '/finance/pagos',      dot: '#16a34a', countKey: 'pagos' },
  { id: 'deuda',      label: 'Deuda',      path: '/finance/deuda',      dot: '#e11d48' },
  { id: 'egresos',    label: 'Egresos',    path: '/finance/egresos',    dot: '#f43f5e', countKey: 'egresos' },
];

// Contadores del sidebar (se cargan una vez al entrar al área; livianos, solo id).
function useNavCounts() {
  const [c, setC] = useState({});
  useEffect(() => {
    const grab = (path, key) => sbFetch(path)
      .then((d) => setC((s) => ({ ...s, [key]: Array.isArray(d) ? d.length : 0 })))
      .catch(() => {});
    grab('fin_incomes?select=id&limit=6000', 'ingresos');
    grab('fin_client_terms?select=id&limit=2000', 'acuerdos');
    grab('fin_directory_unique?select=id&limit=2000', 'directorio');
    grab('fin_payouts?select=id&limit=6000', 'pagos');
    grab('fin_expenses?select=id&limit=6000', 'egresos');
  }, []);
  return c;
}

function Sidebar({ counts }) {
  return (
    <aside style={{ width: 218, flexShrink: 0, background: '#fff', borderRight: '1px solid #E2E5EB', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 12px 8px' }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.16em', color: '#9AA4B2', padding: '4px 8px 8px' }}>ÁREA</div>
        <div style={{ background: '#F0FDFA', border: '1px solid #99E6E3', borderRadius: 10, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 9, boxShadow: '0 1px 2px rgba(14,165,164,.08)' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0EA5A4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></svg>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: '#0c8584', flex: 1 }}>Finanzas</span>
        </div>
      </div>
      <nav style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto', flex: 1 }}>
        {financeNavItems.map((t) => {
          const count = t.countKey ? counts[t.countKey] : undefined;
          return (
            <NavLink key={t.id} to={t.path}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9,
                textDecoration: 'none', fontSize: 13, transition: 'background .12s',
                background: isActive ? '#F0FDFA' : 'transparent',
                color: isActive ? '#0c8584' : '#475569',
                fontWeight: isActive ? 700 : 500,
              })}>
              {({ isActive }) => (<>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.dot, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{t.label}</span>
                {count != null && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 20, padding: '1px 7px', minWidth: 18, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                    color: isActive ? '#0c8584' : '#94A3B8', background: isActive ? '#CCF2F1' : '#F1F5F9' }}>{count}</span>
                )}
              </>)}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}

export function FinanceRoutes() {
  const counts = useNavCounts();
  const location = useLocation();
  const active = financeNavItems.find((t) => location.pathname.startsWith(t.path)) || financeNavItems[0];

  return (
    // Rompe el padding del shell (p-6 px-7) para ir edge-to-edge como el diseño.
    <div style={{ margin: '-24px -28px', height: 'calc(100dvh - 60px)', display: 'flex', background: '#EEF1F5', overflow: 'hidden', fontVariantNumeric: 'tabular-nums' }}>
      <Sidebar counts={counts} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#EEF1F5' }}>
        <header style={{ background: '#fff', borderBottom: '1px solid #E2E5EB', flexShrink: 0, padding: '13px 22px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: active.dot }} />
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: '-.01em' }}>{active.label}</h2>
        </header>
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Routes>
            <Route path="/" element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="ingresos" element={<IngresosPage />} />
            <Route path="acuerdos" element={<AcuerdosPage />} />
            <Route path="directorio" element={<DirectorioPage />} />
            <Route path="pagos" element={<PagosPage />} />
            <Route path="deuda" element={<DeudaPage />} />
            <Route path="egresos" element={<EgresosPage />} />
            <Route path="*" element={<div style={{ color: '#9AA4B2', textAlign: 'center', padding: '80px 0' }}>Vista no encontrada</div>} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
