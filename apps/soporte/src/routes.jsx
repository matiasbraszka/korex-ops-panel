import { Routes, Route, Navigate } from 'react-router-dom';
import { MessageCircle, CalendarDays, Zap } from 'lucide-react';
import { SoporteProvider } from './context/SoporteContext.jsx';
import InboxPage from './pages/InboxPage.jsx';
import CitasPage from './pages/CitasPage.jsx';
import PlantillasPage from './pages/PlantillasPage.jsx';

// Items que el shell/sidebar consume para pintar las sub-pestañas del modulo.
export const soporteNavItems = [
  { id: 'inbox', label: 'WhatsApp', Icon: MessageCircle, path: '/soporte/inbox' },
  { id: 'citas', label: 'Citas', Icon: CalendarDays, path: '/soporte/citas' },
  { id: 'plantillas', label: 'Plantillas', Icon: Zap, path: '/soporte/plantillas' },
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
        <Route path="plantillas" element={<PlantillasPage />} />
        <Route path="*" element={<div className="text-text3 text-center py-20">Vista no encontrada</div>} />
      </Routes>
    </SoporteProvider>
  );
}
