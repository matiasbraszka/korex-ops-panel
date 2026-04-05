import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TASK_PRIO } from '../utils/constants';
import { initials, fmtDate, today } from '../utils/helpers';
import KpiRow from '../components/KpiRow';
import Modal from '../components/Modal';

const SOURCE_CONFIG = {
  cliente: { label: 'Cliente', color: '#5B7CF5', bg: '#EEF2FF' },
  usuario: { label: 'Usuario', color: '#8B5CF6', bg: '#F5F3FF' },
  mentor: { label: 'Mentor', color: '#22C55E', bg: '#ECFDF5' },
  equipo: { label: 'Equipo', color: '#F97316', bg: '#FFF7ED' },
  agente: { label: 'Agente IA', color: '#06B6D4', bg: '#ECFEFF' },
};

export default function FeedbackPage() {
  const { clients, updateClient, createTask, updateTask, currentUser, setView, setSelectedId } = useApp();
  const [sourceFilter, setSourceFilter] = useState('all');
  const [addModal, setAddModal] = useState(false);
  const [newFb, setNewFb] = useState({ clientId: '', source: 'cliente', callUrl: '', priority: 'normal', items: [''] });

  // Collect all feedback from all clients, handling both old and new format
  let allFb = [];
  clients.forEach(c => {
    (c.clientFeedbacks || []).forEach((f, fi) => {
      // Normalize: old format has {text, source, type, ...}, new format has {items, source, ...}
      const source = f.source === 'whatsapp' || f.source === 'call' || f.source === 'slack' || f.source === 'email' || f.source === 'other' || f.source === 'otro'
        ? 'cliente' : (f.source || 'cliente');
      const items = f.items || [{ text: f.text, convertedTaskId: f.convertedTaskId || null }];
      const priority = f.priority || 'normal';
      allFb.push({ client: c, fb: { ...f, source, items, priority }, idx: fi });
    });
  });
  allFb.sort((a, b) => (b.fb.date || '').localeCompare(a.fb.date || ''));

  // Filter by source
  if (sourceFilter !== 'all') allFb = allFb.filter(x => x.fb.source === sourceFilter);

  const total = allFb.length;
  const fromClients = allFb.filter(x => x.fb.source === 'cliente').length;
  const fromUsers = allFb.filter(x => x.fb.source === 'usuario').length;
  const converted = allFb.reduce((s, x) => s + x.fb.items.filter(i => i.convertedTaskId).length, 0);

  const openClient = (id) => { setSelectedId(id); setView('clients'); };

  const addFbComment = (clientId, fbIdx) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    const text = prompt('Tu comentario:');
    if (!text?.trim()) return;
    const newFbs = [...(c.clientFeedbacks || [])];
    newFbs[fbIdx] = { ...newFbs[fbIdx], comments: [...(newFbs[fbIdx].comments || []), { user: currentUser?.name || 'Usuario', text: text.trim(), date: today() }] };
    updateClient(c.id, { clientFeedbacks: newFbs });
  };

  const convertItemToTask = (clientId, fbIdx, itemIdx) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    const fb = c.clientFeedbacks[fbIdx];
    const items = fb.items || [{ text: fb.text, convertedTaskId: fb.convertedTaskId }];
    const item = items[itemIdx];
    if (!item || item.convertedTaskId) return;
    const t = createTask(item.text.substring(0, 80), clientId, '', 'normal', 'backlog', '', null);
    updateTask(t.id, { description: item.text });
    const newFbs = [...(c.clientFeedbacks || [])];
    const newItems = [...items];
    newItems[itemIdx] = { ...newItems[itemIdx], convertedTaskId: t.id };
    newFbs[fbIdx] = { ...newFbs[fbIdx], items: newItems };
    updateClient(c.id, { clientFeedbacks: newFbs });
  };

  const deleteItem = (clientId, fbIdx, itemIdx) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    const fb = c.clientFeedbacks[fbIdx];
    const items = fb.items || [{ text: fb.text }];
    if (items.length <= 1) {
      // Delete entire feedback
      const newFbs = c.clientFeedbacks.filter((_, i) => i !== fbIdx);
      updateClient(c.id, { clientFeedbacks: newFbs });
    } else {
      const newItems = items.filter((_, i) => i !== itemIdx);
      const newFbs = [...(c.clientFeedbacks || [])];
      newFbs[fbIdx] = { ...newFbs[fbIdx], items: newItems };
      updateClient(c.id, { clientFeedbacks: newFbs });
    }
  };

  const deleteFeedback = (clientId, fbIdx) => {
    const c = clients.find(x => x.id === clientId);
    if (!c) return;
    const newFbs = c.clientFeedbacks.filter((_, i) => i !== fbIdx);
    updateClient(c.id, { clientFeedbacks: newFbs });
  };

  const handleAddFeedback = () => {
    if (!newFb.clientId) { alert('Selecciona un cliente'); return; }
    const validItems = newFb.items.filter(i => i.trim());
    if (!validItems.length) { alert('Agrega al menos un feedback'); return; }
    const c = clients.find(x => x.id === newFb.clientId);
    if (!c) return;
    const fb = {
      id: 'fb_' + Date.now(),
      source: newFb.source,
      callUrl: newFb.callUrl.trim(),
      date: today(),
      priority: newFb.priority,
      items: validItems.map(text => ({ text: text.trim(), convertedTaskId: null })),
      comments: [],
    };
    updateClient(c.id, { clientFeedbacks: [...(c.clientFeedbacks || []), fb] });
    setAddModal(false);
    setNewFb({ clientId: '', source: 'cliente', callUrl: '', priority: 'normal', items: [''] });
  };

  const prioCfg = (p) => TASK_PRIO[p] || TASK_PRIO.normal;

  return (
    <div>
      <KpiRow items={[
        { label: 'Total feedback', value: total, color: 'var(--color-blue)' },
        { label: 'De clientes', value: fromClients, color: 'var(--color-blue)' },
        { label: 'De usuarios', value: fromUsers, color: 'var(--color-purple)' },
        { label: 'Escalados a tarea', value: converted, color: 'var(--color-green)' },
      ]} />

      {/* Filters + Add button */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['all', 'cliente', 'usuario', 'mentor', 'equipo', 'agente'].map(key => {
          const cfg = key === 'all' ? { label: 'Todos', color: '#6B7280', bg: '#F0F2F5' } : SOURCE_CONFIG[key];
          return (
            <button key={key} className={`py-1.5 px-3 rounded-full text-xs font-medium cursor-pointer font-sans border ${sourceFilter === key ? 'text-white border-transparent' : 'bg-white border-border text-text2 hover:border-blue'}`}
              style={sourceFilter === key ? { background: cfg.color } : {}}
              onClick={() => setSourceFilter(key)}
            >{cfg.label}</button>
          );
        })}
        <button className="ml-auto py-1.5 px-3 rounded-md bg-blue text-white text-xs font-medium cursor-pointer font-sans border-none hover:bg-blue-dark" onClick={() => setAddModal(true)}>+ Agregar feedback</button>
      </div>

      {!allFb.length && (
        <div className="text-center py-10 text-text3 text-sm">Sin feedback registrado. Click en &quot;+ Agregar feedback&quot; para empezar.</div>
      )}

      {allFb.map(({ client: c, fb: f, idx: fi }, i) => {
        const srcCfg = SOURCE_CONFIG[f.source] || SOURCE_CONFIG.cliente;
        const prio = prioCfg(f.priority);
        return (
          <div key={i} className="bg-white border border-border rounded-[10px] p-4 mb-2.5 group">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold cursor-pointer shrink-0" style={{ background: c.color + '15', color: c.color }} onClick={() => openClient(c.id)}>{initials(c.name)}</div>
              <div className="font-semibold text-[13px] cursor-pointer hover:text-blue" onClick={() => openClient(c.id)}>{c.name}</div>
              <span className="py-[2px] px-2 rounded-full text-[10px] font-bold" style={{ background: srcCfg.bg, color: srcCfg.color }}>{srcCfg.label}</span>
              {(f.priority === 'urgent' || f.priority === 'high') && <span className="text-[10px] font-semibold" style={{ color: prio.color }}>{prio.flag} {prio.label}</span>}
              {f.callUrl && <a href={f.callUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue no-underline hover:underline ml-auto">{'\uD83C\uDFAC'} Ver llamada</a>}
              <span className="text-[10px] text-text3 ml-auto">{fmtDate(f.date || '')}</span>
              <button className="bg-transparent border-none text-text3 cursor-pointer text-sm opacity-0 group-hover:opacity-100 hover:text-red" onClick={() => deleteFeedback(c.id, fi)} title="Eliminar">{'\u2715'}</button>
            </div>

            {/* Items */}
            {f.items.map((item, itemIdx) => (
              <div key={itemIdx} className="flex items-start gap-2 py-1.5 pl-9 border-b border-border last:border-b-0 group/item">
                <span className="text-blue text-xs mt-0.5 shrink-0">{'\u2022'}</span>
                <div className="flex-1 text-[13px] leading-relaxed">{item.text}</div>
                <div className="flex gap-1 shrink-0 opacity-0 group-hover/item:opacity-100">
                  {!item.convertedTaskId ? (
                    <button className="py-[2px] px-1.5 rounded text-[10px] bg-blue-bg text-blue border-none cursor-pointer font-sans hover:bg-blue hover:text-white" onClick={() => convertItemToTask(c.id, fi, itemIdx)}>{'\u2192'} Tarea</button>
                  ) : (
                    <span className="text-[10px] text-green font-semibold">{'\u2713'}</span>
                  )}
                  <button className="py-[2px] px-1 rounded text-[10px] text-text3 bg-transparent border-none cursor-pointer hover:text-red hover:bg-red-bg" onClick={() => deleteItem(c.id, fi, itemIdx)}>{'\u2715'}</button>
                </div>
              </div>
            ))}

            {/* Comments */}
            {f.comments?.length > 0 && (
              <div className="mt-2 pl-9 border-l-2 border-border ml-0">
                {f.comments.map((cm, ci) => (
                  <div key={ci} className="text-xs mb-1 text-text2"><strong className="text-text">{cm.user}:</strong> {cm.text} <span className="text-[9px] text-text3">{fmtDate(cm.date)}</span></div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-2 pl-9">
              <button className="py-1 px-2 rounded text-[11px] bg-transparent text-text3 border-none cursor-pointer font-sans hover:text-text hover:bg-surface2" onClick={() => addFbComment(c.id, fi)}>{'\uD83D\uDCAC'} Comentar</button>
            </div>
          </div>
        );
      })}

      {/* Add Feedback Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Agregar feedback" footer={<>
        <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setAddModal(false)}>Cancelar</button>
        <button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={handleAddFeedback}>Guardar</button>
      </>}>
        {/* Client selector */}
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-1">Cliente</label>
          <select className="w-full bg-bg border border-border rounded-md py-2.5 px-3 text-text text-[13px] font-sans outline-none" value={newFb.clientId} onChange={e => setNewFb(f => ({ ...f, clientId: e.target.value }))}>
            <option value="">Seleccionar cliente...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.company}</option>)}
          </select>
        </div>

        {/* Source pills */}
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-1">Fuente</label>
          <div className="flex gap-1.5">
            {Object.entries(SOURCE_CONFIG).map(([key, cfg]) => (
              <button key={key} className={`py-1.5 px-3 rounded-full text-xs font-medium cursor-pointer font-sans border ${newFb.source === key ? 'text-white border-transparent' : 'bg-white border-border text-text2'}`}
                style={newFb.source === key ? { background: cfg.color } : {}}
                onClick={() => setNewFb(f => ({ ...f, source: key }))}
              >{cfg.label}</button>
            ))}
          </div>
        </div>

        {/* Call URL */}
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-1">URL de la llamada (opcional)</label>
          <input type="text" className="w-full bg-bg border border-border rounded-md py-2 px-3 text-text text-[13px] font-sans outline-none focus:border-blue" placeholder="https://fathom.video/..." value={newFb.callUrl} onChange={e => setNewFb(f => ({ ...f, callUrl: e.target.value }))} />
        </div>

        {/* Priority */}
        <div className="mb-3.5">
          <label className="block text-xs font-semibold text-text2 mb-1">Prioridad</label>
          <select className="w-full bg-bg border border-border rounded-md py-2 px-3 text-text text-[13px] font-sans outline-none" value={newFb.priority} onChange={e => setNewFb(f => ({ ...f, priority: e.target.value }))}>
            <option value="urgent">Urgente</option>
            <option value="high">Alta</option>
            <option value="normal">Normal</option>
            <option value="low">Baja</option>
          </select>
        </div>

        {/* Feedback items */}
        <div className="mb-2">
          <label className="block text-xs font-semibold text-text2 mb-1">Feedback (uno por linea)</label>
          {newFb.items.map((item, idx) => (
            <div key={idx} className="flex gap-1.5 mb-1.5">
              <input type="text" className="flex-1 bg-bg border border-border rounded-md py-2 px-3 text-text text-[13px] font-sans outline-none focus:border-blue" placeholder="Escribe el feedback..." value={item} onChange={e => { const items = [...newFb.items]; items[idx] = e.target.value; setNewFb(f => ({ ...f, items })); }} />
              {newFb.items.length > 1 && <button className="bg-transparent border-none text-text3 cursor-pointer hover:text-red text-sm" onClick={() => setNewFb(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}>{'\u2715'}</button>}
            </div>
          ))}
          <button className="text-[11px] text-blue bg-transparent border-none cursor-pointer font-sans hover:underline" onClick={() => setNewFb(f => ({ ...f, items: [...f.items, ''] }))}>+ Agregar otro item</button>
        </div>
      </Modal>
    </div>
  );
}