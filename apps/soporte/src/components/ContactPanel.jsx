import { useEffect, useState } from 'react';
import { X, Link2, CalendarPlus, CalendarX, ExternalLink, Users } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { initials, colorFromString, convName, fmtPhone } from '../lib/format.js';
import TagPicker from './TagPicker.jsx';
import LinkContactModal from './LinkContactModal.jsx';

const fmtCita = (iso) =>
  new Date(iso).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }) +
  ' · ' + new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

// Drawer derecho con los detalles de la conversación: etiquetas, notas,
// vínculo a contacto/cliente y citas agendadas.
export default function ContactPanel({ open, onClose, onSchedule }) {
  const { selectedConversation: conv, updateNotes, appointmentsByConv, loadAppointments, cancelAppointment } = useSoporte();
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    if (open && conv?.id) loadAppointments(conv.id);
  }, [open, conv?.id, loadAppointments]);

  if (!open || !conv) return null;

  const name = convName(conv);
  const color = colorFromString(conv.wa_jid);
  const citas = appointmentsByConv[conv.id] || [];

  return (
    <>
      {/* Scrim solo en mobile */}
      <div className="md:hidden fixed inset-0 bg-black/30 z-[80]" onClick={onClose} />
      <div className="bg-white border-l border-border flex flex-col h-full min-h-0 w-[320px] shrink-0 max-md:fixed max-md:right-0 max-md:top-0 max-md:bottom-0 max-md:z-[81] max-md:w-[88vw] max-md:max-w-[340px] max-md:shadow-2xl">
        <div className="h-[54px] border-b border-border flex items-center justify-between px-3.5 shrink-0">
          <span className="text-[13px] font-bold">Detalles</span>
          <button onClick={onClose} className="bg-transparent border-0 text-text3 hover:text-text cursor-pointer p-1">
            <X size={17} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-3.5 flex flex-col gap-4">
          {/* Identidad */}
          <div className="flex flex-col items-center text-center gap-1.5 py-2">
            <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-[20px]"
                 style={{ background: color + '20', color }}>
              {conv.is_group ? <Users size={26} /> : initials(name)}
            </div>
            <div className="text-[15px] font-bold">{name}</div>
            <div className="text-[12px] text-text3">{conv.is_group ? 'Grupo de WhatsApp' : fmtPhone(conv.wa_phone)}</div>
          </div>

          {/* Vínculos */}
          <div>
            <div className="text-[10.5px] font-bold text-text3 uppercase tracking-wider mb-1.5">Vinculado a</div>
            <button onClick={() => setLinkOpen(true)}
                    className="w-full text-left px-3 py-2 rounded-lg border border-border bg-white hover:border-[#F59E0B]/60 cursor-pointer transition-colors flex items-center gap-2">
              <Link2 size={14} className="text-text3 shrink-0" />
              <span className="text-[12.5px] flex-1 truncate">
                {conv.contact || conv.client
                  ? [conv.contact?.full_name, conv.client?.name].filter(Boolean).join(' · ')
                  : 'Vincular a contacto o cliente…'}
              </span>
            </button>
          </div>

          {/* Etiquetas */}
          <div>
            <div className="text-[10.5px] font-bold text-text3 uppercase tracking-wider mb-1.5">Etiquetas</div>
            <TagPicker conv={conv} />
          </div>

          {/* Notas */}
          <div>
            <div className="text-[10.5px] font-bold text-text3 uppercase tracking-wider mb-1.5">Notas internas</div>
            <textarea
              value={conv.notes || ''}
              onChange={(e) => updateNotes(conv.id, e.target.value)}
              placeholder="Anotá lo importante de este contacto… (se guarda solo)"
              rows={4}
              className="w-full resize-none text-[12.5px] leading-relaxed px-3 py-2 rounded-lg border border-border bg-[#FFFBEB]/60 outline-none focus:border-[#F59E0B] transition-colors"
            />
          </div>

          {/* Citas */}
          {!conv.is_group && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10.5px] font-bold text-text3 uppercase tracking-wider">Citas</span>
                <button onClick={onSchedule}
                        className="text-[11px] font-semibold text-[#F59E0B] bg-transparent border-0 cursor-pointer flex items-center gap-1 hover:underline">
                  <CalendarPlus size={12} /> Agendar
                </button>
              </div>
              {citas.length === 0 ? (
                <div className="text-[11.5px] text-text3 px-1">Sin citas agendadas.</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {citas.map((a) => (
                    <div key={a.id} className={`px-2.5 py-2 rounded-lg border text-[12px] ${a.status === 'cancelled' ? 'border-border bg-surface2 opacity-60' : 'border-[#F59E0B]/40 bg-[#FFFBEB]'}`}>
                      <div className="font-semibold truncate flex items-center gap-1.5">
                        {a.title}
                        {a.status === 'cancelled' && <span className="text-[9.5px] font-bold text-text3 uppercase">cancelada</span>}
                      </div>
                      <div className="text-[11px] text-text2 capitalize">{fmtCita(a.start_at)}</div>
                      <div className="flex items-center gap-2.5 mt-1">
                        {a.gcal_link && (
                          <a href={a.gcal_link} target="_blank" rel="noopener noreferrer"
                             className="text-[10.5px] font-semibold text-[#4A67D8] no-underline hover:underline flex items-center gap-0.5">
                            <ExternalLink size={10} /> Ver en Calendar
                          </a>
                        )}
                        {a.status === 'scheduled' && (
                          <button onClick={() => cancelAppointment(conv.id, a.id)}
                                  className="text-[10.5px] font-semibold text-text3 bg-transparent border-0 cursor-pointer hover:text-red-500 flex items-center gap-0.5 p-0">
                            <CalendarX size={10} /> Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <LinkContactModal open={linkOpen} onClose={() => setLinkOpen(false)} conv={conv} />
    </>
  );
}
