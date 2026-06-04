import { useEffect, useMemo, useState } from 'react';
import { X, CheckCheck, Bell } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import TeamAvatar from '../TeamAvatar';
import { notifMeta, fmtTime, dayKey } from './notifMeta';

// NotificationsPanel — buzón lateral derecho. Mismo lenguaje visual que
// CommentsSidePanel (scrim + slide-in 408px, feed agrupado por día).
// Las notificaciones de "tarea asignada" del mismo cliente y día se agrupan
// en una sola línea resumida para no spamear cuando se habilita un roadmap.

export default function NotificationsPanel() {
  const {
    notifications, notifPanelOpen, closeNotifications,
    markNotificationRead, markAllNotificationsRead, unreadNotifCount,
    teamMembers, openTaskComments,
  } = useApp();

  const open = !!notifPanelOpen;

  const [filter, setFilter] = useState('all');

  const memberById = useMemo(() => {
    const m = {};
    (teamMembers || []).forEach(t => { m[t.id] = t; });
    return m;
  }, [teamMembers]);

  // Filtros del buzón. Cada uno define qué tipos incluye para "organizar lo
  // pendiente". El badge de cada chip muestra cuántas SIN LEER hay en esa
  // categoría.
  const FILTERS = [
    { key: 'all',     label: 'Todas',     match: () => true },
    { key: 'unread',  label: 'Sin leer',  match: (n) => !n.read_at },
    { key: 'task_comment',  label: 'Comentarios',   match: (n) => n.type === 'task_comment' },
    { key: 'comment_reply', label: 'Respuestas',    match: (n) => n.type === 'comment_reply' },
    { key: 'tasks',   label: 'Tareas nuevas', match: (n) => n.type === 'task_assigned' || n.type === 'task_description' },
    { key: 'urgent',  label: 'Urgentes',  match: (n) => n.type === 'task_blocked' || n.type === 'task_overdue' },
  ];

  // Conteo de pendientes (no leídas) por categoría para los badges.
  const unreadByFilter = useMemo(() => {
    const counts = {};
    FILTERS.forEach(f => {
      counts[f.key] = (notifications || []).filter(n => !n.read_at && f.match(n)).length;
    });
    return counts;
  }, [notifications]);

  const activeMatch = (FILTERS.find(f => f.key === filter) || FILTERS[0]).match;
  const filtered = useMemo(
    () => (notifications || []).filter(activeMatch),
    [notifications, filter],
  );

  // Escape cierra.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') closeNotifications(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closeNotifications]);

  // Agrupar por día y, dentro del día, colapsar varias "tarea asignada" del
  // mismo cliente en un único ítem resumido.
  const days = useMemo(() => {
    const sorted = [...filtered].sort(
      (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
    );
    const order = [];
    const byDay = {};
    sorted.forEach(n => {
      const key = dayKey(n.created_at);
      if (!byDay[key]) { byDay[key] = []; order.push(key); }
      byDay[key].push(n);
    });
    // Construir ítems de display por día.
    return order.map(key => {
      const items = byDay[key];
      const assignedByClient = {};
      const display = [];
      items.forEach(n => {
        if (n.type === 'task_assigned') {
          const client = (n.body?.split(' · ')[1] || '').trim() || '—';
          (assignedByClient[client] = assignedByClient[client] || []).push(n);
        } else {
          display.push({ kind: 'single', n, at: n.created_at });
        }
      });
      Object.entries(assignedByClient).forEach(([client, arr]) => {
        if (arr.length === 1) display.push({ kind: 'single', n: arr[0], at: arr[0].created_at });
        else display.push({ kind: 'group', arr, client, at: arr[0].created_at });
      });
      display.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
      return { key, display };
    });
  }, [filtered]);

  const isEmpty = filtered.length === 0;
  const noneAtAll = (notifications || []).length === 0;

  const handleOpenTask = async (n) => {
    if (!n.read_at) await markNotificationRead(n.id);
    if (n.task_id) { openTaskComments(n.task_id); closeNotifications(); }
  };

  const handleOpenGroup = async (arr) => {
    await Promise.all(arr.filter(n => !n.read_at).map(n => markNotificationRead(n.id)));
    const withTask = arr.find(n => n.task_id);
    if (withTask) { openTaskComments(withTask.task_id); closeNotifications(); }
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-[80] transition-opacity duration-200 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(20,24,32,.28)' }}
        onClick={closeNotifications}
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
        {/* Head */}
        <div className="px-[18px] py-4 border-b border-[#EEF0F3] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-[#1A1D26]">Notificaciones</span>
            {unreadNotifCount > 0 && (
              <span className="inline-flex items-center text-[10.5px] font-semibold rounded-full px-2 py-0.5 bg-[#FEF2F2] text-[#DC4B43]">
                {unreadNotifCount} sin leer
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadNotifCount > 0 && (
              <button
                type="button"
                onClick={markAllNotificationsRead}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5B7CF5] hover:text-[#4A67D8] bg-transparent border-none cursor-pointer px-2 py-1 rounded-md hover:bg-[#EEF2FF] transition-colors"
                title="Marcar todas como leídas"
              ><CheckCheck size={13} /> Marcar todas</button>
            )}
            <button
              type="button"
              onClick={closeNotifications}
              className="w-7 h-7 rounded-lg bg-transparent border-none text-[#9CA3AF] hover:bg-[#EEF2FF] hover:text-[#5B7CF5] cursor-pointer flex items-center justify-center transition-colors"
              title="Cerrar (Esc)"
            ><X size={16} /></button>
          </div>
        </div>

        {/* Filtros por categoría — badge = pendientes (sin leer) en esa categoría */}
        <div className="flex items-center gap-1.5 px-[18px] py-2.5 border-b border-[#EEF0F3] overflow-x-auto scrollbar-hide">
          {FILTERS.map(f => {
            const active = filter === f.key;
            const count = unreadByFilter[f.key];
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`shrink-0 inline-flex items-center gap-1.5 text-[11.5px] font-semibold rounded-full px-2.5 py-1 border cursor-pointer transition-colors ${
                  active
                    ? 'bg-[#5B7CF5] border-[#5B7CF5] text-white'
                    : 'bg-white border-[#E2E5EB] text-[#6B7280] hover:bg-[#F7F8FA]'
                }`}
              >
                {f.label}
                {count > 0 && (
                  <span
                    className={`min-w-[16px] h-[16px] px-1 rounded-full text-[9.5px] font-bold flex items-center justify-center ${
                      active ? 'bg-white text-[#5B7CF5]' : 'bg-[#FEE2E2] text-[#DC4B43]'
                    }`}
                  >{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-[18px] py-4">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center text-center py-16 text-[#9CA3AF]">
              <Bell size={30} className="mb-3 opacity-40" />
              {noneAtAll ? (
                <>
                  <div className="text-[12.5px] italic">No tenés notificaciones todavía.</div>
                  <div className="text-[11px] mt-1">Acá vas a ver tareas asignadas, comentarios y avisos.</div>
                </>
              ) : (
                <>
                  <div className="text-[12.5px] italic">Nada en esta categoría.</div>
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className="text-[11px] mt-1.5 text-[#5B7CF5] hover:text-[#4A67D8] bg-transparent border-none cursor-pointer"
                  >Ver todas</button>
                </>
              )}
            </div>
          ) : (
            days.map(({ key, display }) => (
              <div key={key}>
                <div className="flex items-center gap-3 text-[10px] font-bold tracking-wider uppercase text-[#B6BCC4] my-3">
                  <span className="flex-1 h-px bg-[#EEF0F3]" />
                  {key}
                  <span className="flex-1 h-px bg-[#EEF0F3]" />
                </div>
                <div className="space-y-1.5">
                  {display.map((item) => item.kind === 'group'
                    ? <GroupRow key={'g_' + item.arr[0].id} item={item} onClick={() => handleOpenGroup(item.arr)} />
                    : <Row key={item.n.id} n={item.n} member={memberById[item.n.actor_id]} onClick={() => handleOpenTask(item.n)} />,
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}

// Fila individual.
function Row({ n, member, onClick }) {
  const { Icon, color } = notifMeta(n.type);
  const unread = !n.read_at;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-start gap-2.5 rounded-[11px] px-3 py-2.5 cursor-pointer border-none transition-colors ${unread ? 'bg-[#F4F7FF] hover:bg-[#EAF0FF]' : 'bg-white hover:bg-[#F7F8FA]'}`}
    >
      <div className="relative shrink-0 mt-0.5">
        {member
          ? <TeamAvatar member={member} size={30} />
          : <span className="w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: color + '18', color }}><Icon size={15} /></span>}
        <span
          className="absolute -bottom-0.5 -right-0.5 w-[15px] h-[15px] rounded-full flex items-center justify-center border-2 border-white"
          style={{ background: color }}
        ><Icon size={8} className="text-white" /></span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold text-[#1A1D26] leading-snug break-words">{n.title}</div>
        {n.body && <div className="text-[11.5px] text-[#6B7280] leading-snug mt-0.5 break-words line-clamp-2">{n.body}</div>}
        <div className="text-[10.5px] text-[#9CA3AF] mt-1">{fmtTime(n.created_at)}</div>
      </div>
      {unread && <span className="shrink-0 w-2 h-2 rounded-full bg-[#5B7CF5] mt-1.5" />}
    </button>
  );
}

// Fila resumida (varias tareas asignadas del mismo cliente el mismo día).
function GroupRow({ item, onClick }) {
  const { Icon, color } = notifMeta('task_assigned');
  const count = item.arr.length;
  const unread = item.arr.some(n => !n.read_at);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-start gap-2.5 rounded-[11px] px-3 py-2.5 cursor-pointer border-none transition-colors ${unread ? 'bg-[#F4F7FF] hover:bg-[#EAF0FF]' : 'bg-white hover:bg-[#F7F8FA]'}`}
    >
      <span className="shrink-0 mt-0.5 w-[30px] h-[30px] rounded-full flex items-center justify-center" style={{ background: color + '18', color }}>
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold text-[#1A1D26] leading-snug break-words">
          Se te asignaron {count} tareas nuevas
        </div>
        <div className="text-[11.5px] text-[#6B7280] leading-snug mt-0.5 break-words">{item.client}</div>
        <div className="text-[10.5px] text-[#9CA3AF] mt-1">{fmtTime(item.at)}</div>
      </div>
      {unread && <span className="shrink-0 w-2 h-2 rounded-full bg-[#5B7CF5] mt-1.5" />}
    </button>
  );
}
