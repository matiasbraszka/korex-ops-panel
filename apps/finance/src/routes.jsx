import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage.jsx';
import IngresosPage from './pages/IngresosPage.jsx';
import AcuerdosPage from './pages/AcuerdosPage.jsx';
import PagosPage from './pages/PagosPage.jsx';
import EgresosPage from './pages/EgresosPage.jsx';
import DeudaPage from './pages/DeudaPage.jsx';
import DirectorioPage from './pages/DirectorioPage.jsx';
import DistribucionPage from './pages/DistribucionPage.jsx';

// Navegación del área Finanzas. La navegación entre sub-pestañas la maneja el
// sidebar del shell (apps/operations) — acá NO renderizamos un sidebar propio
// para no duplicar. Solo usamos esta lista para el título/punto del header.
export const financeNavItems = [
  { id: 'dashboard',  label: 'Dashboard',  path: '/finance/dashboard',  dot: '#0EA5A4' },
  { id: 'ingresos',   label: 'Ingresos',   path: '/finance/ingresos',   dot: '#0EA5A4' },
  { id: 'acuerdos',   label: 'Acuerdos',   path: '/finance/acuerdos',   dot: '#6366f1' },
  { id: 'directorio', label: 'Directorio', path: '/finance/directorio', dot: '#0ea5e9' },
  { id: 'distribucion', label: 'Distribución', path: '/finance/distribucion', dot: '#0d9488' },
  { id: 'pagos',      label: 'Pagos',      path: '/finance/pagos',      dot: '#16a34a' },
  { id: 'deuda',      label: 'Deuda',      path: '/finance/deuda',      dot: '#e11d48' },
  { id: 'egresos',    label: 'Egresos',    path: '/finance/egresos',    dot: '#f43f5e' },
];

export function FinanceRoutes() {
  const location = useLocation();
  const active = financeNavItems.find((t) => location.pathname.startsWith(t.path)) || financeNavItems[0];

  return (
    // Rompe el padding del shell (p-6 px-7) para ir edge-to-edge como el diseño.
    <div style={{ margin: '-24px -28px', height: 'calc(100dvh - 60px)', display: 'flex', flexDirection: 'column', background: '#EEF1F5', overflow: 'hidden', fontVariantNumeric: 'tabular-nums' }}>
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
          <Route path="distribucion" element={<DistribucionPage />} />
          <Route path="pagos" element={<PagosPage />} />
          <Route path="deuda" element={<DeudaPage />} />
          <Route path="egresos" element={<EgresosPage />} />
          <Route path="*" element={<div style={{ color: '#9AA4B2', textAlign: 'center', padding: '80px 0' }}>Vista no encontrada</div>} />
        </Routes>
      </div>
    </div>
  );
}
