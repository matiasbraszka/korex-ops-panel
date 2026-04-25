import { Routes, Route, Navigate } from 'react-router-dom';
import { Users, Library, Contact, LayoutDashboard } from 'lucide-react';
import CrmPage from './pages/CrmPage.jsx';
import ResourcesPage from './pages/ResourcesPage.jsx';
import ContactsPage from './pages/ContactsPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';

// Items que el shell/sidebar consume para pintar las sub-pestañas del modulo.
export const salesNavItems = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, path: '/sales/dashboard' },
  { id: 'crm',       label: 'CRM',       Icon: Users,           path: '/sales/crm' },
  { id: 'contacts',  label: 'Contactos', Icon: Contact,         path: '/sales/contacts' },
  { id: 'resources', label: 'Recursos',  Icon: Library,         path: '/sales/resources' },
];

export function SalesRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="crm" element={<CrmPage />} />
      <Route path="contacts" element={<ContactsPage />} />
      <Route path="resources" element={<ResourcesPage />} />
      <Route path="*" element={<div className="text-text3 text-center py-20">Vista no encontrada</div>} />
    </Routes>
  );
}
