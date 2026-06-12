import { MessageCircle, WifiOff } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import ConversationItem from './ConversationItem.jsx';
import InboxFilters from './InboxFilters.jsx';

export default function ConversationList() {
  const { loading, realtimeOk, conversations, allConversationsCount, unreadTotal, selectedId, selectConversation, tagsCatalog } = useSoporte();

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#F7F8FA]">
      <InboxFilters unreadCount={unreadTotal} />
      {!realtimeOk && (
        <div className="px-3 py-1.5 bg-[#FFFBEB] text-[#B45309] text-[11px] font-medium flex items-center gap-1.5 shrink-0">
          <WifiOff size={12} /> Reconectando…
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 pt-2">
        {loading ? (
          <div className="text-text3 text-[12.5px] text-center py-10">Cargando chats…</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 px-6">
            <MessageCircle size={28} className="mx-auto text-text3 mb-2" />
            <div className="text-[13px] font-semibold text-text2">
              {allConversationsCount === 0 ? 'Todavía no hay chats' : 'Nada con ese filtro'}
            </div>
            <div className="text-[11.5px] text-text3 mt-1">
              {allConversationsCount === 0
                ? 'Los mensajes que lleguen a tu WhatsApp van a aparecer acá.'
                : 'Probá con otro filtro o búsqueda.'}
            </div>
          </div>
        ) : (
          conversations.map((c) => (
            <ConversationItem
              key={c.id}
              conv={c}
              active={c.id === selectedId}
              isSelected={c.id === selectedId}
              tagsCatalog={tagsCatalog}
              onClick={() => selectConversation(c.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
