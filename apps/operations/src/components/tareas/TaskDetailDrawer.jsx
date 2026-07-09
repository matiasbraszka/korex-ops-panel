import { useMemo, useState } from 'react';
import { X, Plus, Trash2, MessageSquare, Pencil } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { TASK_STATUS } from '../../utils/constants';
import { getAllPhases } from '../../utils/helpers';
import DepartmentPicker from './DepartmentPicker';

const mkId = () => 'cl_' + Math.random().toString(36).slice(2, 9);

export default function TaskDetailDrawer({ taskId, onClose }) {
  const {
    tasks, clients, teamMembers, updateTask, removeTaskFromSprint, deleteTask,
    openTaskComments, taskComments,
  } = useApp();
  const task = useMemo(() => (tasks || []).find(t => t.id === taskId) || null, [tasks, taskId]);
  const client = task ? (clients || []).find(c => c.id === task.clientId) : null;
  const [newItem, setNewItem] = useState('');
  const [editItemId, setEditItemId] = useState(null);
  const [editItemText, setEditItemText] = useState('');
  if (!task) return null;

  const st = TASK_STATUS[task.status] || TASK_STATUS.backlog;
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const subDone = checklist.filter(i => i.done).length;
  const subPct = checklist.length ? Math.round(subDone / checklist.length * 100) : 0;
  const phaseLabel = (getAllPhases(client)[task.phase] || {}).label || '—';
  const owner = (() => { const f = String(task.assignee || '').split(',')[0]?.trim().toLowerCase(); return (teamMembers || []).find(m => m.name?.toLowerCase() === f || m.name?.toLowerCase().split(' ')[0] === f); })();
  const commentCount = (taskComments || []).filter(c => c.task_id === task.id && !c.parent_id).length;

  const saveChecklist = (next) => updateTask(task.id, { checklist: next });
  const addItem = () => { const t = newItem.trim(); if (!t) return; saveChecklist([...checklist, { id: mkId(), text: t, done: false }]); setNewItem(''); };
  const toggleItem = (id) => saveChecklist(checklist.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const removeItem = (id) => saveChecklist(checklist.filter(i => i.id !== id));
  const saveItem = (id) => { const v = editItemText.trim(); if (v) saveChecklist(checklist.map(i => i.id === id ? { ...i, text: v } : i)); setEditItemId(null); };

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
            <div style={metaRow}><span style={metaLabel}>Cliente</span><span style={{ fontSize: 13, fontWeight: 600, color: '#1A1D26', textAlign: 'right', whiteSpace: 'nowrap' }}>{client?.name || '—'}</span></div>
            <div style={metaRow}><span style={metaLabel}>Objetivo / fase</span><span style={{ fontSize: 13, fontWeight: 600, color: '#1A1D26', textAlign: 'right' }}>{phaseLabel}</span></div>
            <div style={metaRow}>
              <span style={metaLabel}>Fecha de entrega</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <input type="date" value={task.dueDate || ''} onChange={(e) => updateTask(task.id, { dueDate: e.target.value || null })}
                  style={{ fontSize: 13, fontWeight: 600, color: '#1A1D26', border: '1px solid #E2E5EB', borderRadius: 7, padding: '5px 8px', background: '#fff', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }} />
                {task.dueDate && <span onClick={() => updateTask(task.id, { dueDate: null })} title="Quitar fecha" style={{ cursor: 'pointer', color: '#C7CBD3', display: 'flex' }}><X size={15} /></span>}
              </span>
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
        <div style={{ padding: '14px 22px', borderTop: '1px solid #E2E5EB', display: 'flex', gap: 10, background: '#fff' }}>
          <span onClick={() => { updateTask(task.id, { status: 'done' }); onClose(); }} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#fff', background: '#22C55E', borderRadius: 10, padding: 11, cursor: 'pointer' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>Marcar validada
          </span>
          {task.sprintId && <span onClick={() => { removeTaskFromSprint(task.id); onClose(); }} title="Quitar del sprint" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: '#6B7280', border: '1px solid #E2E5EB', borderRadius: 10, padding: '11px 16px', cursor: 'pointer' }}>Quitar</span>}
          <span onClick={() => { if (window.confirm(`Eliminar la tarea «${task.title}»? Esta acción no se puede deshacer.`)) { deleteTask(task.id); onClose(); } }} title="Eliminar tarea" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626', border: '1px solid #FBD5D5', borderRadius: 10, padding: '11px 14px', cursor: 'pointer' }}><Trash2 size={16} /></span>
        </div>
      </div>
    </>
  );
}
