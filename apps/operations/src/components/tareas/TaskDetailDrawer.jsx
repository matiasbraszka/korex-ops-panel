import { useMemo, useState } from 'react';
import { X, Plus, Trash2, MessageSquare, Lock, RotateCcw, Clock, AlignLeft, ListChecks, ClipboardCheck, Check, Send, GripVertical, Zap } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TASK_STATUS } from '../../utils/constants';
import { getAllPhases, isSprintLocked, canValidate, pendingCriteria, sprintCount, computeStatusDurations, computeSprintDurations, fmtDuration } from '../../utils/helpers';
import DepartmentPicker from './DepartmentPicker';
import PriorityPicker from './PriorityPicker';
import AddToWeeklyButton from './AddToWeeklyButton';

const ACC = '#5B7CF5';
const mkId = () => 'cl_' + Math.random().toString(36).slice(2, 9);
const STATUS_SHORT = { backlog: 'Backlog', priorizado: 'Priorizado', 'in-progress': 'En curso', 'en-revision': 'En revisión', paused: 'Pausada', done: 'Validado', blocked: 'Bloqueada', retrasadas: 'Retrasada' };
const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const relTime = (iso) => {
  try {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'ahora';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    const d = Math.floor(diff / 86400);
    if (d < 7) return `hace ${d} día${d === 1 ? '' : 's'}`;
    return fmtDateTime(iso);
  } catch { return ''; }
};

