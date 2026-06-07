import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Send, MessageSquare, Calendar, AlertTriangle, Building2, FileText, Lightbulb, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import TeamAvatar from '../TeamAvatar';
import CommentItem from './CommentItem';
import MentionTextarea from './MentionTextarea';
import { TASK_STATUS, PHASES } from '../../utils/constants';
import { getBullets, fmtTime, dayKey } from '../../utils/helpers';
import { formatSystemEvent, formatReportEvent } from '../../utils/taskActivity';

// CommentsSidePanel — panel lateral de actividad (comentarios + contexto
// de la tarea). Se monta una sola vez al root de la app y abre/cierra via
// openTaskComments(taskId) / closeComments() en AppContext.
//
// Diseño: side drawer a la derecha de 408px con scrim + slide-in,
// composer abajo con avatar + textarea + send circular.
// fmtTime y dayKey viven en utils/helpers.js (fuente única).

export default function CommentsSidePanel() {
  const {
    currentUser, teamMembers, tasks, clients,
    taskComments, addTaskComment, updateTaskComment, deleteTaskComment,
    bulletComments, addBulletComment, updateBulletComment, deleteBulletComment,
    ideas, ideaComments, addIdeaComment, updateIdeaComment, deleteIdeaComment,
    teamBlockers, blockerComments, addBlockerComment, updateBlockerComment, deleteBlockerComment,
    teamReports,
    commentsTarget, closeComments,
  } = useApp();

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  // Mantener el target visible durante el slide-out aunque ya se cierre.
  const lastTargetRef = useRef(null);
  const taRef = useRef(null);

  const isAdmin = !!(currentUser?.isAdmin || currentUser?.role === 'COO');
  const open = !!commentsTarget;
  if (commentsTarget) lastTargetRef.current = commentsTarget;
  const shownTarget = commentsTarget || lastTargetRef.current;
  const kind = shownTarget?.kind || 'task';

  // ── Modo task ──
  const task = useMemo(
    () => kind === 'task' ? ((tasks || []).find(t => t.id === shownTarget?.taskId) || null) : null,
    [tasks, shownTarget, kind],
  );
  const shownTask = task;
  const shownClient = shownTask ? (clients || []).find(c => c.id === shownTask.clientId) : null;

  // ── Modo bullet ──
  const report = useMemo(
    () => kind === 'bullet' ? ((teamReports || []).find(r => r.id === shownTarget?.reportId) || null) : null,
    [teamReports, shownTarget, kind],
  );
  const bullet = useMemo(() => {
    if (kind !== 'bullet' || !report) return null;
    const pbc = Array.isArray(report.progress_by_client) ? report.progress_by_client : [];
    for (const item of pbc) {
      const bullets = getBullets(item);
      const found = bullets.find(b => b.id === shownTarget?.bulletId);
      if (found) return { ...found, clientId: item.client_id || null };
    }
    return null;
  }, [report, shownTarget, kind]);
  const bulletAuthor = report ? (teamMembers || []).find(m => m.id === report.user_id) : null;
  const bulletClient = bullet?.clientId ? (clients || []).find(c => c.id === bullet.clientId) : null;

  // ── Modo idea ──
  const idea = useMemo(
    () => kind === 'idea' ? ((ideas || []).find(i => i.id === shownTarget?.ideaId) || null) : null,
    [ideas, shownTarget, kind],
  );
  const ideaAuthor = idea ? (teamMembers || []).find(m => m.id === idea.author_id) : null;

  // ── Modo blocker ──
  const blocker = useMemo(
    () => kind === 'blocker' ? ((teamBlockers || []).find(b => b.id === shownTarget?.blockerId) || null) : null,
    [teamBlockers, shownTarget, kind],
  );
  const blockerAuthor = blocker ? (teamMembers || []).find(m => m.id === blocker.user_id) : null;
  const blockerClient = blocker?.client_id ? (clients || []).find(c => c.id === blocker.client_id) : null;

  const memberById = useMemo(() => {
    const m = {};
    (teamMembers || []).forEach(t => { m[t.id] = t; });
    return m;
  }, [teamMembers]);

  const myComments = useMemo(() => {
    if (kind === 'task') {
      if (!shownTask) return [];
      return (taskComments || [])
        .filter(c => c.task_id === shownTask.id)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    }
    if (kind === 'bullet') {
      if (!shownTarget) return [];
      return (bulletComments || [])
        .filter(c => c.report_id === shownTarget.reportId && c.bullet_id === shownTarget.bulletId)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    }
    if (kind === 'idea') {
      if (!idea) return [];
      return (ideaComments || [])
        .filter(c => c.idea_id === idea.id)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    }
    if (kind === 'blocker') {
      if (!blocker) return [];
      return (blockerComments || [])
        .filter(c => c.blocker_id === blocker.id)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    }
    return [];
  }, [kind, taskComments, bulletComments, ideaComments, blockerComments, shownTask, shownTarget, idea, blocker]);

  // Agrupar por dia (Hoy / Ayer / fecha) — solo raices; respuestas debajo.
  const groupedByDay = useMemo(() => {
    const roots = myComments.filter(c => !c.parent_id);
    const repliesByParent = {};
    myComments.forEach(c => {
      if (c.parent_id) {
        if (!repliesByParent[c.parent_id]) repliesByParent[c.parent_id] = [];
        repliesByParent[c.parent_id].push(c);
      }
    });
    const order = [];
    const byDay = {};
    roots.forEach(r => {
      const key = dayKey(r.created_at);
      if (!byDay[key]) { byDay[key] = []; order.push(key); }
      byDay[key].push(r);
    });
    return { order, byDay, repliesByParent };
  }, [myComments]);

  // Reset draft cuando cambia el target + manejar Escape global.
  useEffect(() => {
    setDraft('');
    setReplyTo(null);
  }, [commentsTarget?.taskId, commentsTarget?.reportId, commentsTarget?.bulletId, commentsTarget?.ideaId, commentsTarget?.blockerId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') closeComments(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closeComments]);

  // Autosize del textarea.
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = '44px';
    taRef.current.style.height = Math.min(120, taRef.current.scrollHeight) + 'px';
  }, [draft]);

  // Cerrar foco al cerrar el panel (limpia state)
  useEffect(() => {
    if (open) {
      // pequeño delay para que entre la animación primero
      const t = setTimeout(() => taRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }
  }, [open]);

  const hasTarget =
    kind === 'task' ? !!shownTask
    : kind === 'bullet' ? (!!report && !!bullet)
    : kind === 'idea' ? !!idea
    : kind === 'blocker' ? !!blocker
    : false;
  const canSubmit = !sending && draft.trim().length > 0 && currentUser?.id && hasTarget;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSending(true);
    try {
      const common = { parent_id: replyTo || null, body: draft, author_id: currentUser.id };
      if (kind === 'task')         await addTaskComment   ({ ...common, task_id: shownTask.id });
      else if (kind === 'bullet')  await addBulletComment ({ ...common, report_id: shownTarget.reportId, bullet_id: shownTarget.bulletId });
      else if (kind === 'idea')    await addIdeaComment   ({ ...common, idea_id: idea.id });
      else if (kind === 'blocker') await addBlockerComment({ ...common, blocker_id: blocker.id });
      setDraft('');
      setReplyTo(null);
    } catch (e) {
      alert('No se pudo guardar el comentario. Reintentá.');
    } finally {
      setSending(false);
    }
  };

  const handleUpdate = async (id, body) => {
    if (kind === 'task')         await updateTaskComment   (id, { body });
    else if (kind === 'bullet')  await updateBulletComment (id, { body });
    else if (kind === 'idea')    await updateIdeaComment   (id, { body });
    else if (kind === 'blocker') await updateBlockerComment(id, { body });
  };
  const handleDelete = async (id) => {
    if (kind === 'task')         await deleteTaskComment   (id);
    else if (kind === 'bullet')  await deleteBulletComment (id);
    else if (kind === 'idea')    await deleteIdeaComment   (id);
    else if (kind === 'blocker') await deleteBlockerComment(id);
  };

  // Click en "Responder" en un comentario raiz: setea el destino + mete un
  // @Nombre en el draft + foco al composer.
  const startReply = (rootId, rootAuthorId) => {
    setReplyTo(rootId);
    const name = memberById[rootAuthorId]?.name?.split(' ')[0] || '';
    setDraft(prev => (prev && !prev.startsWith('@')) ? prev : (name ? `@${name} ` : ''));
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const total = myComments.length;
  const phase = shownClient?.phaseNameOverrides && shownTask?.phase && shownClient.phaseNameOverrides[shownTask.phase];

  // StatusDot inline para el header del panel (chiquito).
  const statusCfg = shownTask ? (TASK_STATUS[shownTask.status] || TASK_STATUS.backlog) : null;

  return (
    <>
      <div
        className={`fixed inset-0 z-[80] transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(20,24,32,.28)' }}
        onClick={closeComments}
      />
      <aside
        className="fixed top-0 right-0 bottom-0 z-[81] bg-white border-l border-[#E2E5EB] flex flex-col"
        style={{
          width: 408,
          maxWidth: '92vw',
          transform: open ? 'translateX(0)' : 'translateX(440px)',
          transition: 'transform .26s cubic-bezier(.4,0,.2,1)',
          boxShadow: '-12px 0 32px rgba(10,22,40,.10)',
          fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
        }}
        aria-hidden={!open}
      >
        {hasTarget && (
          <>
            {/* Head */}
            <div className="px-[18px] py-4 border-b border-[#EEF0F3]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-[#1A1D26]">Actividad</span>
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-[#EEF2FF] text-[#4A67D8]">
                    <MessageSquare size={10} />
                    {total} comentario{total !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={closeComments}
                  className="w-7 h-7 rounded-lg bg-transparent border-none text-[#9CA3AF] hover:bg-[#EEF2FF] hover:text-[#5B7CF5] cursor-pointer flex items-center justify-center transition-colors"
                  title="Cerrar (Esc)"
                ><X size={16} /></button>
              </div>
              {/* Contexto del target (tarea o bullet) */}
              {kind === 'task' && shownTask && (
                <div className="flex items-start gap-2.5 bg-[#F7F8FA] rounded-[11px] px-3 py-2.5">
                  {statusCfg && (
                    <span
                      className="shrink-0 w-[18px] h-[18px] rounded-full inline-flex items-center justify-center text-[10px] font-bold mt-0.5"
                      style={{
                        background: (statusCfg.color || '#9CA3AF') + '15',
                        color: statusCfg.color || '#9CA3AF',
                        border: `1.6px solid ${statusCfg.color || '#9CA3AF'}`,
                      }}
                    >{statusCfg.icon || '○'}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-[#1A1D26] leading-snug break-words">
                      {shownTask.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {shownClient && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-[#6B7280]">
                          <Building2 size={10} />{shownClient.name}
                        </span>
                      )}
                      {shownTask.dueDate && (() => {
                        const overdue = shownTask.dueDate < new Date().toISOString().slice(0, 10) && shownTask.status !== 'done';
                        return (
                          <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full px-2 py-0.5 ${overdue ? 'bg-[#FEF2F2] text-[#DC4B43]' : 'bg-[#F0F2F5] text-[#6B7280]'}`}>
                            {overdue ? <AlertTriangle size={9} /> : <Calendar size={9} />}
                            {new Date(shownTask.dueDate + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
              {kind === 'idea' && idea && (
                <div className="flex items-start gap-2.5 bg-[#F7F8FA] rounded-[11px] px-3 py-2.5">
                  <span className="shrink-0 w-[22px] h-[22px] rounded-full inline-flex items-center justify-center bg-amber-100 text-amber-600 mt-0.5">
                    <Lightbulb size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-[#1A1D26] leading-snug break-words">{idea.title}</div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {idea.department && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-[#EEF2FF] text-[#4A67D8]">
                          {idea.department}
                        </span>
                      )}
                      {ideaAuthor && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-[#6B7280]">
                          <FileText size={10} /> Propuesta por {ideaAuthor.name?.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {kind === 'blocker' && blocker && (
                <div className="flex items-start gap-2.5 bg-[#F7F8FA] rounded-[11px] px-3 py-2.5">
                  <span className="shrink-0 w-[22px] h-[22px] rounded-full inline-flex items-center justify-center bg-red-100 text-red-600 mt-0.5">
                    <AlertCircle size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-[#1A1D26] leading-snug break-words">{blocker.description}</div>
                    {blocker.needs && (
                      <div className="text-[11.5px] text-[#6B7280] mt-1 leading-snug break-words">
                        <span className="font-semibold">Necesita:</span> {blocker.needs}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {blockerAuthor && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-[#6B7280]">
                          <FileText size={10} /> Reportado por {blockerAuthor.name?.split(' ')[0]}
                        </span>
                      )}
                      {blockerClient && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-[#6B7280]">
                          <Building2 size={10} />{blockerClient.name}
                        </span>
                      )}
                      {blocker.resolved && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-[#ECFDF5] text-[#16A34A]">
                          ✓ Resuelto
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {kind === 'bullet' && bullet && report && (
                <div className="flex items-start gap-2.5 bg-[#F7F8FA] rounded-[11px] px-3 py-2.5">
                  <span
                    className="shrink-0 w-[18px] h-[18px] rounded-full inline-flex items-center justify-center text-[10px] font-bold mt-0.5"
                    style={{
                      background: bullet.category === 'entregable' ? '#ECFDF5' : bullet.category === 'avance' ? '#EEF2FF' : '#F0F2F5',
                      color: bullet.category === 'entregable' ? '#16A34A' : bullet.category === 'avance' ? '#5B7CF5' : '#6B7280',
                      border: `1.6px solid ${bullet.category === 'entregable' ? '#16A34A' : bullet.category === 'avance' ? '#5B7CF5' : '#9CA3AF'}`,
                    }}
                  >{bullet.category === 'entregable' ? '✓' : bullet.category === 'avance' ? '•' : '–'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-[#1A1D26] leading-snug break-words">
                      {bullet.text}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[10.5px] text-[#6B7280]">
                        <FileText size={10} />
                        Informe de {bulletAuthor?.name || 'equipo'}
                      </span>
                      {bulletClient && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-[#6B7280]">
                          <Building2 size={10} />{bulletClient.name}
                        </span>
                      )}
                      {report.report_date && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-[#F0F2F5] text-[#6B7280]">
                          <Calendar size={9} />
                          {new Date(report.report_date + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Body — feed por día */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-[18px] py-4">
              {groupedByDay.order.length === 0 ? (
                <div className="text-[12.5px] text-[#9CA3AF] italic text-center py-10">
                  Sin actividad todavía. Empezá la conversación abajo.
                </div>
              ) : (
                groupedByDay.order.map(day => (
                  <div key={day}>
                    <div className="flex items-center gap-3 text-[10px] font-bold tracking-wider uppercase text-[#B6BCC4] my-3">
                      <span className="flex-1 h-px bg-[#EEF0F3]" />
                      {day}
                      <span className="flex-1 h-px bg-[#EEF0F3]" />
                    </div>
                    {groupedByDay.byDay[day].map(root => {
                      const rootKind = root.kind || 'user';
                      if (rootKind === 'system') {
                        const phases = shownClient ? { ...PHASES, ...(shownClient.phaseNameOverrides || {}) } : PHASES;
                        const ev = formatSystemEvent(root.event_meta, { phases });
                        const author = memberById[root.author_id];
                        return (
                          <div key={root.id} className="mb-3 flex items-center gap-2 text-[11px] text-[#6B7280]">
                            <span className="flex-1 h-px bg-[#EEF0F3]" />
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#F7F8FA] border border-[#EEF0F3]">
                              <span style={{ color: ev.iconColor || '#6B7280' }}>{ev.icon}</span>
                              <span>{ev.text}</span>
                              <span className="text-[#9CA3AF]">·</span>
                              <span>{author?.name?.split(' ')[0] || 'sistema'}</span>
                              <span className="text-[#9CA3AF]">·</span>
                              <span>{fmtTime(root.created_at)}</span>
                            </span>
                            <span className="flex-1 h-px bg-[#EEF0F3]" />
                          </div>
                        );
                      }
                      if (rootKind === 'report') {
                        const ev = formatReportEvent(root.event_meta, root.body);
                        const author = memberById[root.author_id];
                        return (
                          <div key={root.id} className="mb-3 ml-1">
                            <div
                              className="rounded-[11px] border-l-4 px-3 py-2 bg-white"
                              style={{ borderLeftColor: ev.color, background: ev.bg }}
                            >
                              <div className="flex items-center gap-1.5 mb-1">
                                <span
                                  className="text-[9.5px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full"
                                  style={{ background: ev.color, color: 'white' }}
                                >{ev.badge}</span>
                                <span className="text-[10.5px] text-[#6B7280]">
                                  {author?.name?.split(' ')[0] || 'equipo'} · {fmtTime(root.created_at)}
                                </span>
                              </div>
                              <div className="text-[12.5px] text-[#1A1D26] leading-snug whitespace-pre-wrap break-words">
                                {ev.body}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={root.id} className="mb-4 space-y-2">
                          <CommentItem
                            comment={root}
                            author={memberById[root.author_id]}
                            canReply
                            canEdit={root.author_id === currentUser?.id}
                            canDelete={root.author_id === currentUser?.id || isAdmin}
                            onReply={() => startReply(root.id, root.author_id)}
                            onUpdate={async (id, body) => { await handleUpdate(id, body); }}
                            onDelete={async (id) => { await handleDelete(id); }}
                          />
                          {(groupedByDay.repliesByParent[root.id] || []).map(rep => (
                            <CommentItem
                              key={rep.id}
                              comment={rep}
                              author={memberById[rep.author_id]}
                              isReply
                              canEdit={rep.author_id === currentUser?.id}
                              canDelete={rep.author_id === currentUser?.id || isAdmin}
                              onUpdate={async (id, body) => { await handleUpdate(id, body); }}
                              onDelete={async (id) => { await handleDelete(id); }}
                            />
                          ))}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-[#EEF0F3] px-[18px] py-3.5">
              {replyTo && (() => {
                const target = myComments.find(c => c.id === replyTo);
                const author = target ? memberById[target.author_id] : null;
                return (
                  <div className="flex items-center justify-between bg-[#EEF2FF] text-[#4A67D8] text-[11px] font-semibold rounded-md px-2.5 py-1 mb-2">
                    <span className="truncate">Respondiendo a {author?.name || 'comentario'}</span>
                    <button
                      type="button"
                      onClick={() => { setReplyTo(null); setDraft(''); }}
                      className="ml-2 text-[#4A67D8] hover:text-[#1A1D26] bg-transparent border-none cursor-pointer flex items-center justify-center"
                      title="Cancelar respuesta"
                    ><X size={12} /></button>
                  </div>
                );
              })()}
              <div className="flex items-end gap-2.5">
                {currentUser && (
                  <TeamAvatar
                    member={{ ...currentUser, avatar: currentUser.avatar_url || currentUser.avatar }}
                    size={30}
                  />
                )}
                <div className="flex-1">
                  <MentionTextarea
                    ref={taRef}
                    value={draft}
                    onChange={setDraft}
                    onSubmit={handleSubmit}
                    teamMembers={teamMembers || []}
                    excludeId={currentUser?.id}
                    placeholder="Escribí un comentario… Usá @ para etiquetar (Ctrl+Enter)"
                    disabled={sending}
                    rows={1}
                    className="w-full border border-[#E2E5EB] rounded-[11px] py-2.5 px-3 text-[12.5px] font-sans outline-none focus:border-[#5B7CF5] resize-none bg-white disabled:bg-[#F7F8FA]"
                    style={{ minHeight: 44, maxHeight: 120, lineHeight: 1.45, boxShadow: 'none' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={`w-[42px] h-[42px] rounded-[10px] border-none flex items-center justify-center cursor-pointer transition-colors ${
                    canSubmit ? 'bg-[#5B7CF5] hover:bg-[#4A67D8] text-white' : 'bg-[#C7D2FB] text-white cursor-default'
                  }`}
                  title="Enviar (Ctrl+Enter)"
                ><Send size={16} /></button>
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
