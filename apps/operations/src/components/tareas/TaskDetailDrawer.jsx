import { useMemo, useState } from 'react';
import { X, Plus, Trash2, MessageSquare, Pencil, Lock, RotateCcw, Clock, ShieldCheck } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TASK_STATUS } from '../../utils/constants';
import { getAllPhases, isSprintLocked, canValidate, pendingCriteria, sprintCount, computeStatusDurations, fmtDuration } from '../../utils/helpers';
import DepartmentPicker from './DepartmentPicker';
import PriorityPicker from './PriorityPicker';

const mkId = () => 'cl_' + Math.random().toString(36).slice(2, 9);
const STATUS_SHORT = { backlog: 'Backlog', priorizado: 'Priorizado', 'in-progress': 'En curso', 'en-revision': 'En revisión', paused: 'Pausada', done: 'Validado', blocked: 'Bloqueada', retrasadas: 'Retrasada' };
const fmtDateTime = (iso) => { try { return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };

export default function TaskDetailDrawer({ taskId, onClose }) {
  const {
    tasks, clients, teamMembers, updateTask, removeTaskFromSprint, deleteTask,
    openTaskComments, taskComments, sprints, activeSprint, moveTaskToSprint, createSprint,
  } = useApp();
  const task = useMemo(() => (tasks || []).find(t => t.id === taskId) || null, [tasks, taskId]);
  const client = task ? (clients || []).find(c => c.id === task.clientId) : null;
  const [newItem, setNewItem] = useState('');
  const [editItemId, setEditItemId] = useState(null);
  const [editItemText, setEditItemText] = useState('');
  const [newAc, setNewAc] = useState('');
  const [editAcId, setEditAcId] = useState(null);
  const [editAcText, setEditAcText] = useState('');
  const [gateMsg, setGateMsg] = useState('');
  if (!task) return null;

  const st = TASK_STATUS[task.status] || TASK_STATUS.backlog;
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const subDone = checklist.filter(i => i.done).length;
  const subPct = checklist.length ? Math.round(subDone / checklist.length * 100) : 0;
  const phaseLabel = (getAllPhases(client)[task.phase] || {}).label || '—';
  const owner = (() => { const f = String(task.assignee || '').split(',')[0]?.trim().toLowerCase(); return (teamMembers || []).find(m => m.name?.toLowerCase() === f || m.name?.toLowerCase().split(' ')[0] === f); })();
  const commentCount = (taskComments || []).filter(c => c.task_id === task.id && !c.parent_id && (!c.kind || c.kind === 'user')).length;

  // Mejoras v5: sprint en vista, bloqueo, criterios, validación, tiempos.
  const taskSprint = (sprints || []).find(s => s.id === task.sprintId) || null;
  const locked = isSprintLocked(taskSprint);
  const nSprints = sprintCount(task);
  const sprintsSorted = [...(sprints || [])].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  const criteria = Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [];
  const acDone = criteria.filter(i => i.done).length;
  const acPct = criteria.length ? Math.round(acDone / criteria.length * 100) : 0;
  const validator = task.validatedBy ? (teamMembers || []).find(m => m.id === task.validatedBy) : null;
  const dur = computeStatusDurations(task, taskComments);

  const saveChecklist = (next) => updateTask(task.id, { checklist: next });
  const addItem = () => { const t = newItem.trim(); if (!t) return; saveChecklist([...checklist, { id: mkId(), text: t, done: false }]); setNewItem(''); };
  const toggleItem = (id) => saveChecklist(checklist.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const removeItem = (id) => saveChecklist(checklist.filter(i => i.id !== id));
  const saveItem = (id) => { const v = editItemText.trim(); if (v) saveChecklist(checklist.map(i => i.id === id ? { ...i, text: v } : i)); setEditItemId(null); };

  // Criterios de aceptación (lista propia, separada del checklist de subtareas).
  const saveCriteria = (next) => updateTask(task.id, { acceptanceCriteria: next });
  const addAc = () => { const t = newAc.trim(); if (!t) return; saveCriteria([...criteria, { id: mkId(), text: t, done: false }]); setNewAc(''); };
  const toggleAc = (id) => saveCriteria(criteria.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const removeAc = (id) => saveCriteria(criteria.filter(i => i.id !== id));
  const saveAcItem = (id) => { const v = editAcText.trim(); if (v) saveCriteria(criteria.map(i => i.id === id ? { ...i, text: v } : i)); setEditAcId(null); };

  // Candado de validación: bloquea pasar a Validado si quedan criterios sin tildar.
  const doValidate = () => {
    if (!canValidate(task)) { setGateMsg(`Faltan ${pendingCriteria(task)} criterio(s) de aceptación para validar.`); setTimeout(() => setGateMsg(''), 5000); return; }
    updateTask(task.id, { status: 'done' });
    onClose();
  };
  // Reabrir: vuelve a un estado activo y limpia el sello de validación (lo hace
  // updateTask). Si está en un sprint cerrado, la trae al sprint actual para
  // poder trabajarla (creándolo si no hubiera ninguno activo).
  const doReopen = () => {
    if (locked) {
      const sid = activeSprint?.id || createSprint()?.id;
      updateTask(task.id, sid ? { sprintId: sid, status: 'in-progress' } : { status: 'in-progress' });
    } else {
      updateTask(task.id, { status: 'priorizado' });
    }
  };
  // Selector de sprint: '' = sacar del sprint; un id = mover a ese sprint.
  const onSprintChange = (val) => { if (!val) removeTaskFromSprint(task.id); else moveTaskToSprint(task.id, val); };

  // ── Bloqueo por dependencia ("Bloqueada por") ──
  // Reutiliza el campo dependsOn (array de task.id). La tarea no se puede avanzar
  // hasta que sus bloqueadoras estén validadas (status 'done').
  const deps = Array.isArray(task.dependsOn) ? task.dependsOn : [];
  const blockers = deps.map(id => (tasks || []).find(t => t.id === id)).filter(Boolean);
  const pendingBlockers = blockers.filter(b => b.status !== 'done');
  const taskLabel = (t) => {
    const c = (clients || []).find(cl => cl.id === t.clientId);
    return c?.name ? `${t.title} · ${c.name}` : t.title;
  };
  // Candidatas: tareas del mismo cliente o del mismo sprint, sin crear ciclo directo.
  const candidates = (tasks || [])
    .filter(t => t.id !== task.id && !deps.includes(t.id))
    .filter(t => (t.clientId || null) === (task.clientId || null) || (task.sprintId && t.sprintId === task.sprintId))
    .filter(t => !(Array.isArray(t.dependsOn) && t.dependsOn.includes(task.id)))
    .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  const addBlocker = (depId) => {
    if (!depId || deps.includes(depId)) return;
    const next = [...deps, depId];
    const blocker = (tasks || []).find(t => t.id === depId);
    const updates = { dependsOn: next };
    // Si queda bloqueada y está en el sprint, baja al Backlog (no se puede trabajar aún).
    if (blocker && blocker.status !== 'done' && task.sprintId && task.status !== 'backlog' && task.status !== 'done') {
      updates.status = 'backlog';
    }
    updateTask(task.id, updates);
  };
  const removeBlocker = (depId) => {
    const next = deps.filter(d => d !== depId);
    updateTask(task.id, { dependsOn: next.length ? next : null });
  };

  const metaRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 14px', borderBottom: '1px solid #F0F2F5' };
  const metaLabel = { fontSize: 13, color: '#9CA3AF', flexShrink: 0 };
  const sectionLabel = { fontSize: 11, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#9CA3AF' };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,23,.42)', zIndex: 40 }} />
      <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 460, maxWidth: '94vw', background: '#fff', boxShadow: '-12px 0 40px rgba(10,22,40,.16)', zIndex: 50, display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif" }}>
        {/* header */}
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #E2E5EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: st.color, background: st.bg, borderRadius: 999, padding: '3px 11px' }}>{st.label}</span>
              {pendingBlockers.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#DC2626', background: '#FEF2F2', borderRadius: 999, padding: '3px 9px' }}><Lock size={11} />Bloqueada</span>
              )}
            </div>
            <span onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7280', flexShrink: 0 }}><X size={18} /></span>
          </div>
          <input defaultValue={task.title} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== task.title) updateTask(task.id, { title: v }); }}
            style={{ width: '100%', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.3, marginTop: 13, color: '#1A1D26', border: 'none', outline: 'none', background: 'transparent' }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {/* meta */}
          <div style={{ border: '1px solid #E2E5EB', borderRadius: 12, overflow: 'visible', marginBottom: 20 }}>
            <div style={metaRow}>
              <span style={metaLabel}>Responsable</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {owner && <span style={{ width: 24, height: 24, borderRadius: '50%', background: owner.color || '#9CA3AF', color: '#fff', fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(owner.initials || owner.name?.slice(0, 2) || '').toUpperCase()}</span>}
                <select value={owner?.name || ''} onChange={(e) => updateTask(task.id, { assignee: e.target.value })}
                  style={{ fontSize: 13, fontWeight: 600, color: '#1A1D26', border: 'none', background: 'transparent', outline: 'none', cursor: 'pointer', textAlign: 'right' }}>
                  <option value="">Sin asignar</option>
                  {(teamMembers || []).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </span>
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Revisor</span>
              <select value={task.reviewer || ''} onChange={(e) => updateTask(task.id, { reviewer: e.target.value || null })}
                style={{ fontSize: 13, fontWeight: 600, color: '#1A1D26', border: 'none', background: 'transparent', outline: 'none', cursor: 'pointer', textAlign: 'right' }}>
                <option value="">Sin revisor</option>
                {(teamMembers || []).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
            </div>
            <div style={metaRow}><span style={metaLabel}>Cliente</span><span style={{ fontSize: 13, fontWeight: 600, color: '#1A1D26', textAlign: 'right', whiteSpace: 'nowrap' }}>{client?.name || '—'}</span></div>
            <div style={metaRow}><span style={metaLabel}>Objetivo / fase</span><span style={{ fontSize: 13, fontWeight: 600, color: '#1A1D26', textAlign: 'right' }}>{phaseLabel}</span></div>
            <div style={metaRow}>
              <span style={metaLabel}>Sprint{nSprints > 1 ? ` · lleva ${nSprints}` : ''}</span>
              <select value={task.sprintId || ''} onChange={(e) => onSprintChange(e.target.value)}
                style={{ fontSize: 13, fontWeight: 600, color: '#1A1D26', border: 'none', background: 'transparent', outline: 'none', cursor: 'pointer', textAlign: 'right', maxWidth: 200 }}>
                <option value="">Sin sprint (solo en Objetivos)</option>
                {sprintsSorted.map(s => <option key={s.id} value={s.id}>{s.name}{s.status === 'closed' ? ' (cerrado)' : s.id === activeSprint?.id ? ' (actual)' : ''}</option>)}
              </select>
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Prioridad</span>
              <PriorityPicker value={task.priority} onChange={(p) => updateTask(task.id, { priority: p || 'normal' })} variant="chip" />
            </div>
            <div style={metaRow}>
              <span style={metaLabel}>Área</span>
              <DepartmentPicker value={task.department} onChange={(d) => updateTask(task.id, { department: d })} variant="chip" />
            </div>
            <div style={{ ...metaRow, borderBottom: 'none' }}>
              <span style={metaLabel}>Esfuerzo estimado</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <input type="number" min="0" step="0.5" defaultValue={task.estimatedHours ?? ''} placeholder="–"
                  onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (task.estimatedHours ?? null)) updateTask(task.id, { estimatedHours: v }); }}
                  style={{ width: 52, fontSize: 13, fontWeight: 600, color: '#1A1D26', textAlign: 'right', border: '1px solid #E2E5EB', borderRadius: 7, padding: '5px 7px', background: '#fff', outline: 'none' }} />
                <span style={{ fontSize: 13, color: '#9CA3AF' }}>h</span>
              </span>
            </div>
          </div>

          {/* Validación auditada: quién validó y cuándo */}
          {task.status === 'done' && task.validatedAt && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ECFDF5', color: '#15803D', fontSize: 12.5, fontWeight: 600, borderRadius: 10, padding: '9px 12px', marginBottom: 20 }}>
              <ShieldCheck size={15} />
              Validada por {validator?.name || 'alguien'}{task.validatedAt ? ` · ${fmtDateTime(task.validatedAt)}` : ''}
            </div>
          )}

          {/* Definición de hecho (DOD) */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Definición de hecho (DOD)</div>
            <textarea defaultValue={task.definitionOfDone || ''} placeholder="¿Qué tiene que pasar para considerar esta tarea terminada?"
              onBlur={(e) => { const v = e.target.value; if (v !== (task.definitionOfDone || '')) updateTask(task.id, { definitionOfDone: v }); }}
              style={{ width: '100%', fontSize: 13, color: '#1A1D26', border: '1px solid #E2E5EB', borderRadius: 10, padding: '12px 13px', minHeight: 60, lineHeight: 1.5, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          {/* Criterios de aceptación (obligatorios para validar) */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={sectionLabel}>Criterios de aceptación</span>
              {criteria.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: acDone === criteria.length ? '#15803D' : '#BE185D' }}>{acDone}/{criteria.length}</span>}
            </div>
            {criteria.length > 0
              ? <span style={{ display: 'block', height: 6, borderRadius: 999, background: '#F0F2F5', overflow: 'hidden', marginBottom: 12 }}><span style={{ display: 'block', height: '100%', background: acDone === criteria.length ? '#22C55E' : '#EC4899', width: acPct + '%' }} /></span>
              : <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10, lineHeight: 1.5 }}>Sin criterios: la tarea se puede validar libremente. Agregá criterios para exigir que se cumplan antes de pasar a Validado.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {criteria.map(it => (
                <div key={it.id} className="kx-checkrow" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8 }}>
                  <span onClick={() => toggleAc(it.id)} style={{ width: 19, height: 19, borderRadius: 6, flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: it.done ? '#22C55E' : 'transparent', border: it.done ? 'none' : '1.5px solid #D0D5DD' }}>
                    {it.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                  </span>
                  {editAcId === it.id ? (
                    <input autoFocus value={editAcText} onChange={(e) => setEditAcText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveAcItem(it.id); if (e.key === 'Escape') setEditAcId(null); }}
                      onBlur={() => saveAcItem(it.id)}
                      style={{ flex: 1, fontSize: 13, border: '1px solid #C7D2FE', borderRadius: 6, padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }} />
                  ) : (
                    <>
                      <span onClick={() => toggleAc(it.id)} style={{ flex: 1, fontSize: 13, cursor: 'pointer', color: it.done ? '#9CA3AF' : '#1A1D26', textDecoration: it.done ? 'line-through' : 'none' }}>{it.text}</span>
                      <span onClick={() => { setEditAcText(it.text); setEditAcId(it.id); }} title="Editar" style={{ cursor: 'pointer', color: '#C7CBD3', flexShrink: 0, display: 'flex' }}><Pencil size={12} /></span>
                    </>
                  )}
                  <span onClick={() => removeAc(it.id)} title="Eliminar" style={{ cursor: 'pointer', color: '#C7CBD3', flexShrink: 0, display: 'flex' }}><Trash2 size={13} /></span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input value={newAc} onChange={(e) => setNewAc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addAc(); }} placeholder="Agregar criterio de aceptación…"
                style={{ flex: 1, fontSize: 13, color: '#1A1D26', border: '1px solid #E2E5EB', borderRadius: 9, padding: '8px 11px', outline: 'none', fontFamily: 'inherit' }} />
              <span onClick={addAc} style={{ width: 38, height: 38, borderRadius: 9, border: '1px solid #E2E5EB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7280', flexShrink: 0 }}><Plus size={16} /></span>
            </div>
          </div>

          {/* bloqueada por (dependencias) */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Lock size={13} stroke="#9CA3AF" />
              <span style={sectionLabel}>Bloqueada por</span>
            </div>
            {pendingBlockers.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#FEF2F2', color: '#B91C1C', fontSize: 12, lineHeight: 1.45, borderRadius: 9, padding: '9px 11px', marginBottom: 10 }}>
                <Lock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>No se puede avanzar hasta validar {pendingBlockers.length === 1 ? 'la tarea que la bloquea' : 'las tareas que la bloquean'}. Mientras tanto queda en el Backlog.</span>
              </div>
            )}
            {blockers.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {blockers.map(b => {
                  const done = b.status === 'done';
                  return (
                    <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #E2E5EB', borderRadius: 9, padding: '8px 11px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: done ? '#22C55E' : '#F59E0B', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#1A1D26', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={taskLabel(b)}>{taskLabel(b)}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: done ? '#15803D' : '#B45309', flexShrink: 0 }}>{done ? 'Validada' : 'Pendiente'}</span>
                      <span onClick={() => removeBlocker(b.id)} title="Quitar bloqueo" style={{ cursor: 'pointer', color: '#C7CBD3', flexShrink: 0, display: 'flex' }}><X size={14} /></span>
                    </div>
                  );
                })}
              </div>
            )}
            <select value="" onChange={(e) => { addBlocker(e.target.value); e.target.value = ''; }}
              style={{ width: '100%', fontSize: 13, color: candidates.length ? '#1A1D26' : '#9CA3AF', border: '1px solid #E2E5EB', borderRadius: 9, padding: '9px 11px', outline: 'none', background: '#fff', cursor: candidates.length ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
              disabled={!candidates.length}>
              <option value="">{candidates.length ? '+ Agregar tarea que la bloquea…' : 'No hay otras tareas para bloquear'}</option>
              {candidates.map(t => <option key={t.id} value={t.id}>{taskLabel(t)}</option>)}
            </select>
          </div>

          {/* checklist */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={sectionLabel}>Checklist</span>
              {checklist.length > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>{subDone}/{checklist.length}</span>}
            </div>
            {checklist.length > 0 && <span style={{ display: 'block', height: 6, borderRadius: 999, background: '#F0F2F5', overflow: 'hidden', marginBottom: 12 }}><span style={{ display: 'block', height: '100%', background: '#22C55E', width: subPct + '%' }} /></span>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {checklist.map(it => (
                <div key={it.id} className="kx-checkrow" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8 }}>
                  <span onClick={() => toggleItem(it.id)} style={{ width: 19, height: 19, borderRadius: 6, flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: it.done ? '#22C55E' : 'transparent', border: it.done ? 'none' : '1.5px solid #D0D5DD' }}>
                    {it.done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>}
                  </span>
                  {editItemId === it.id ? (
                    <input autoFocus value={editItemText} onChange={(e) => setEditItemText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveItem(it.id); if (e.key === 'Escape') setEditItemId(null); }}
                      onBlur={() => saveItem(it.id)}
                      style={{ flex: 1, fontSize: 13, border: '1px solid #C7D2FE', borderRadius: 6, padding: '4px 8px', outline: 'none', fontFamily: 'inherit' }} />
                  ) : (
                    <>
                      <span onClick={() => toggleItem(it.id)} style={{ flex: 1, fontSize: 13, cursor: 'pointer', color: it.done ? '#9CA3AF' : '#1A1D26', textDecoration: it.done ? 'line-through' : 'none' }}>{it.text}</span>
                      <span onClick={() => { setEditItemText(it.text); setEditItemId(it.id); }} title="Editar" style={{ cursor: 'pointer', color: '#C7CBD3', flexShrink: 0, display: 'flex' }}><Pencil size={12} /></span>
                    </>
                  )}
                  <span onClick={() => removeItem(it.id)} title="Eliminar" style={{ cursor: 'pointer', color: '#C7CBD3', flexShrink: 0, display: 'flex' }}><Trash2 size={13} /></span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }} placeholder="Agregar subtarea…"
                style={{ flex: 1, fontSize: 13, color: '#1A1D26', border: '1px solid #E2E5EB', borderRadius: 9, padding: '8px 11px', outline: 'none', fontFamily: 'inherit' }} />
              <span onClick={addItem} style={{ width: 38, height: 38, borderRadius: 9, border: '1px solid #E2E5EB', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#6B7280', flexShrink: 0 }}><Plus size={16} /></span>
            </div>
          </div>

          {/* Tiempo por estado (tracking de retrasos) */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <Clock size={13} stroke="#9CA3AF" />
              <span style={sectionLabel}>Tiempo por estado</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[['in-progress', 'En curso'], ['en-revision', 'En revisión'], ['blocked', 'Bloqueada'], ['priorizado', 'Priorizado'], ['paused', 'Pausada'], ['backlog', 'Backlog']].map(([k, label]) => {
                const d = dur.byStatus[k];
                if (!d || d < 0.04) return null;
                const tone = k === 'blocked' ? '#DC2626' : (k === 'en-revision' ? '#BE185D' : '#3F4653');
                return <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: tone, background: '#F7F8FA', border: '1px solid #EBEDF1', borderRadius: 8, padding: '5px 10px' }}>{label}<span style={{ color: '#9CA3AF' }}>{fmtDuration(d)}</span></span>;
              })}
              {Object.keys(dur.byStatus).length === 0 && <span style={{ fontSize: 12, color: '#9CA3AF' }}>Sin historial de cambios todavía.</span>}
            </div>
            {task.status !== 'done' && dur.current && (
              <div style={{ fontSize: 12, color: '#6B7280', marginTop: 10 }}>
                Estado actual: <strong style={{ color: '#1A1D26' }}>{STATUS_SHORT[task.status] || task.status}</strong> · hace {fmtDuration(dur.current.days)}
              </div>
            )}
          </div>

          {/* descripción */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ ...sectionLabel, marginBottom: 10 }}>Descripción</div>
            <textarea defaultValue={task.description || ''} placeholder="Describí la tarea para que no quede lugar a dudas…"
              onBlur={(e) => { const v = e.target.value; if (v !== (task.description || '')) updateTask(task.id, { description: v }); }}
              style={{ width: '100%', fontSize: 13, color: '#1A1D26', border: '1px solid #E2E5EB', borderRadius: 10, padding: '12px 13px', minHeight: 74, lineHeight: 1.5, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div onClick={() => { onClose(); openTaskComments(task.id); }} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 500, color: '#3F4653', border: '1px solid #E2E5EB', borderRadius: 10, padding: '11px 13px', cursor: 'pointer' }}>
            <MessageSquare size={16} stroke="#9CA3AF" strokeWidth={1.85} />Comentarios ({commentCount})
          </div>
        </div>

        {/* footer */}
        <div style={{ borderTop: '1px solid #E2E5EB', background: '#fff' }}>
          {gateMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', color: '#DC2626', fontSize: 12.5, padding: '9px 22px' }}>{gateMsg}</div>
          )}
          <div style={{ padding: '14px 22px', display: 'flex', gap: 10 }}>
            {task.status === 'done' ? (
              <span onClick={() => { doReopen(); onClose(); }} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#fff', background: '#5B7CF5', borderRadius: 10, padding: 11, cursor: 'pointer' }}>
                <RotateCcw size={16} />Reabrir tarea
              </span>
            ) : (
              <span onClick={locked ? undefined : doValidate} title={locked ? 'Sprint cerrado: movela al sprint actual para validarla' : undefined}
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#fff', background: locked ? '#A7B0C0' : '#22C55E', borderRadius: 10, padding: 11, cursor: locked ? 'not-allowed' : 'pointer' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>Marcar validada
              </span>
            )}
            {task.sprintId && <span onClick={() => { removeTaskFromSprint(task.id); onClose(); }} title="Quitar del sprint" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: '#6B7280', border: '1px solid #E2E5EB', borderRadius: 10, padding: '11px 16px', cursor: 'pointer' }}>Quitar</span>}
            <span onClick={() => { if (window.confirm(`Eliminar la tarea «${task.title}»? Esta acción no se puede deshacer.`)) { deleteTask(task.id); onClose(); } }} title="Eliminar tarea" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626', border: '1px solid #FBD5D5', borderRadius: 10, padding: '11px 14px', cursor: 'pointer' }}><Trash2 size={16} /></span>
          </div>
        </div>
      </div>
    </>
  );
}
