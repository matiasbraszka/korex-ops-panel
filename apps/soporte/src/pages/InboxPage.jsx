import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageCircle, X } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import ConversationList from '../components/ConversationList.jsx';
import ChatThread from '../components/ChatThread.jsx';
import ContactPanel from '../components/ContactPanel.jsx';
import ScheduleModal from '../components/ScheduleModal.jsx';

// Bandeja de WhatsApp: master-detail (lista | hilo | drawer de detalles).
// Mobile: lista O hilo según haya conversación seleccionada (back en el header).
export default function InboxPage() {
  const { selectedId, selectConversation, allConversations, setFilters } = useSoporte();
  const [params, setParams] = useSearchParams();
  const [panelOpen, setPanelOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // null = agendar nueva; una cita = reagendarla.
  const [editingAppt, setEditingAppt] = useState(null);

  // Deep-link desde otra parte del panel (ej. ficha de pago de Stripe):
  // /soporte/inbox?wa=<telefono> → filtra y abre ese contacto si existe.
  const waApplied = useRef(false);
  useEffect(() => {
    const wa = params.get('wa');
    if (!wa) return;
    const digits = wa.replace(/\D/g, '');
    if (!digits) return;
    if (!waApplied.current) {
      setFilters((f) => ({ ...f, search: digits, scope: 'all' }));
      waApplied.current = true;
    }
    const match = (allConversations || []).find((c) => {
      const p = (c.wa_phone || '').replace(/\D/g, '');
      return p && (p.endsWith(digits) || digits.endsWith(p));
    });
    if (match) {
      selectConversation(match.id);
      setParams((sp) => { sp.delete('wa'); sp.delete('name'); return sp; }, { replace: true });
    }
  }, [params, allConversations, setFilters, selectConversation, setParams]);

  const openSchedule = (appt = null) => {
    setEditingAppt(appt);
    setScheduleOpen(true);
  };

  const waDigits = (params.get('wa') || '').replace(/\D/g, '');
  const waName = params.get('name') || '';

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {/* Contacto traído desde otra parte del panel (ej. ficha de Stripe).
          Si ya hay chat se abre solo; si no, permite mandar un mensaje en frío. */}
      {waDigits && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface2/50 px-4 py-2.5 flex-wrap shrink-0">
          <div className="text-[12.5px] text-text2 min-w-0">
            <span className="font-semibold text-text">{waName || 'Contacto'}</span>
            <span className="text-text3"> · +{waDigits}</span>
            <span className="text-text3 ml-2 max-md:block">Si ya existe el chat se abre solo; si no, escribile en frío.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={`https://wa.me/${waDigits}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white rounded-lg px-3 py-1.5 no-underline"
              style={{ background: '#25D366' }}>
              <MessageCircle size={14} /> Escribir por WhatsApp
            </a>
            <button onClick={() => setParams((sp) => { sp.delete('wa'); sp.delete('name'); return sp; }, { replace: true })}
              title="Cerrar" className="text-text3 hover:text-text bg-transparent border-0 cursor-pointer p-1"><X size={15} /></button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 flex rounded-[14px] border border-border overflow-hidden bg-white shadow-[0_1px_2px_rgba(10,22,40,.04),0_1px_3px_rgba(10,22,40,.06)] max-md:-m-0">
      {/* Lista de conversaciones */}
      <div className={`w-[340px] shrink-0 border-r border-border min-h-0 max-md:w-full max-md:border-r-0 ${selectedId ? 'max-md:hidden' : ''}`}>
        <ConversationList />
      </div>

      {/* Hilo */}
      <div className={`flex-1 min-w-0 min-h-0 ${!selectedId ? 'max-md:hidden' : ''}`}>
        <ChatThread
          onBack={() => selectConversation(null)}
          onOpenPanel={() => setPanelOpen((v) => !v)}
          onSchedule={() => openSchedule()}
        />
      </div>

      {/* Drawer de detalles (desktop: columna; mobile: overlay) */}
      <ContactPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        onSchedule={() => openSchedule()}
        onReschedule={(appt) => openSchedule(appt)}
      />

        <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} appointment={editingAppt} />
      </div>
    </div>
  );
}
