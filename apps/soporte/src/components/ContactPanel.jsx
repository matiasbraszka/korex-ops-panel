import { useEffect, useState } from 'react';
import { X, Link2, CalendarPlus, CalendarClock, CalendarX, ExternalLink, Users, Building2, Video, Archive, ArchiveRestore } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { initials, colorFromString, convName, fmtPhone } from '../lib/format.js';
import TagPicker from './TagPicker.jsx';
import LinkContactModal from './LinkContactModal.jsx';

const fmtCita = (iso) =>
  new Date(iso).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' }) +
  ' · ' + new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

// Asistencia del invitado por mail (lo que respondió en Google Calendar).
const RSVP_CHIP = {
  accepted: { label: '✓ Confirmó asistencia', bg: '#DCFCE7', color: '#15803D' },
  declined: { label: '✗ No asiste', bg: '#FEE2E2', color: '#B91C1C' },
  tentative: { label: '? Quizás asista', bg: '#FEF0D7', color: '#B45309' },
  needs_action: { label: 'Sin responder aún', bg: '#F0F2F5', color: '#6B7280' },
};

const SectionLabel = ({ children, action }) => (
  <div className="flex items-center justify-between mb-1.5">
    <span className="text-[10px] font-bold tracking-widest text-text3 uppercase">{children}</span>
    {action}
  </div>
);

