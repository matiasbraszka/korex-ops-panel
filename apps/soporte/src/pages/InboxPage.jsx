import { useState } from 'react';
import { useSoporte } from '../context/SoporteContext.jsx';
import ConversationList from '../components/ConversationList.jsx';
import ChatThread from '../components/ChatThread.jsx';
import ContactPanel from '../components/ContactPanel.jsx';
import ScheduleModal from '../components/ScheduleModal.jsx';

// Bandeja de WhatsApp: master-detail (lista | hilo | drawer de detalles).
// Mobile: lista O hilo según haya conversación seleccionada (back en el header).
export default function InboxPage() {
  const { selectedId, selectConversation } = useSoporte();
  const [panelOpen, setPanelOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  return (
    <div className="h-full min-h-0 flex rounded-xl border border-border overflow-hidden bg-white max-md:-m-0">
      {/* Lista de conversaciones */}
      <div className={`w-[320px] shrink-0 border-r border-border min-h-0 max-md:w-full max-md:border-r-0 ${selectedId ? 'max-md:hidden' : ''}`}>
        <ConversationList />
      </div>

      {/* Hilo */}
      <div className={`flex-1 min-w-0 min-h-0 ${!selectedId ? 'max-md:hidden' : ''}`}>
        <ChatThread
          onBack={() => selectConversation(null)}
          onOpenPanel={() => setPanelOpen((v) => !v)}
          onSchedule={() => setScheduleOpen(true)}
        />
      </div>

      {/* Drawer de detalles (desktop: columna; mobile: overlay) */}
      <ContactPanel open={panelOpen} onClose={() => setPanelOpen(false)} onSchedule={() => setScheduleOpen(true)} />

      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
    </div>
  );
}