// Encabezado de sección con cuadradito de ícono + título + subtítulo (+ chip opcional).
function SectionHead({ icon, title, sub, color = ACC, bg = '#EEF2FF', right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={{ width: 28, height: 28, borderRadius: 8, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1A1D26', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{title}</div>
        {sub && <div style={{ fontSize: 10.5, color: '#9CA3AF' }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export default function TaskDetailDrawer({ taskId, onClose }) {
  const {
    tasks, clients, teamMembers, currentUser, updateTask, removeTaskFromSprint, deleteTask,
    taskComments, addTaskComment, sprints, activeSprint, moveTaskToSprint, createSprint,
  } = useApp();
  const task = useMemo(() => (tasks || []).find(t => t.id === taskId) || null, [tasks, taskId]);
  const client = task ? (clients || []).find(c => c.id === task.clientId) : null;
  const [tab, setTab] = useState('tarea');
  const [newItem, setNewItem] = useState('');
  const [dragId, setDragId] = useState(null);
  const [newAc, setNewAc] = useState('');
  const [gateMsg, setGateMsg] = useState('');
  const [newComment, setNewComment] = useState('');
  if (!task) return null;

  const st = TASK_STATUS[task.status] || TASK_STATUS.backlog;
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const subDone = checklist.filter(i => i.done).length;
  const subPct = checklist.length ? Math.round(subDone / checklist.length * 100) : 0;
  const phaseLabel = (getAllPhases(client)[task.phase] || {}).label || '—';
  const owner = (() => { const f = String(task.assignee || '').split(',')[0]?.trim().toLowerCase(); return (teamMembers || []).find(m => m.name?.toLowerCase() === f || m.name?.toLowerCase().split(' ')[0] === f); })();

  const taskSprint = (sprints || []).find(s => s.id === task.sprintId) || null;
  const locked = isSprintLocked(taskSprint);
  const nSprints = sprintCount(task);
  const sprintsSorted = [...(sprints || [])].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  const criteria = Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [];
  const acDone = criteria.filter(i => i.done).length;
  const acPct = criteria.length ? Math.round(acDone / criteria.length * 100) : 0;
  const validator = task.validatedBy ? (teamMembers || []).find(m => m.id === task.validatedBy) : null;
  const dur = computeStatusDurations(task, taskComments);
  const sprintDur = computeSprintDurations(task, sprints);

  const comments = (taskComments || [])
    .filter(c => c.task_id === task.id && !c.parent_id && (!c.kind || c.kind === 'user'))
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const commentCount = comments.length;

  // Mutaciones de checklist/criterios vía updater FUNCIONAL: se calculan contra la
  // tarea más nueva (no el render actual), así agregar/tildar/reordenar varios
  // seguido no se pisa (antes se perdían ítems). Los ids se precalculan afuera para
  // que el updater sea puro.
  const mutChecklist = (fn) => updateTask(task.id, (t) => ({ checklist: fn(Array.isArray(t.checklist) ? t.checklist : []) }));
  const addItem = () => { const v = newItem.trim(); if (!v) return; const item = { id: mkId(), text: v, done: false }; mutChecklist(l => [...l, item]); setNewItem(''); };
  const toggleItem = (id) => mutChecklist(l => l.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const removeItem = (id) => mutChecklist(l => l.filter(i => i.id !== id));
  // Reordenar la checklist arrastrando (soltar el ítem `fromId` sobre `toId`).
  const moveChecklist = (fromId, toId) => {
    if (!fromId || fromId === toId) return;
    mutChecklist(l => {
      const arr = [...l];
      const from = arr.findIndex(i => i.id === fromId);
      const to = arr.findIndex(i => i.id === toId);
      if (from < 0 || to < 0) return l;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
  };

  const mutCriteria = (fn) => updateTask(task.id, (t) => ({ acceptanceCriteria: fn(Array.isArray(t.acceptanceCriteria) ? t.acceptanceCriteria : []) }));
  const addAc = () => { const v = newAc.trim(); if (!v) return; const it = { id: mkId(), text: v, done: false }; mutCriteria(l => [...l, it]); setNewAc(''); };
  const toggleAc = (id) => mutCriteria(l => l.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const removeAc = (id) => mutCriteria(l => l.filter(i => i.id !== id));

  const doValidate = () => {
    if (!canValidate(task)) { setGateMsg(`Faltan ${pendingCriteria(task)} criterio(s) de aceptación para validar.`); setTimeout(() => setGateMsg(''), 5000); return; }
    updateTask(task.id, { status: 'done' });
    onClose();
  };
  const doReopen = () => {
    if (locked) {
      const sid = activeSprint?.id || createSprint()?.id;
      updateTask(task.id, sid ? { sprintId: sid, status: 'in-progress' } : { status: 'in-progress' });
    } else {
      updateTask(task.id, { status: 'priorizado' });
    }
  };
  const onSprintChange = (val) => { if (!val) removeTaskFromSprint(task.id); else moveTaskToSprint(task.id, val); };

  // Bloqueo por dependencia ("Bloqueada por").
  const deps = Array.isArray(task.dependsOn) ? task.dependsOn : [];
  const blockers = deps.map(id => (tasks || []).find(t => t.id === id)).filter(Boolean);
  const pendingBlockers = blockers.filter(b => b.status !== 'done');
  const taskLabel = (t) => { const c = (clients || []).find(cl => cl.id === t.clientId); return c?.name ? `${t.title} · ${c.name}` : t.title; };
  const phaseMap = getAllPhases(client);
  const candidates = (tasks || [])
    .filter(t => t.id !== task.id && !deps.includes(t.id))
    .filter(t => (t.clientId || null) === (task.clientId || null))
    .filter(t => t.status !== 'done')
    .filter(t => !(Array.isArray(t.dependsOn) && t.dependsOn.includes(task.id)))
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  const candidatesByPhase = (() => {
    const groups = [];
    Object.keys(phaseMap).forEach(key => { const list = candidates.filter(t => t.phase === key); if (list.length) groups.push({ key, label: phaseMap[key].label, list }); });
    const noPhase = candidates.filter(t => !t.phase || !phaseMap[t.phase]);
    if (noPhase.length) groups.push({ key: '__none', label: 'Sin objetivo', list: noPhase });
    return groups;
  })();
  const addBlocker = (depId) => {
    if (!depId || deps.includes(depId)) return;
    const next = [...deps, depId];
    const blocker = (tasks || []).find(t => t.id === depId);
    const updates = { dependsOn: next };
    if (blocker && blocker.status !== 'done' && task.sprintId && task.status !== 'backlog' && task.status !== 'done') updates.status = 'backlog';
    updateTask(task.id, updates);
  };
  const removeBlocker = (depId) => { const next = deps.filter(d => d !== depId); updateTask(task.id, { dependsOn: next.length ? next : null }); };

  // Comentarios inline.
  const submitComment = () => {
    const body = newComment.trim();
    if (!body || !addTaskComment) return;
    addTaskComment({ task_id: task.id, author_id: currentUser?.id || null, body, kind: 'user' }).catch(() => {});
    setNewComment('');
  };

  // Validación: criterio del footer + punto de la pestaña.
  const critOk = criteria.length === 0 || acDone === criteria.length;
  const okToValidate = pendingBlockers.length === 0 && critOk && !locked;
  const footerLabel = pendingBlockers.length > 0 ? 'Bloqueada · validá la otra tarea' : (!critOk ? 'Completá los criterios primero' : (locked ? 'Sprint cerrado' : ''));
  // Punto de la pestaña Validación: rojo si está bloqueada por otra; azul si tiene
  // contenido cargado (definición de hecho o descripción).
  const hasDescription = !!(String(task.definitionOfDone || '').trim() || String(task.description || '').trim());
  const valDot = pendingBlockers.length > 0 ? '#EF4444' : (hasDescription ? '#5B7CF5' : null);

  const metaRow = { display: 'grid', gridTemplateColumns: '104px 1fr', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid #F0F1F4' };
  const metaLabel = { fontSize: 11.5, color: '#6B7280' };
  const selStyle = { fontSize: 12.5, fontWeight: 500, color: '#1A1D26', border: 'none', background: 'transparent', outline: 'none', cursor: 'pointer', textAlign: 'right', fontFamily: 'inherit', maxWidth: 210 };
  const tBtn = (active) => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 6px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: active ? '#fff' : 'transparent', color: active ? '#1A1D26' : '#6B7280', boxShadow: active ? '0 1px 2px rgba(10,22,40,.10)' : 'none' });
  const inputStyle = { flex: 1, border: '1px solid #E2E5EB', borderRadius: 9, padding: '9px 11px', fontSize: 12.5, outline: 'none', color: '#1A1D26', fontFamily: 'inherit' };
  const addBtnStyle = { width: 38, height: 38, flexShrink: 0, border: '1px solid #E2E5EB', borderRadius: 9, background: '#fff', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };

  // `dnd` opcional: { dragId, setDragId, onReorder } habilita arrastrar para
  // reordenar (agarrando el ⋮⋮). Sin `dnd`, la fila se comporta como antes.
  const checkRow = (it, accent, onToggle, onDel, dnd) => (
    <div key={it.id}
      onDragOver={dnd ? (e) => e.preventDefault() : undefined}
      onDrop={dnd ? (e) => { e.preventDefault(); dnd.onReorder(dnd.dragId, it.id); dnd.setDragId(null); } : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: dnd ? 6 : 11, padding: '8px 0', borderBottom: '1px solid #F6F7F9', opacity: dnd && dnd.dragId === it.id ? 0.4 : 1 }}>
      {dnd && (
        <span draggable onDragStart={() => dnd.setDragId(it.id)} onDragEnd={() => dnd.setDragId(null)}
          title="Arrastrar para reordenar"
          style={{ cursor: 'grab', color: '#CBD2DC', display: 'flex', flexShrink: 0, alignItems: 'center' }}>
          <GripVertical size={14} />
        </span>
      )}
      <span onClick={() => onToggle(it.id)} style={{ width: 19, height: 19, flexShrink: 0, borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: it.done ? accent : '#fff', border: it.done ? 'none' : '1.5px solid #CBD2DC' }}>
        {it.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
      </span>
      <span onClick={() => onToggle(it.id)} style={{ flex: 1, fontSize: 12.5, lineHeight: 1.4, cursor: 'pointer', color: it.done ? '#9CA3AF' : '#1A1D26', textDecoration: it.done ? 'line-through' : 'none' }}>{it.text}</span>
      <span onClick={() => onDel(it.id)} style={{ cursor: 'pointer', color: '#D1D5DB', padding: 2, display: 'flex', flexShrink: 0 }}><Trash2 size={14} /></span>
    </div>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,23,.42)', zIndex: 40 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 460, maxWidth: '96vw', background: '#fff', boxShadow: '-12px 0 40px rgba(10,22,40,.16)', zIndex: 50, display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
        {/* HEADER */}
        <div style={{ flexShrink: 0, padding: '15px 18px 14px', borderBottom: '1px solid #EEF0F3' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 999, background: st.bg, color: st.color, fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>{st.label}</span>
            {pendingBlockers.length > 0 && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, background: '#FEF2F2', color: '#DC2626', fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}><Lock size={11} />Bloqueada</span>
            )}
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <AddToWeeklyButton task={task} size={17} />
              <span onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#9CA3AF' }}><X size={17} /></span>
            </span>
          </div>
          <input defaultValue={task.title} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== task.title) updateTask(task.id, { title: v }); }}
            style={{ width: '100%', marginTop: 11, fontSize: 16.5, fontWeight: 700, lineHeight: 1.32, letterSpacing: '-.01em', color: '#16181D', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit' }} />
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflowY: 'auto' }} className="kx-scroll">
          {/* PROPIEDADES */}
          <div style={{ margin: '14px 16px 2px', border: '1px solid #E2E5EB', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
            <div style={metaRow}>
              <span style={metaLabel}>Responsable</span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }}>
                {owner && <span style={{ width: 22, height: 22, borderRadius: '50%', background: owner.color || '#9CA3AF', color: '#fff', fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{(owner.initials || owner.name?.slice(0, 2) || '').toUpperCase()}</span>}
                <select value={owner?.name || ''} onChange={(e) => updateTask(task.id, { assignee: e.target.value })} style={selStyle}>
                  <option value="">Sin asignar</option>
                  {(teamMembers || []).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </span>
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Revisor</span>
              <select value={task.reviewer || ''} onChange={(e) => updateTask(task.id, { reviewer: e.target.value || null })} style={{ ...selStyle, justifySelf: 'end', color: task.reviewer ? '#1A1D26' : '#9CA3AF' }}>
                <option value="">Sin revisor</option>
                {(teamMembers || []).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <div style={metaRow}><span style={metaLabel}>Cliente</span><span style={{ fontSize: 12.5, fontWeight: 500, textAlign: 'right' }}>{client?.name || '—'}</span></div>
            <div style={{ ...metaRow, alignItems: 'flex-start' }}><span style={{ ...metaLabel, paddingTop: 1 }}>Objetivo / fase</span><span style={{ fontSize: 12.5, fontWeight: 500, textAlign: 'right', lineHeight: 1.35 }}>{phaseLabel}</span></div>
            <div style={metaRow}>
              <span style={metaLabel}>Sprint{nSprints > 1 ? ` · lleva ${nSprints}` : ''}</span>
              <select value={task.sprintId || ''} onChange={(e) => onSprintChange(e.target.value)} style={{ ...selStyle, justifySelf: 'end', color: task.sprintId ? '#1A1D26' : '#9CA3AF' }}>
                <option value="">Sin sprint (solo en Objetivo)</option>
                {sprintsSorted.map(s => <option key={s.id} value={s.id}>{s.name}{s.status === 'closed' ? ' (cerrado)' : s.id === activeSprint?.id ? ' (actual)' : s.status === 'planned' ? ' (próximo)' : ''}</option>)}
              </select>
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Prioridad</span>
              <span style={{ justifySelf: 'end' }}><PriorityPicker value={task.priority} onChange={(p) => updateTask(task.id, { priority: p || 'normal' })} variant="chip" /></span>
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Área</span>
              <span style={{ justifySelf: 'end' }}><DepartmentPicker value={task.department} onChange={(d) => updateTask(task.id, { department: d })} variant="chip" /></span>
            </div>
            <div style={{ ...metaRow, borderBottom: 'none' }}>
              <span style={metaLabel}>Esfuerzo estimado</span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 }}>
                <input type="number" min="0" step="0.5" defaultValue={task.estimatedHours ?? ''} placeholder="–"
                  onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (task.estimatedHours ?? null)) updateTask(task.id, { estimatedHours: v }); }}
                  style={{ width: 56, fontSize: 12.5, fontWeight: 600, color: '#1A1D26', textAlign: 'center', border: '1px solid #E2E5EB', borderRadius: 7, padding: '4px 8px', background: '#fff', outline: 'none', fontFamily: 'inherit' }} />
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>h</span>
              </span>
            </div>
          </div>

          {/* TAB BAR */}
          <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(255,255,255,.94)', backdropFilter: 'blur(8px)', padding: '12px 16px 11px', borderBottom: '1px solid #EEF0F3' }}>
            <div style={{ display: 'flex', gap: 3, background: '#F0F2F5', borderRadius: 10, padding: 3 }}>
              <button onClick={() => setTab('tarea')} style={tBtn(tab === 'tarea')}>
                Tarea
                {checklist.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', background: '#fff', borderRadius: 999, padding: '1px 6px' }}>{subDone}/{checklist.length}</span>}
              </button>
              <button onClick={() => setTab('validacion')} style={tBtn(tab === 'validacion')}>
                Validación
                {valDot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: valDot }} />}
              </button>
              <button onClick={() => setTab('actividad')} style={tBtn(tab === 'actividad')}>Actividad</button>
            </div>
          </div>

          {/* TAB: TAREA */}
          {tab === 'tarea' && (
            <div>
              <div style={{ padding: '18px 18px 16px', borderBottom: '1px solid #F0F1F4' }}>
                <SectionHead icon={<AlignLeft size={15} />} title="Descripción" sub="Contexto para no dejar dudas" />
                <textarea defaultValue={task.description || ''} placeholder="Describí la tarea para que no quede lugar a dudas…"
                  onBlur={(e) => { const v = e.target.value; if (v !== (task.description || '')) updateTask(task.id, { description: v }); }}
                  style={{ width: '100%', minHeight: 104, border: '1px solid #E2E5EB', borderRadius: 10, padding: '11px 12px', fontSize: 12.5, lineHeight: 1.55, color: '#1A1D26', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
              </div>
              <div style={{ padding: '16px 18px 20px' }}>
                <SectionHead icon={<ListChecks size={15} />} title="Checklist" sub="Subtareas para completar"
                  right={<span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F3F4F6', borderRadius: 999, padding: '2px 9px' }}>{subDone}/{checklist.length}</span>} />
                {checklist.length > 0 && (
                  <div style={{ height: 6, borderRadius: 999, background: '#EEF0F3', overflow: 'hidden', marginBottom: 14 }}>
                    <div style={{ width: subPct + '%', height: '100%', background: ACC, borderRadius: 999, transition: 'width .3s ease' }} />
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>{checklist.map(it => checkRow(it, ACC, toggleItem, removeItem, { dragId, setDragId, onReorder: moveChecklist }))}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} placeholder="Agregar subtarea…" style={inputStyle} />
                  <button onClick={addItem} style={addBtnStyle}><Plus size={16} /></button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: VALIDACIÓN */}
          {tab === 'validacion' && (
            <div style={{ padding: '16px 18px 20px' }}>
              {task.status === 'done' && task.validatedAt && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ECFDF5', color: '#15803D', fontSize: 12.5, fontWeight: 600, borderRadius: 10, padding: '9px 12px', marginBottom: 20 }}>
                  <Check size={15} />Validada por {validator?.name || 'alguien'}{task.validatedAt ? ` · ${fmtDateTime(task.validatedAt)}` : ''}
                </div>
              )}

              <div style={{ paddingTop: 2 }}>
                <SectionHead icon={<ClipboardCheck size={15} />} title="Definición de hecho" sub="Cuándo se da por terminada" />
                <textarea defaultValue={task.definitionOfDone || ''} placeholder="Definí cuándo se considera terminada…"
                  onBlur={(e) => { const v = e.target.value; if (v !== (task.definitionOfDone || '')) updateTask(task.id, { definitionOfDone: v }); }}
                  style={{ width: '100%', minHeight: 86, border: '1px solid #E2E5EB', borderRadius: 10, padding: '11px 12px', fontSize: 12.5, lineHeight: 1.55, color: '#1A1D26', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
              </div>

              <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #EEF0F3' }}>
                <SectionHead icon={<ListChecks size={15} />} title="Criterios de aceptación" sub="Deben cumplirse antes de validar" color="#16A34A" bg="#ECFDF5"
                  right={<span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F3F4F6', borderRadius: 999, padding: '2px 9px' }}>{acDone}/{criteria.length}</span>} />
                {criteria.length > 0 ? (
                  <div style={{ height: 6, borderRadius: 999, background: '#EEF0F3', overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ width: acPct + '%', height: '100%', background: '#16A34A', borderRadius: 999, transition: 'width .3s ease' }} />
                  </div>
                ) : (
                  <div style={{ fontSize: 11.5, lineHeight: 1.5, color: '#9CA3AF', background: '#FAFBFC', border: '1px dashed #E2E5EB', borderRadius: 9, padding: '11px 12px' }}>Sin criterios: la tarea se puede validar libremente. Agregá criterios para exigir que se cumplan antes de validar.</div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>{criteria.map(it => checkRow(it, '#16A34A', toggleAc, removeAc))}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <input value={newAc} onChange={(e) => setNewAc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAc(); } }} placeholder="Agregar criterio de aceptación…" style={inputStyle} />
                  <button onClick={addAc} style={addBtnStyle}><Plus size={16} /></button>
                </div>
              </div>

              <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid #EEF0F3' }}>
                <SectionHead icon={<Lock size={15} />} title="Bloqueada por" sub="Lo que impide avanzar" color="#DC2626" bg="#FEF2F2" />
                {pendingBlockers.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 9, padding: '9px 11px', marginBottom: 10 }}>
                    <Lock size={14} style={{ flexShrink: 0, marginTop: 1, color: '#DC2626' }} />
                    <span style={{ fontSize: 11.5, lineHeight: 1.45, color: '#B91C1C' }}>No se puede avanzar hasta resolver {pendingBlockers.length === 1 ? 'la tarea que la bloquea' : 'las tareas que la bloquean'}. Mientras tanto queda en el Backlog.</span>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {blockers.map(b => {
                    const done = b.status === 'done';
                    return (
                      <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #E2E5EB', borderRadius: 9, padding: '9px 11px', background: '#fff' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: done ? '#22C55E' : '#F59E0B' }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: done ? '#9CA3AF' : '#1A1D26', textDecoration: done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={taskLabel(b)}>{taskLabel(b)}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', padding: '3px 7px', borderRadius: 999, background: done ? '#ECFDF5' : '#FFFBEB', color: done ? '#15803D' : '#B45309', whiteSpace: 'nowrap', flexShrink: 0 }}>{done ? 'HECHO' : 'PENDIENTE'}</span>
                        <span onClick={() => removeBlocker(b.id)} title="Quitar bloqueo" style={{ cursor: 'pointer', color: '#D1D5DB', display: 'flex', flexShrink: 0 }}><X size={15} /></span>
                      </div>
                    );
                  })}
                </div>
                <select value="" onChange={(e) => { addBlocker(e.target.value); e.target.value = ''; }} disabled={!candidates.length}
                  style={{ width: '100%', marginTop: 8, fontSize: 12, color: candidates.length ? '#6B7280' : '#9CA3AF', border: '1px dashed #D0D5DD', borderRadius: 9, padding: '10px 11px', outline: 'none', background: '#FAFBFC', cursor: candidates.length ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                  <option value="">{candidates.length ? '+ Elegí la tarea que la bloquea…' : 'No hay tareas sin completar de este cliente'}</option>
                  {candidatesByPhase.map(g => <optgroup key={g.key} label={g.label}>{g.list.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</optgroup>)}
                </select>
              </div>
            </div>
          )}

          {/* TAB: ACTIVIDAD */}
          {tab === 'actividad' && (
            <div style={{ padding: '16px 18px 20px' }}>
              <div style={{ marginBottom: 22 }}>
                <SectionHead icon={<Clock size={15} />} title="Tiempo por estado" sub="Cuánto lleva en cada etapa" color="#8B5CF6" bg="#F5F3FF" />
                {(() => {
                  const rows = [['priorizado', 'Priorizado'], ['in-progress', 'En curso'], ['en-revision', 'En revisión'], ['blocked', 'Bloqueada'], ['paused', 'Pausada'], ['backlog', 'Backlog']]
                    .map(([k, label]) => ({ k, label, d: dur.byStatus[k] || 0 }));
                  const max = Math.max(0.0007, ...rows.map(r => r.d));
                  const any = rows.some(r => r.d > 0);
                  if (!any) return dur.hasHistory ? null : <div style={{ fontSize: 12, color: '#9CA3AF' }}>Sin historial de estados todavía — arranca a registrarse desde el próximo cambio de estado.</div>;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {rows.filter(r => r.d > 0).map(r => {
                        const tone = r.k === 'blocked' ? '#DC2626' : (r.k === 'en-revision' ? '#BE185D' : '#8B5CF6');
                        return (
                          <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ width: 84, fontSize: 11.5, color: '#374151', fontWeight: 600, flexShrink: 0 }}>{r.label}</span>
                            <span style={{ flex: 1, height: 8, borderRadius: 999, background: '#F0F2F5', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: Math.round(r.d / max * 100) + '%', background: tone, borderRadius: 999 }} /></span>
                            <span style={{ width: 52, textAlign: 'right', fontSize: 11.5, fontWeight: 600, color: '#374151', flexShrink: 0 }}>{fmtDuration(r.d)}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {task.status !== 'done' && dur.current && (
                  <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 12 }}>Estado actual: <strong style={{ color: '#1A1D26' }}>{STATUS_SHORT[task.status] || task.status}</strong>{dur.hasHistory ? ` · hace ${fmtDuration(dur.current.days)}` : ' · seguimiento desde el próximo cambio'}</div>
                )}
              </div>

              {/* Paso por sprints: por qué sprints pasó la tarea y cuánto estuvo en cada uno */}
              <div style={{ borderTop: '1px solid #F0F1F4', paddingTop: 18, marginBottom: 22 }}>
                <SectionHead icon={<Zap size={15} />} title="Paso por sprints" sub="Por qué sprints pasó y cuánto estuvo" color="#5B7CF5" bg="#EEF2FF" />
                {sprintDur.rows.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9CA3AF' }}>Todavía no pasó por ningún sprint.</div>
                ) : (() => {
                  const max = Math.max(0.0007, ...sprintDur.rows.map(r => r.days));
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {sprintDur.rows.map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 96, fontSize: 11.5, color: r.isCurrent ? '#1A1D26' : '#374151', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}{r.isCurrent ? ' ·' : ''}</span>
                          <span style={{ flex: 1, height: 8, borderRadius: 999, background: '#F0F2F5', overflow: 'hidden' }}>
                            {r.measured && <span style={{ display: 'block', height: '100%', width: Math.round(r.days / max * 100) + '%', background: r.isCurrent ? '#5B7CF5' : '#93A5F0', borderRadius: 999 }} />}
                          </span>
                          <span style={{ width: 62, textAlign: 'right', fontSize: 11.5, fontWeight: 600, color: '#374151', flexShrink: 0 }}>{r.measured ? fmtDuration(r.days) : (r.isCurrent ? 'en curso' : '—')}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {sprintDur.current && sprintDur.current.days != null && task.status !== 'done' && (
                  <div style={{ fontSize: 11.5, color: '#6B7280', marginTop: 12 }}>En <strong style={{ color: '#1A1D26' }}>{sprintDur.current.name}</strong> hace {fmtDuration(sprintDur.current.days)}{sprintDur.rows.length > 1 ? ` · lleva ${sprintDur.rows.length} sprints` : ''}</div>
                )}
                {!sprintDur.hasHistory && sprintDur.rows.length > 0 && (
                  <div style={{ fontSize: 11.5, color: '#9CA3AF', marginTop: 10 }}>Sin registro de tiempo por sprint todavía — se mide desde el próximo movimiento.</div>
                )}
              </div>

              <div style={{ borderTop: '1px solid #F0F1F4', paddingTop: 18 }}>
                <SectionHead icon={<MessageSquare size={15} />} title="Comentarios" sub="Conversación de la tarea" color="#6B7280" bg="#F0F2F5"
                  right={<span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F3F4F6', borderRadius: 999, padding: '2px 9px' }}>{commentCount}</span>} />
                {comments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                    {comments.map(c => {
                      const author = (teamMembers || []).find(m => m.id === c.author_id);
                      const name = author?.name || 'Alguien';
                      const initials = (author?.initials || name.slice(0, 2)).toUpperCase();
                      return (
                        <div key={c.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                          <span style={{ width: 26, height: 26, borderRadius: '50%', background: (author?.color || ACC) + '20', color: author?.color || ACC, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{initials}</span>
                          <div style={{ flex: 1, minWidth: 0, background: '#F7F8FA', border: '1px solid #EEF0F3', borderRadius: 10, padding: '9px 11px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 3 }}><span style={{ fontSize: 12, fontWeight: 600 }}>{name}</span><span style={{ fontSize: 10.5, color: '#9CA3AF' }}>{relTime(c.created_at)}</span></div>
                            <div style={{ fontSize: 12.5, lineHeight: 1.5, color: '#374151', whiteSpace: 'pre-wrap' }}>{c.body}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#FAFBFC', border: '1px dashed #E2E5EB', borderRadius: 10, padding: '12px 13px', marginBottom: 14 }}>
                    <MessageSquare size={16} stroke="#9CA3AF" strokeWidth={1.8} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 11.5, color: '#9CA3AF' }}>Aún no hay comentarios. Sé el primero en escribir.</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: (currentUser?.color || '#EC4899') + '20', color: currentUser?.color || '#EC4899', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{(currentUser?.initials || currentUser?.name?.slice(0, 2) || 'YO').toUpperCase()}</span>
                  <input value={newComment} onChange={(e) => setNewComment(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(); } }} placeholder="Escribí un comentario…"
                    style={{ flex: 1, border: '1px solid #E2E5EB', borderRadius: 999, padding: '9px 13px', fontSize: 12.5, outline: 'none', color: '#1A1D26', fontFamily: 'inherit' }} />
                  <button onClick={submitComment} style={{ width: 36, height: 36, flexShrink: 0, border: 'none', borderRadius: '50%', background: ACC, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={16} /></button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div style={{ flexShrink: 0, borderTop: '1px solid #E2E5EB', background: '#fff' }}>
          {gateMsg && <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', color: '#DC2626', fontSize: 12.5, padding: '9px 16px' }}>{gateMsg}</div>}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px' }}>
            {task.status === 'done' ? (
              <button onClick={() => { doReopen(); onClose(); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: ACC, color: '#fff', border: 'none', borderRadius: 11, padding: 13, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}><RotateCcw size={16} />Reabrir tarea</button>
            ) : okToValidate ? (
              <button onClick={doValidate} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#16A34A', color: '#fff', border: 'none', borderRadius: 11, padding: 13, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 6px rgba(22,163,74,.25)', fontFamily: 'inherit' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>Marcar validada
              </button>
            ) : (
              <button disabled title={footerLabel} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#EEF0F3', color: '#9CA3AF', border: 'none', borderRadius: 11, padding: 13, fontSize: 13, fontWeight: 600, cursor: 'not-allowed', fontFamily: 'inherit' }}><Lock size={15} />{footerLabel}</button>
            )}
            <button onClick={() => { if (window.confirm(`Eliminar la tarea «${task.title}»? Esta acción no se puede deshacer.`)) { deleteTask(task.id); onClose(); } }} title="Eliminar tarea" style={{ width: 46, height: 46, flexShrink: 0, border: '1px solid #FECACA', borderRadius: 11, background: '#fff', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={17} /></button>
          </div>
        </div>
      </div>
    </>
  );
}
