import { Routes, Route, Navigate } from 'react-router-dom';
import { Users, Library, Contact, LayoutDashboard, BarChart3 } from 'lucide-react';
import CrmPage from './pages/CrmPage.jsx';
import ResourcesPage from './pages/ResourcesPage.jsx';
import ContactsPage from './pages/ContactsPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import KpisPage from './pages/KpisPage.jsx';

// Items que el shell/sidebar consume para pintar las sub-pestañas del modulo.
// Dashboard queda oculto del menu por ahora (la ruta sigue accesible por URL);
// la pantalla principal de Ventas es KPIs.
export const salesNavItems = [
  { id: 'kpis',      label: 'KPIs',      Icon: BarChart3,       path: '/sales/kpis' },
  { id: 'crm',       label: 'CRM',       Icon: Users,           path: '/sales/crm' },
  { id: 'contacts',  label: 'Contactos', Icon: Contact,         path: '/sales/contacts' },
  { id: 'resources', label: 'Recursos',  Icon: Library,         path: '/sales/resources' },
];

export function SalesRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="kpis" replace />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="kpis" element={<KpisPage />} />
      <Route path="crm" element={<CrmPage />} />
      <Route path="contacts" element={<ContactsPage />} />
      <Route path="resources" element={<ResourcesPage />} />
      <Route path="*" element={<div className="text-text3 text-center py-20">Vista no encontrada</div>} />
    </Routes>
  );
}
