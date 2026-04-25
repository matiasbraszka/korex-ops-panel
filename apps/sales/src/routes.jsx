import { Routes, Route, Navigate } from 'react-router-dom';
import { Users, Library, Contact } from 'lucide-react';
import CrmPage from './pages/CrmPage.jsx';
import ResourcesPage from './pages/ResourcesPage.jsx';
import ContactsPage from './pages/ContactsPage.jsx';

// Items que el shell/sidebar consume para pintar las sub-pestañas del modulo.
// action se chequea con useCan('sales', 'read', submodule).
export const salesNavItems = [
  { id: 'crm',       label: 'CRM',       Icon: Users,   path: '/sales/crm' },
  { id: 'contacts',  label: 'Contactos', Icon: Contact, path: '/sales/contacts' },
  { id: 'resources', label: 'Recursos',  Icon: Library, path: '/sales/resources' },
];

// Rutas internas del modulo. Se monta con <Route path="/sales/*" element={<SalesRoutes />} />
// desde el host (apps/operations por ahora, apps/shell en el futuro).
export function SalesRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="crm" replace />} />
      <Route path="crm" element={<CrmPage />} />
      <Route path="contacts" element={<ContactsPage />} />
      <Route path="resources" element={<ResourcesPage />} />
      <Route path="*" element={<div className="text-text3 text-center py-20">Vista no encontrada</div>} />
    </Routes>
  );
}
