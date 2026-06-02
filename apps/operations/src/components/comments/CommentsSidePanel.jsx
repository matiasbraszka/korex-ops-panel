import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Send, MessageSquare, Calendar, AlertTriangle, Building2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import TeamAvatar from '../TeamAvatar';
import CommentItem from './CommentItem';
import { TASK_STATUS } from '../../utils/constants';

// CommentsSidePanel — panel lateral de actividad (comentarios + contexto
// de la tarea). Se monta una sola vez al root de la app y abre/cierra via
// openTaskComments(taskId) / closeTaskComments() en AppContext.
//
// Diseño: side drawer a la derecha de 408px con scrim + slide-in,
// composer abajo con avatar + textarea + send circular.

function fmtTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'recién';
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function dayKey(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (isSameDay(d, today)) return 'Hoy';
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (isSameDay(d, yest)) return 'Ayer';
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
}

export default function CommentsSidePanel() {
  const {
    currentUser, teamMembers, tasks, clients,
    taskComments, addTaskComment, updateTaskComment, deleteTaskComment,
    openCommentTaskId, closeTaskComments,
  } = useApp();

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Mantener la tarea visible durante el slide-out aunque ya se cierre.
  const lastTaskRef = useRef(null);
  const taRef = useRef(null);

  const isAdmin = !!(currentUser?.isAdmin || currentUser?.role === 'COO');
  const open = !!openCommentTaskId;

  const task = useMemo(
    () => (tasks || []).find(t => t.id === openCommentTaskId) || null,
    [tasks, openCommentTaskId],
  );
  if (task) lastTaskRef.current = task;
  const shownTask = task || lastTaskRef.current;
  const shownClient = shownTask ? (clients || []).find(c => c.id === shownTask.clientId) : null;

  const memberById = useMemo(() => {
    const m = {};
    (teamMembers || []).forEach(t => { m[t.id] = t; });
    return m;
  }, [teamMembers]);

  const myComments = useMemo(() => {
    if (!shownTask) return [];
    return (taskComments || [])
      .filter(c => c.task_id === shownTask.id)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  }, [taskComments, shownTask]);

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

  // Reset draft cuando cambia la tarea + manejar Escape global.
  useEffect(() => {
    setDraft('');
  }, [openCommentTaskId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') closeTaskComments(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closeTaskComments]);

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

  const canSubmit = !sending && draft.trim().length > 0 && currentUser?.id && shownTask;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSending(true);
    try {
      await addTaskComment({
        task_id: shownTask.id,
        parent_id: null,
        body: draft,
        author_id: currentUser.id,
      });
      setDraft('');
    } catch (e) {
      alert('No se pudo guardar el comentario. Reintentá.');
    } finally {
      setSending(false);
    }
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
        onClick={closeTaskComments}
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
        {shownTask && (
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
                  onClick={closeTaskComments}
                  className="w-7 h-7 rounded-lg bg-transparent border-none text-[#9CA3AF] hover:bg-[#EEF2FF] hover:text-[#5B7CF5] cursor-pointer flex items-center justify-center transition-colors"
                  title="Cerrar (Esc)"
                ><X size={16} /></button>
              </div>
              {/* Contexto de la tarea */}
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
                    {groupedByDay.byDay[day].map(root => (
                      <div key={root.id} className="mb-4 space-y-2">
                        <CommentItem
                          comment={root}
                          author={memberById[root.author_id]}
                          canReply
                          canEdit={root.author_id === currentUser?.id}
                          canDelete={root.author_id === currentUser?.id || isAdmin}
                          onReply={() => {
                            // pre-rellena el composer con un @prefijo simple
                            const name = memberById[root.author_id]?.name?.split(' ')[0] || '';
                            setDraft(prev => prev ? prev : (name ? `@${name} ` : ''));
                            taRef.current?.focus();
                          }}
                          onUpdate={async (id, body) => { await updateTaskComment(id, { body }); }}
                          onDelete={async (id) => { await deleteTaskComment(id); }}
                        />
                        {(groupedByDay.repliesByParent[root.id] || []).map(rep => (
                          <CommentItem
                            key={rep.id}
                            comment={rep}
                            author={memberById[rep.author_id]}
                            isReply
                            canEdit={rep.author_id === currentUser?.id}
                            canDelete={rep.author_id === currentUser?.id || isAdmin}
                            onUpdate={async (id, body) => { await updateTaskComment(id, { body }); }}
                            onDelete={async (id) => { await deleteTaskComment(id); }}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-[#EEF0F3] px-[18px] py-3.5">
              <div className="flex items-end gap-2.5">
                {currentUser && (
                  <TeamAvatar
                    member={{ ...currentUser, avatar: currentUser.avatar_url || currentUser.avatar }}
                    size={30}
                  />
                )}
                <textarea
                  ref={taRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribí un comentario…  (Ctrl+Enter)"
                  disabled={sending}
                  rows={1}
                  className="flex-1 border border-[#E2E5EB] rounded-[11px] py-2.5 px-3 text-[12.5px] font-sans outline-none focus:border-[#5B7CF5] resize-none bg-white disabled:bg-[#F7F8FA]"
                  style={{ minHeight: 44, maxHeight: 120, lineHeight: 1.45, boxShadow: 'none' }}
                />
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
