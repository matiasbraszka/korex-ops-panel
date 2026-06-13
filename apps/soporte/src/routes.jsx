import { Routes, Route, Navigate } from 'react-router-dom';
import { MessageCircle, CalendarDays, FolderOpen } from 'lucide-react';
import { SoporteProvider } from './context/SoporteContext.jsx';
import InboxPage from './pages/InboxPage.jsx';
import CitasPage from './pages/CitasPage.jsx';
import RecursosPage from './pages/RecursosPage.jsx';

// Items que el shell/sidebar consume para pintar las sub-pestañas del modulo.
export const soporteNavItems = [
  { id: 'inbox', label: 'WhatsApp', Icon: MessageCircle, path: '/soporte/inbox' },
  { id: 'citas', label: 'Citas', Icon: CalendarDays, path: '/soporte/citas' },
  { id: 'recursos', label: 'Recursos', Icon: FolderOpen, path: '/soporte/recursos' },
];

// El provider vive DENTRO de las rutas del modulo: su estado (y la
// suscripcion realtime a wa_conversations) solo existe mientras el usuario
// esta en /soporte. Este es el patron "contexto por dominio" del monorepo.
export function SoporteRoutes() {
  return (
    <SoporteProvider>
      <Routes>
        <Route path="/" element={<Navigate to="inbox" replace />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="citas" element={<CitasPage />} />
        <Route path="recursos" element={<RecursosPage />} />
        <Route path="plantillas" element={<Navigate to="/soporte/recursos" replace />} />
        <Route path="*" element={<div className="text-text3 text-center py-20">Vista no encontrada</div>} />
      </Routes>
    </SoporteProvider>
  );
}