// Drawer derecho — Diseño A: identidad, vínculo, etiquetas, próxima cita,
// notas y archivado. En grupos: quién es quién (participantes + nombres de
// quienes ya hablaron). En mobile se comporta como hoja inferior.
export default function ContactPanel({ open, onClose, onSchedule, onReschedule }) {
  const {
    selectedConversation: conv, updateNotes, updateConversation,
    appointmentsByConv, loadAppointments, cancelAppointment,
    groupDirByConv, loadGroupDirectory,
  } = useSoporte();
  const [linkOpen, setLinkOpen] = useState(false);
  const [showAllParts, setShowAllParts] = useState(false);

  useEffect(() => {
    if (open && conv?.id) {
      if (!conv.is_group) loadAppointments(conv.id);
      else loadGroupDirectory(conv.id);
      setShowAllParts(false);
    }
  }, [open, conv?.id, conv?.is_group, loadAppointments, loadGroupDirectory]);

  if (!open || !conv) return null;

  const name = convName(conv);
  const color = colorFromString(conv.wa_jid);
  // Solo citas vigentes: las canceladas no aportan nada en el panel.
  const proximas = (appointmentsByConv[conv.id] || []).filter((a) => a.status === 'scheduled');

  // Quién es quién: nombres visibles (pushName) primero, después el resto.
  const dir = conv.is_group ? groupDirByConv[conv.id] : null;
  const participants = (dir?.participants || [])
    .map((p) => ({ ...p, displayName: dir?.names?.[p.jid] || null }))
    .sort((a, b) => {
      if (Boolean(b.displayName) !== Boolean(a.displayName)) return b.displayName ? 1 : -1;
      if (a.admin !== b.admin) return a.admin ? -1 : 1;
      return 0;
    });
  const namedCount = participants.filter((p) => p.displayName).length;
  const visibleParts = showAllParts ? participants : participants.slice(0, 6);

  return (
    <>
      {/* Scrim solo en mobile (hoja inferior) */}
      <div className="md:hidden fixed inset-0 bg-[#0D1117]/40 z-[80]" onClick={onClose} />
      <div className="bg-white border-l border-border flex flex-col h-full min-h-0 w-[300px] shrink-0 max-md:fixed max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:top-[17%] max-md:z-[81] max-md:w-full max-md:h-auto max-md:border-l-0 max-md:rounded-t-[22px] max-md:shadow-2xl">
        {/* Handle (solo mobile) */}
        <div className="hidden max-md:flex justify-center pt-2.5">
          <span className="w-10 h-[4.5px] rounded-full bg-border" />
        </div>
        <div className="h-[58px] max-md:h-auto max-md:py-2 border-b border-surface2 flex items-center justify-between px-4 shrink-0">
          <span className="text-[13px] font-bold">{conv.is_group ? 'Detalles del grupo' : 'Detalles'}</span>
          <button onClick={onClose} className="bg-transparent border-0 text-text3 hover:text-text cursor-pointer p-1">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 flex flex-col gap-[18px]">
          {/* Identidad */}
          <div className="flex flex-col items-center text-center gap-1 py-1">
            <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-[20px]"
                 style={{ background: color + '1d', color }}>
              {conv.is_group ? <Users size={26} /> : initials(name)}
            </div>
            <div className="text-[15px] font-bold mt-1">{name}</div>
            <div className="text-[12px] text-text3">
              {conv.is_group ? `Grupo de WhatsApp${participants.length ? ` · ${participants.length} participantes` : ''}` : fmtPhone(conv.wa_phone)}
            </div>
          </div>

          {/* Vinculado a (solo 1:1) */}
          {!conv.is_group && (
            <div>
              <SectionLabel>Vinculado a</SectionLabel>
              <button onClick={() => setLinkOpen(true)}
                      className="w-full text-left px-3 py-2.5 rounded-xl border border-border bg-white hover:border-[#F5D9A8] cursor-pointer transition-colors duration-150 flex items-center gap-2.5">
                {conv.contact || conv.client ? (
                  <>
                    <span className="w-8 h-8 rounded-[9px] bg-[#EEF2FF] flex items-center justify-center shrink-0">
                      <Building2 size={15} className="text-[#4A67D8]" />
                    </span>
                    <span className="flex-1 min-w-0 leading-tight">
                      <span className="block text-[12.5px] font-semibold truncate">
                        {[conv.contact?.full_name, conv.client?.name].filter(Boolean).join(' · ')}
                      </span>
                      <span className="block text-[10.5px] text-text3">
                        {conv.client ? 'Cliente' : 'Contacto del CRM'}
                      </span>
                    </span>
                    <span className="text-[10.5px] font-semibold text-[#4A67D8] shrink-0">Ver ficha →</span>
                  </>
                ) : (
                  <>
                    <Link2 size={14} className="text-[#B45309] shrink-0" />
                    <span className="text-[12.5px] flex-1 text-[#B45309] font-medium">Vincular a contacto o cliente…</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Quién es quién (grupos) */}
          {conv.is_group && participants.length > 0 && (
            <div>
              <SectionLabel action={
                <span className="text-[11px] font-semibold text-text3">
                  {namedCount} con nombre
                </span>
              }>Quién es quién</SectionLabel>
              <div className="flex flex-col gap-0.5">
                {visibleParts.map((p) => {
                  const pname = p.displayName || 'Sin nombre aún';
                  const pcolor = colorFromString(p.jid || '');
                  return (
                    <div key={p.jid} className="flex items-center gap-2.5 px-2 py-1.5 rounded-[10px] hover:bg-surface2 transition-colors duration-150">
                      <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center font-bold text-[10px] shrink-0"
                            style={{ background: pcolor + '1d', color: pcolor }}>
                        {p.displayName ? initials(p.displayName) : <Users size={12} />}
                      </span>
                      <span className="flex-1 min-w-0 leading-tight">
                        <span className={`block text-[12px] font-semibold truncate ${p.displayName ? '' : 'text-text3 font-medium'}`}>{pname}</span>
                        {p.admin && (
                          <span className="block text-[10px] font-semibold text-[#B45309]">Admin del grupo</span>
                        )}
                      </span>
                    </div>
                  );
                })}
                {participants.length > 6 && !showAllParts && (
                  <button onClick={() => setShowAllParts(true)}
                          className="text-left text-[11px] font-semibold text-[#4A67D8] cursor-pointer bg-transparent border-0 px-2 pt-1 hover:underline">
                    Ver los {participants.length} participantes →
                  </button>
                )}
              </div>
              <div className="text-[10px] text-text3 mt-1.5 px-1">
                Los nombres aparecen a medida que cada persona escribe en el grupo.
              </div>
            </div>
          )}

          {/* Etiquetas */}
          <div>
            <SectionLabel>Etiquetas</SectionLabel>
            <TagPicker conv={conv} />
          </div>

          {/* Citas (solo 1:1) */}
          {!conv.is_group && (
            <div>
              <SectionLabel action={
                <button onClick={onSchedule}
                        className="text-[11px] font-semibold text-[#B45309] bg-transparent border-0 cursor-pointer flex items-center gap-1 hover:underline">
                  <CalendarPlus size={12} /> Agendar
                </button>
              }>Próxima cita</SectionLabel>
              {proximas.length === 0 ? (
                <div className="text-[11.5px] text-text3 px-1">Sin citas agendadas.</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {proximas.map((a) => (
                    <div key={a.id} className="px-3 py-2.5 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] text-[12px]">
                      <div className="font-bold text-[12.5px] text-[#15803D] truncate">{a.title}</div>
                      <div className="text-[11.5px] text-text2 capitalize">{fmtCita(a.start_at)}</div>
                      {a.invite_email && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: (RSVP_CHIP[a.rsvp_status] || RSVP_CHIP.needs_action).bg, color: (RSVP_CHIP[a.rsvp_status] || RSVP_CHIP.needs_action).color }}>
                            {(RSVP_CHIP[a.rsvp_status] || RSVP_CHIP.needs_action).label}
                          </span>
                          <span className="text-[10px] text-text3 truncate">{a.invite_email}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {a.meeting_link && (
                          <a href={a.meeting_link} target="_blank" rel="noopener noreferrer"
                             className="text-[11px] font-semibold text-[#2563EB] no-underline hover:underline flex items-center gap-1">
                            <Video size={11} /> Unirse
                          </a>
                        )}
                        <button onClick={() => onReschedule?.(a)}
                                className="text-[11px] font-semibold text-text bg-transparent border-0 cursor-pointer hover:underline flex items-center gap-1 p-0">
                          <CalendarClock size={11} /> Reagendar
                        </button>
                        <button onClick={() => cancelAppointment(conv.id, a.id)}
                                className="text-[11px] font-semibold text-text3 bg-transparent border-0 cursor-pointer hover:text-[#DC2626] flex items-center gap-1 p-0">
                          <CalendarX size={11} /> Cancelar
                        </button>
                        {a.gcal_link && (
                          <a href={a.gcal_link} target="_blank" rel="noopener noreferrer"
                             className="text-[11px] font-semibold text-text3 no-underline hover:underline flex items-center gap-1">
                            <ExternalLink size={10} /> Calendar
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notas */}
          <div>
            <SectionLabel>Notas internas</SectionLabel>
            <textarea
              value={conv.notes || ''}
              onChange={(e) => updateNotes(conv.id, e.target.value)}
              placeholder="Anotá lo importante de este contacto… (se guarda solo)"
              rows={4}
              className="w-full resize-none text-[12px] leading-relaxed px-3 py-2.5 rounded-xl border border-[#F5D9A8] bg-[#FFFBEB]/60 outline-none focus:border-[#F59E0B] transition-colors duration-150"
            />
          </div>

          {/* Archivar: lo saca de la bandeja sin borrar nada. Si el contacto
              vuelve a escribir, el chat reaparece solo. */}
          <div className="border-t border-surface2 pt-3 mt-auto">
            <button
              onClick={() => updateConversation(conv.id, { archived: !conv.archived })}
              className={`w-full py-2 rounded-xl border text-[12px] font-semibold cursor-pointer flex items-center justify-center gap-1.5 transition-colors duration-150 ${conv.archived
                ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7]'
                : 'border-border bg-white text-text2 hover:bg-surface2'}`}
            >
              {conv.archived
                ? (<><ArchiveRestore size={13} /> Desarchivar chat</>)
                : (<><Archive size={13} /> Archivar chat</>)}
            </button>
            {!conv.archived && (
              <div className="text-[10px] text-text3 mt-1 text-center">
                Se va a la pestaña Archivo. Si te escribe, vuelve solo.
              </div>
            )}
          </div>
        </div>
      </div>
      <LinkContactModal open={linkOpen} onClose={() => setLinkOpen(false)} conv={conv} />
    </>
  );
}
