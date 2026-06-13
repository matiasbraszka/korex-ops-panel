import { useState } from 'react';
import { Search, Check, Users } from 'lucide-react';
import Modal from './Modal.jsx';
import { useSoporte } from '../context/SoporteContext.jsx';
import { initials, colorFromString, convName, fmtPhone } from '../lib/format.js';

const PREVIEW = {
  imageMessage: '📷 Imagen', stickerMessage: 'Sticker', audioMessage: '🎙 Nota de voz',
  videoMessage: '🎬 Video', documentMessage: '📄 Documento',
};

// Reenviar un mensaje (texto o media) a otro chat. Permite mandarlo a varios:
// el modal queda abierto y marca "Enviado ✓" en cada uno.
export default function ForwardModal({ msg, onClose }) {
  const { allConversations, forwardMessage } = useSoporte();
  const [q, setQ] = useState('');
  const [sendingId, setSendingId] = useState(null);
  const [sent, setSent] = useState([]);     // ids ya reenviados
  const [error, setError] = useState('');

  if (!msg) return null;

  const term = q.trim().toLowerCase();
  const list = (allConversations || [])
    .filter((c) => !c.archived)
    .filter((c) => !term || `${convName(c)} ${c.wa_phone || ''} ${c.client?.name || ''}`.toLowerCase().includes(term))
    .slice(0, 40);

  const preview = (msg.body && msg.body.trim()) || PREVIEW[msg.msg_type] || 'Mensaje';

  const doForward = async (c) => {
    if (sendingId || sent.includes(c.id)) return;
    setError('');
    setSendingId(c.id);
    try {
      await forwardMessage(msg, c.id);
      setSent((s) => [...s, c.id]);
    } catch (e) {
      console.error('soporte: fallo el reenvío', e);
      setError('No se pudo reenviar. Probá de nuevo.');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <Modal open onClose={onClose} title="Reenviar a…" maxWidth={430}>
      <div className="flex flex-col gap-2.5">
        <div className="text-[12px] text-text2 px-2.5 py-2 rounded-lg bg-surface2 truncate">
          Reenviando: <b className="font-semibold">{preview}</b>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
                 placeholder="Buscar contacto, teléfono, cliente…"
                 className="w-full h-[36px] pl-8 pr-3 text-[12.5px] rounded-[10px] border border-border bg-surface2 outline-none focus:border-[#F59E0B] focus:bg-white transition-colors" />
        </div>
        {error && <div className="text-[11.5px] font-medium" style={{ color: '#DC2626' }}>{error}</div>}
        <div className="flex flex-col gap-1 max-h-[340px] overflow-y-auto">
          {list.length === 0 ? (
            <div className="text-[12px] text-text3 text-center py-6">No hay chats con esa búsqueda.</div>
          ) : list.map((c) => {
            const name = convName(c);
            const color = colorFromString(c.wa_jid);
            const done = sent.includes(c.id);
            const sending = sendingId === c.id;
            return (
              <button key={c.id} onClick={() => doForward(c)} disabled={done || sending}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-left transition-all duration-150 ${
                        done ? 'border-[#BBF7D0] bg-[#F0FDF4] cursor-default'
                             : 'border-border/70 bg-white hover:border-[#F59E0B]/45 cursor-pointer'}`}>
                <span className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[11.5px] shrink-0"
                      style={{ background: color + '1d', color }}>
                  {c.is_group ? <Users size={15} /> : initials(name)}
                </span>
                <span className="flex-1 min-w-0 leading-tight">
                  <span className="block text-[12.5px] font-semibold truncate">{name}</span>
                  <span className="block text-[10.5px] text-text3 truncate">
                    {c.is_group ? 'Grupo' : fmtPhone(c.wa_phone)}{c.client?.name ? ` · ${c.client.name}` : ''}
                  </span>
                </span>
                {done ? (
                  <span className="text-[11px] font-bold text-[#15803D] flex items-center gap-1 shrink-0">
                    <Check size={13} strokeWidth={2.5} /> Enviado
                  </span>
                ) : sending ? (
                  <span className="text-[11px] font-semibold text-text3 shrink-0">Enviando…</span>
                ) : (
                  <span className="text-[11px] font-bold text-[#B45309] shrink-0">Reenviar</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
