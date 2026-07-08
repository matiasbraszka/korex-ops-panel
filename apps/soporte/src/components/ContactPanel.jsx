import { useEffect, useRef, useState } from 'react';
import { X, Link2, CalendarPlus, CalendarClock, CalendarX, ExternalLink, Users, Building2, Video, Archive, ArchiveRestore, UserCheck, Download, Pencil, UserPlus, Image as ImageIcon } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { useAuth } from '@korex/auth';
import { fetchTeamMembers, fetchAssignees, setAssignees } from '../lib/api.js';
import { initials, colorFromString, convName, fmtPhone } from '../lib/format.js';
import TagPicker from './TagPicker.jsx';
import LinkContactModal from './LinkContactModal.jsx';
import ExportChatModal from './ExportChatModal.jsx';

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
    groupDirByConv, loadGroupDirectory, agendarContact,
    setGroupSubject, setGroupDescription, addParticipant, removeParticipant, setGroupPicture,
  } = useSoporte();
  const { isAdmin } = useAuth();
  const [linkOpen, setLinkOpen] = useState(false);
  const [showAllParts, setShowAllParts] = useState(false);
  const [team, setTeam] = useState([]);
  const [exportOpen, setExportOpen] = useState(false);
  const photoRef = useRef(null);

  // ── Asignación (acceso al chat). member_id = team_members.id. Múltiple.
  // Solo admins pueden cambiarla; un no-admin con rol soporte solo ve sus chats.
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [assigneesBusy, setAssigneesBusy] = useState(false);

  // ── Agendar con nombre a elección (para contactos que NO están en la base) ──
  const [agendarDraft, setAgendarDraft] = useState('');
  const [agendarBusy, setAgendarBusy] = useState(false);
  const [agendarDone, setAgendarDone] = useState(false);

  // ── Edición de grupo (nombre / descripción / participantes) ──
  const [subjectDraft, setSubjectDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [newPart, setNewPart] = useState('');
  const [groupBusy, setGroupBusy] = useState(''); // 'subject' | 'desc' | 'add' | <jid>
  const [groupErr, setGroupErr] = useState('');

  useEffect(() => {
    if (conv?.is_group) {
      setSubjectDraft(conv.wa_profile_name || '');
      setDescDraft(conv.description || '');
      setNewPart('');
      setGroupErr('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.id, conv?.is_group]);

  const groupErrMsg = (e) => {
    const m = String(e?.message || '');
    if (/forbidden|admin|401|403/i.test(m)) return 'Para esto la cuenta de WhatsApp tiene que ser admin del grupo.';
    if (/unreachable|not_configured/i.test(m)) return 'No se pudo conectar con WhatsApp. Probá de nuevo.';
    return 'No se pudo completar la acción. Probá de nuevo.';
  };
  const runGroup = async (busyKey, fn) => {
    setGroupBusy(busyKey); setGroupErr('');
    try { await fn(); }
    catch (e) { console.error('group action', e); setGroupErr(groupErrMsg(e)); }
    finally { setGroupBusy(''); }
  };
  const saveSubject = () => {
    const v = subjectDraft.trim();
    if (!v || v === (conv.wa_profile_name || '')) return;
    runGroup('subject', () => setGroupSubject(conv.id, v));
  };
  const saveDesc = () => {
    if (descDraft === (conv.description || '')) return;
    runGroup('desc', () => setGroupDescription(conv.id, descDraft));
  };
  const addPart = () => {
    const digits = newPart.replace(/\D/g, '');
    if (digits.length < 8) { setGroupErr('Escribí un número válido con código de país.'); return; }
    runGroup('add', async () => { await addParticipant(conv.id, digits); setNewPart(''); });
  };
  const removePart = (jid) => {
    if (!window.confirm('¿Quitar a esta persona del grupo?')) return;
    runGroup(jid, () => removeParticipant(conv.id, jid));
  };
  const pickGroupPhoto = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) { setGroupErr('Elegí una imagen (JPG o PNG).'); return; }
    if (f.size > 5 * 1024 * 1024) { setGroupErr('La imagen supera 5 MB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = String(reader.result || '').split(',')[1] || '';
      if (b64) runGroup('picture', () => setGroupPicture(conv.id, b64, f.type));
    };
    reader.readAsDataURL(f);
  };

  useEffect(() => {
    fetchTeamMembers().then(setTeam).catch(() => {});
  }, []);

  // Cargar los asignados del chat abierto (para la sección "Asignado a").
  useEffect(() => {
    if (!open || !conv?.id) { setAssigneeIds([]); return; }
    let alive = true;
    fetchAssignees(conv.id).then((ids) => { if (alive) setAssigneeIds(ids); }).catch(() => {});
    return () => { alive = false; };
  }, [open, conv?.id]);

  // Prefill del campo "agendar con nombre" con el nombre manual actual.
  useEffect(() => {
    setAgendarDraft(conv?.custom_name || '');
    setAgendarDone(false);
  }, [conv?.id, conv?.custom_name]);

  const saveAgendar = async () => {
    if (agendarBusy) return;
    setAgendarBusy(true); setAgendarDone(false);
    try {
      await agendarContact(conv.id, agendarDraft.trim());
      setAgendarDone(true);
      setTimeout(() => setAgendarDone(false), 2500);
    } catch (e) {
      console.error('agendar', e);
    } finally {
      setAgendarBusy(false);
    }
  };

  // Alterna (agrega/quita) una persona asignada. Optimista + persiste por RPC.
  // La RPC ya sincroniza la columna legacy assigned_to y bumpea updated_at, así
  // que el chat le aparece/desaparece a esa persona por realtime.
  const toggleAssignee = async (memberId) => {
    if (!isAdmin || !conv?.id || assigneesBusy) return;
    const next = assigneeIds.includes(memberId)
      ? assigneeIds.filter((x) => x !== memberId)
      : [...assigneeIds, memberId];
    const prev = assigneeIds;
    setAssigneeIds(next);
    setAssigneesBusy(true);
    try {
      const rows = await setAssignees(conv.id, next);
      setAssigneeIds(rows.map((r) => r.member_id));
    } catch (e) {
      console.error('set assignees', e);
      setAssigneeIds(prev);
    } finally {
      setAssigneesBusy(false);
    }
  };

  useEffect(() => {
    if (open && conv?.id) {
      if (!conv.is_group) loadAppointments(conv.id);
      else loadGroupDirectory(conv.id);
      setShowAllParts(false);
    }
  }, [open, conv?.id, conv?.is_group, loadAppointments, loadGroupDirectory]);

  if (!open || !conv) return null;

  const name = convName(conv, !isAdmin);
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
            {conv.is_group ? (
              <div className="text-[12px] text-text3">
                {`Grupo de WhatsApp${participants.length ? ` · ${participants.length} participantes` : ''}`}
              </div>
            ) : isAdmin ? (
              <button onClick={() => setLinkOpen(true)} title="Vincular a una persona de la base"
                      className="text-[12px] text-text3 bg-transparent border-0 cursor-pointer hover:text-[#B45309] hover:underline p-0">
                {fmtPhone(conv.wa_phone)}
              </button>
            ) : (
              <span className="text-[12px] text-text3">Número oculto</span>
            )}
          </div>

          {/* Cliente del grupo: qué cliente corresponde a este grupo de WhatsApp */}
          {conv.is_group && (
            <div>
              <SectionLabel>Cliente del grupo</SectionLabel>
              <button onClick={isAdmin ? () => setLinkOpen(true) : undefined}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border border-border bg-white transition-colors duration-150 flex items-center gap-2.5 ${isAdmin ? 'hover:border-[#F5D9A8] cursor-pointer' : 'cursor-default'}`}>
                {conv.client ? (
                  <>
                    <span className="w-8 h-8 rounded-[9px] bg-[#EEF2FF] flex items-center justify-center shrink-0">
                      <Building2 size={15} className="text-[#4A67D8]" />
                    </span>
                    <span className="flex-1 min-w-0 leading-tight">
                      <span className="block text-[12.5px] font-semibold truncate">{conv.client.name}</span>
                      <span className="block text-[10.5px] text-text3">Cliente</span>
                    </span>
                    {isAdmin && <span className="text-[10.5px] font-semibold text-[#4A67D8] shrink-0">Cambiar</span>}
                  </>
                ) : isAdmin ? (
                  <>
                    <Link2 size={14} className="text-[#B45309] shrink-0" />
                    <span className="text-[12.5px] flex-1 text-[#B45309] font-medium">Vincular grupo a un cliente…</span>
                  </>
                ) : (
                  <span className="text-[12.5px] flex-1 text-text3">Sin vincular</span>
                )}
              </button>
            </div>
          )}

          {/* Editar grupo (nombre + descripción). Requiere ser admin del grupo. */}
          {conv.is_group && (
            <div>
              <SectionLabel>Grupo</SectionLabel>
              <div className="flex flex-col gap-2.5">
                <div>
                  <div className="text-[10.5px] text-text3 mb-0.5 flex items-center gap-1"><Pencil size={10} /> Nombre</div>
                  <div className="flex items-center gap-1.5">
                    <input value={subjectDraft} onChange={(e) => setSubjectDraft(e.target.value)}
                           className="flex-1 min-w-0 px-2.5 py-1.5 text-[12.5px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
                    <button onClick={saveSubject}
                            disabled={groupBusy === 'subject' || !subjectDraft.trim() || subjectDraft.trim() === (conv.wa_profile_name || '')}
                            className="shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border-0 bg-[#F59E0B] text-white cursor-pointer disabled:opacity-50 disabled:cursor-default">
                      {groupBusy === 'subject' ? '…' : 'Guardar'}
                    </button>
                  </div>
                </div>
                <div>
                  <div className="text-[10.5px] text-text3 mb-0.5">Descripción</div>
                  <textarea value={descDraft} onChange={(e) => setDescDraft(e.target.value)} rows={3}
                            placeholder="Descripción del grupo…"
                            className="w-full resize-none px-2.5 py-1.5 text-[12.5px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
                  <button onClick={saveDesc}
                          disabled={groupBusy === 'desc' || descDraft === (conv.description || '')}
                          className="mt-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border-0 bg-[#F59E0B] text-white cursor-pointer disabled:opacity-50 disabled:cursor-default">
                    {groupBusy === 'desc' ? 'Guardando…' : 'Guardar descripción'}
                  </button>
                </div>
                {/* Foto del grupo (requiere ser admin) */}
                <div>
                  <div className="text-[10.5px] text-text3 mb-0.5 flex items-center gap-1"><ImageIcon size={10} /> Foto del grupo</div>
                  <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={pickGroupPhoto} />
                  <button onClick={() => photoRef.current?.click()} disabled={groupBusy === 'picture'}
                          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border border-border bg-white text-text2 cursor-pointer hover:bg-surface2 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-default">
                    <ImageIcon size={12} /> {groupBusy === 'picture' ? 'Actualizando…' : 'Cambiar foto del grupo'}
                  </button>
                </div>
                {groupErr && <div className="text-[11px] font-medium text-[#DC2626]">{groupErr}</div>}
                <div className="text-[10px] text-text3">
                  Para cambiar el nombre, la descripción o los miembros, la cuenta de WhatsApp debe ser admin del grupo.
                </div>
              </div>
            </div>
          )}

          {/* Vinculado a (solo 1:1) */}
          {!conv.is_group && (
            <div>
              <SectionLabel>Vinculado a</SectionLabel>
              <button onClick={isAdmin ? () => setLinkOpen(true) : undefined}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border border-border bg-white transition-colors duration-150 flex items-center gap-2.5 ${isAdmin ? 'hover:border-[#F5D9A8] cursor-pointer' : 'cursor-default'}`}>
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
                        {conv.client ? 'Cliente' : 'Persona de la base'}
                      </span>
                    </span>
                    {isAdmin && <span className="text-[10.5px] font-semibold text-[#4A67D8] shrink-0">Cambiar</span>}
                  </>
                ) : isAdmin ? (
                  <>
                    <Link2 size={14} className="text-[#B45309] shrink-0" />
                    <span className="text-[12.5px] flex-1 text-[#B45309] font-medium">Vincular a una persona de la base…</span>
                  </>
                ) : (
                  <span className="text-[12.5px] flex-1 text-text3">Sin vincular</span>
                )}
              </button>
            </div>
          )}

          {/* Agendar con nombre a elección → Google Contacts (solo 1:1).
              Para contactos que NO están en la base. Si el chat ya está vinculado
              a la base, ESE nombre tiene prioridad al mostrarse en el panel. */}
          {!conv.is_group && (
            <div>
              <SectionLabel>Agendar con nombre</SectionLabel>
              <div className="flex items-center gap-1.5">
                <input
                  value={agendarDraft}
                  onChange={(e) => setAgendarDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveAgendar(); }}
                  placeholder="Nombre para guardar…"
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-[12.5px] rounded-lg border border-border outline-none focus:border-[#F59E0B]"
                />
                <button onClick={saveAgendar}
                        disabled={agendarBusy || agendarDraft.trim() === (conv.custom_name || '')}
                        className="shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border-0 bg-[#F59E0B] text-white cursor-pointer disabled:opacity-50 disabled:cursor-default">
                  {agendarBusy ? '…' : (agendarDone ? '✓ Listo' : 'Agendar')}
                </button>
              </div>
              <div className="text-[10px] text-text3 mt-1">
                Lo guarda en Google Contacts para que veas el nombre cuando te escriba.
                {(conv.contact || conv.client) && ' Este chat ya está en la base: ese nombre tiene prioridad.'}
              </div>
            </div>
          )}

          {/* Participantes (grupos): ver, quitar y agregar */}
          {conv.is_group && (
            <div>
              <SectionLabel action={
                <span className="text-[11px] font-semibold text-text3">
                  {participants.length} · {namedCount} con nombre
                </span>
              }>Participantes</SectionLabel>
              <div className="flex flex-col gap-0.5">
                {visibleParts.map((p) => {
                  const pname = p.displayName || 'Sin nombre aún';
                  const pcolor = colorFromString(p.jid || '');
                  return (
                    <div key={p.jid} className="group flex items-center gap-2.5 px-2 py-1.5 rounded-[10px] hover:bg-surface2 transition-colors duration-150">
                      <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center font-bold text-[10px] shrink-0"
                            style={{ background: pcolor + '1d', color: pcolor }}>
                        {p.displayName ? initials(p.displayName) : <Users size={12} />}
                      </span>
                      <span className="flex-1 min-w-0 leading-tight">
                        <span className={`block text-[12px] font-semibold truncate ${p.displayName ? '' : 'text-text3 font-medium'}`}>{pname}</span>
                        <span className="block text-[10px] text-text3 truncate">
                          {p.admin ? 'Admin · ' : ''}{isAdmin && p.phone ? `+${p.phone}` : ''}
                        </span>
                      </span>
                      <button onClick={() => removePart(p.jid)} disabled={groupBusy === p.jid}
                              title="Quitar del grupo"
                              className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 bg-transparent border-0 text-text3 hover:text-[#DC2626] cursor-pointer p-1 disabled:opacity-40 transition-opacity duration-150">
                        <X size={13} />
                      </button>
                    </div>
                  );
                })}
                {participants.length > 6 && !showAllParts && (
                  <button onClick={() => setShowAllParts(true)}
                          className="text-left text-[11px] font-semibold text-[#4A67D8] cursor-pointer bg-transparent border-0 px-2 pt-1 hover:underline">
                    Ver los {participants.length} participantes →
                  </button>
                )}
                {participants.length === 0 && (
                  <div className="text-[11.5px] text-text3 px-1 py-1">Todavía no cargamos los participantes de este grupo.</div>
                )}
              </div>
              {/* Agregar participante por número */}
              <div className="flex items-center gap-1.5 mt-2">
                <input value={newPart} onChange={(e) => setNewPart(e.target.value)}
                       onKeyDown={(e) => { if (e.key === 'Enter') addPart(); }}
                       placeholder="Agregar por número (con código de país)…"
                       className="flex-1 min-w-0 px-2.5 py-1.5 text-[12px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
                <button onClick={addPart} disabled={groupBusy === 'add' || !newPart.replace(/\D/g, '')}
                        className="shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border-0 bg-[#F59E0B] text-white cursor-pointer flex items-center gap-1 disabled:opacity-50 disabled:cursor-default">
                  <UserPlus size={12} /> {groupBusy === 'add' ? '…' : 'Agregar'}
                </button>
              </div>
              <div className="text-[10px] text-text3 mt-1.5 px-1">
                Los nombres aparecen a medida que cada persona escribe en el grupo.
              </div>
            </div>
          )}

          {/* Asignado a — quién puede ver y atender este chat (varias personas).
              Solo los administradores cambian la asignación; una persona con rol
              soporte (no admin) únicamente ve los chats que tiene asignados. */}
          <div>
            <SectionLabel>Asignado a</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {assigneeIds.length === 0 && (
                <span className="text-[11.5px] text-text3 px-1 py-0.5">
                  {isAdmin ? 'Sin asignar — elegí abajo' : 'Sin asignar'}
                </span>
              )}
              {assigneeIds.map((id) => {
                const m = team.find((t) => t.id === id);
                return (
                  <span key={id}
                        className="inline-flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-full bg-[#FFFBEB] border border-[#F5D9A8] text-[11.5px] font-semibold text-[#B45309]">
                    <UserCheck size={11} />
                    {m?.name || id}
                    {isAdmin && (
                      <button onClick={() => toggleAssignee(id)} disabled={assigneesBusy}
                              title="Quitar" className="bg-transparent border-0 text-[#B45309] hover:text-[#DC2626] cursor-pointer p-0 ml-0.5 disabled:opacity-40">
                        <X size={11} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
            {isAdmin && (
              <>
                <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl border border-border bg-white">
                  <UserPlus size={14} className="text-text3 shrink-0" />
                  <select value="" disabled={assigneesBusy}
                          onChange={(e) => { const v = e.target.value; e.target.value = ''; if (v) toggleAssignee(v); }}
                          className="flex-1 text-[12.5px] font-medium border-0 outline-none bg-transparent cursor-pointer disabled:opacity-50">
                    <option value="">Asignar persona…</option>
                    {team.filter((m) => !assigneeIds.includes(m.id)).map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div className="text-[10px] text-text3 mt-1 px-1">
                  Quien no sea administrador solo verá los chats que le asignes (y sin el número de teléfono).
                </div>
              </>
            )}
          </div>

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

          {/* Exportar el chat a texto (rango de fechas + transcripción de audios) */}
          <div className="border-t border-surface2 pt-3 mt-auto">
            <button
              onClick={() => setExportOpen(true)}
              className="w-full py-2 mb-2 rounded-xl border border-border bg-white text-text2 text-[12px] font-semibold cursor-pointer flex items-center justify-center gap-1.5 hover:bg-surface2 transition-colors duration-150"
            >
              <Download size={13} /> Exportar chat (.txt)
            </button>
          </div>

          {/* Archivar: lo saca de la bandeja sin borrar nada. Si el contacto
              vuelve a escribir, el chat reaparece solo. */}
          <div className="border-t border-surface2 pt-3">
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
      <ExportChatModal open={exportOpen} onClose={() => setExportOpen(false)} conv={conv} />
    </>
  );
}
