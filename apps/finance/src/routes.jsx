import { Routes, Route, Navigate } from 'react-router-dom';
import { Receipt, Coins } from 'lucide-react';
import IngresosPage from './pages/IngresosPage.jsx';
import ComisionesPage from './pages/ComisionesPage.jsx';

// Sub-pestañas del área Finanzas que consume el shell/sidebar.
// F1 = solo lectura (espejo validado del Sheet). Egresos/Dashboard/Tesorería/
// Acuerdos/Partners se agregan en fases siguientes.
export const financeNavItems = [
  { id: 'ingresos',   label: 'Ingresos',   Icon: Receipt, path: '/finance/ingresos' },
  { id: 'comisiones', label: 'Comisiones', Icon: Coins,   path: '/finance/comisiones' },
];

export function FinanceRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="ingresos" replace />} />
      <Route path="ingresos" element={<IngresosPage />} />
      <Route path="comisiones" element={<ComisionesPage />} />
      <Route path="*" element={<div className="text-text3 text-center py-20">Vista no encontrada</div>} />
    </Routes>
  );
}
