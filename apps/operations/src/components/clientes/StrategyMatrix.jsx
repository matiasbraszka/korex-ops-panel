import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ExternalLink, FileText, Folder, Plus, ChevronDown, Trash2, Pencil, Check, X, Image as ImageIcon } from 'lucide-react';

const STATUS_STYLES = {
  activa: { bg: '#ECFDF5', fg: '#16A34A', label: 'Activa' },
  borrador: { bg: '#F0F2F5', fg: '#6B7280', label: 'Borrador' },
  pausada: { bg: '#FEFCE8', fg: '#CA8A04', label: 'Pausada' },
};

function PageRow({ p, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: p.name, testing_url: p.testing_url || '', prod_url: p.prod_url || '', is_live: p.is_live });

  const save = () => {
    onUpdate(p.id, form);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="grid items-center py-2 px-3 bg-blue-bg2 gap-2" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 80px' }}>
        <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="text-[12px] py-1 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="Nombre página" />
        <input type="text" value={form.testing_url} onChange={e => setForm({ ...form, testing_url: e.target.value })} className="text-[11px] py-1 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="URL testing" />
        <div className="flex items-center gap-1.5">
          <input type="text" value={form.prod_url} onChange={e => setForm({ ...form, prod_url: e.target.value })} className="text-[11px] py-1 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue flex-1" placeholder="URL producción" />
          <label className="inline-flex items-center gap-1 text-[10px] cursor-pointer" title="Marcar como live"><input type="checkbox" checked={form.is_live} onChange={e => setForm({ ...form, is_live: e.target.checked })} /> live</label>
        </div>
        <div className="flex gap-1">
          <button className="text-[11px] py-1 px-2 rounded bg-blue text-white font-medium cursor-pointer border-none" onClick={save}>OK</button>
          <button className="text-[11px] py-1 px-2 rounded bg-surface2 text-text2 cursor-pointer border-none" onClick={() => setEditing(false)}>×</button>
        </div>
      </div>
    );
  }

  const cell = (url, isLive) => url ? (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] no-underline text-blue py-1 px-2 rounded-md bg-blue-bg hover:bg-[#DEE6FE]">
      Abrir <ExternalLink size={11} />
      {isLive && <span className="ml-1 inline-flex items-center py-[1px] px-1.5 rounded-full text-[9px] font-bold bg-green-bg text-[#16A34A]">live</span>}
    </a>
  ) : <span className="text-[12px]" style={{ color: '#9CA3AF' }}>—</span>;

  return (
    <div className="grid items-center py-2 px-3 border-b border-[#F0F2F5] last:border-b-0 hover:bg-[#F7F9FC] group" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 80px' }}>
      <div className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: '#1A1D26' }}>
        <FileText size={13} className="text-[#9CA3AF] shrink-0" />{p.name}
      </div>
      <div>{cell(p.testing_url, false)}</div>
      <div>{cell(p.prod_url, p.is_live)}</div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
        <button className="w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setEditing(true)} title="Editar"><Pencil size={11} /></button>
        <button className="w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm('¿Borrar esta página?')) onDelete(p.id); }} title="Eliminar"><Trash2 size={11} /></button>
      </div>
    </div>
  );
}

function VisualChecklist({ strategy, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const items = Array.isArray(strategy.visual_resources) ? strategy.visual_resources : [];
  const done = items.filter(i => i.ok).length;

  const toggle = (idx) => {
    const next = items.map((it, i) => i === idx ? { ...it, ok: !it.ok } : it);
    onUpdate(strategy.id, { visual_resources: next });
  };
  const removeItem = (idx) => {
    onUpdate(strategy.id, { visual_resources: items.filter((_, i) => i !== idx) });
  };
  const addItem = () => {
    const label = newLabel.trim();
    if (!label) return;
    onUpdate(strategy.id, { visual_resources: [...items, { label, ok: false }] });
    setNewLabel('');
    setAdding(false);
  };

  return (
    <div className="border-t border-[#F0F2F5] py-3 px-3" style={{ background: '#FAFBFC' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>
          <ImageIcon size={12} /> Recursos necesarios
        </div>
        {items.length > 0 && (
          <span className="text-[10.5px] font-semibold py-[2px] px-1.5 rounded-full" style={{ background: '#F0F2F5', color: '#6B7280' }}>{done} / {items.length}</span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="text-[11.5px] mb-2 italic" style={{ color: '#9CA3AF' }}>
          Aún no agregaste recursos para esta estrategia. Ejemplos: logo, fotos de producto, vídeos testimonio.
        </div>
      ) : (
        <ul className="list-none p-0 m-0 grid gap-1" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-white group">
              <button
                className={`w-[18px] h-[18px] rounded inline-flex items-center justify-center shrink-0 cursor-pointer border-2`}
                style={it.ok ? { background: '#ECFDF5', borderColor: '#16A34A' } : { background: '#FFFFFF', borderColor: '#D0D5DD' }}
                onClick={() => toggle(i)}
                title={it.ok ? 'Marcar como faltante' : 'Marcar como disponible'}
              >
                {it.ok && <Check size={11} strokeWidth={3} className="text-[#16A34A]" />}
              </button>
              <span className={`flex-1 text-[12px] ${it.ok ? 'font-semibold' : 'font-medium'}`} style={{ color: it.ok ? '#1A1D26' : '#6B7280' }}>{it.label}</span>
              <button className="w-5 h-5 rounded bg-transparent border-none cursor-pointer text-text3 opacity-0 group-hover:opacity-100 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center transition-opacity" onClick={() => removeItem(i)} title="Quitar"><X size={10} /></button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="flex gap-1.5 mt-2">
          <input
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addItem(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="Ej. Logo, fotos producto, vídeo VSL…"
            className="flex-1 text-[12px] py-1.5 px-2.5 rounded-md border border-[#E2E5EB] outline-none focus:border-blue"
            autoFocus
          />
          <button className="text-[11px] py-1 px-2.5 rounded bg-blue text-white font-medium cursor-pointer border-none" onClick={addItem}>Agregar</button>
          <button className="text-[11px] py-1 px-2 rounded bg-surface2 text-text2 cursor-pointer border-none" onClick={() => setAdding(false)}>×</button>
        </div>
      ) : (
        <button className="mt-2 inline-flex items-center gap-1 text-[11px] py-1 px-2 rounded-md text-blue font-medium cursor-pointer bg-transparent border-none hover:bg-blue-bg" onClick={() => setAdding(true)}>
          <Plus size={11} /> Agregar recurso
        </button>
      )}
    </div>
  );
}

function StrategyCard({ s, pages }) {
  const { updateStrategy, deleteStrategy, addStrategyPage, updateStrategyPage, deleteStrategyPage } = useApp();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(s.name);
  const [adding, setAdding] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const myPages = pages.filter(p => p.strategy_id === s.id).sort((a, b) => (a.position || 0) - (b.position || 0));
  const st = STATUS_STYLES[s.status] || STATUS_STYLES.borrador;

  const saveName = () => {
    if (nameValue.trim() && nameValue !== s.name) updateStrategy(s.id, { name: nameValue.trim() });
    setEditingName(false);
  };

  const addPage = () => {
    if (!newPageName.trim()) return;
    addStrategyPage({ strategy_id: s.id, name: newPageName.trim(), position: myPages.length });
    setNewPageName('');
    setAdding(false);
  };

  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm overflow-hidden mb-4">
      {/* Header */}
      <div className="flex items-center gap-3 py-3 px-4 border-b border-[#F0F2F5]" style={{ background: '#F5F7FF' }}>
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold text-white" style={{ background: '#1A1D26' }}>#{s.position + 1}</span>
        {editingName ? (
          <input type="text" value={nameValue} onChange={e => setNameValue(e.target.value)} onBlur={saveName} onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameValue(s.name); setEditingName(false); } }} autoFocus className="text-[14px] font-bold py-0.5 px-1.5 border border-blue rounded outline-none flex-1" style={{ color: '#1A1D26' }} />
        ) : (
          <span className="text-[14px] font-bold cursor-pointer hover:bg-white px-1.5 py-0.5 rounded flex-1" style={{ color: '#1A1D26' }} onClick={() => setEditingName(true)}>{s.name}</span>
        )}
        <div className="relative">
          <button className="inline-flex items-center py-[3px] px-[9px] rounded-full text-[10px] font-bold cursor-pointer hover:opacity-80 border-none" style={{ background: st.bg, color: st.fg }} onClick={() => setStatusOpen(o => !o)}>{st.label}</button>
          {statusOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E5EB] rounded-lg shadow-md z-10 min-w-[120px]">
              {Object.entries(STATUS_STYLES).map(([k, v]) => (
                <button key={k} className="block w-full text-left text-[11px] py-1.5 px-2.5 hover:bg-blue-bg2 bg-transparent border-none cursor-pointer font-medium" style={{ color: v.fg }} onClick={() => { updateStrategy(s.id, { status: k }); setStatusOpen(false); }}>{v.label}</button>
              ))}
            </div>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] py-1 px-2 rounded-md bg-white border border-[#E2E5EB]" style={{ color: '#6B7280' }}>
          {s.version} · actual <ChevronDown size={11} />
        </span>
        <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm(`¿Borrar la estrategia "${s.name}" y todas sus páginas?`)) deleteStrategy(s.id); }} title="Eliminar estrategia"><Trash2 size={13} /></button>
      </div>

      {/* Matriz */}
      <div>
        <div className="grid items-center py-2 px-3 text-[10px] font-bold uppercase tracking-wider border-b border-[#F0F2F5]" style={{ gridTemplateColumns: '1.6fr 1fr 1fr 80px', color: '#9CA3AF' }}>
          <div>Página</div>
          <div>Testing</div>
          <div>Producción</div>
          <div />
        </div>
        {myPages.length === 0 ? (
          <div className="text-center text-text3 text-[12px] py-4">Sin páginas. Agregá la primera abajo.</div>
        ) : (
          myPages.map(p => (
            <PageRow key={p.id} p={p} onUpdate={updateStrategyPage} onDelete={deleteStrategyPage} />
          ))
        )}
        {adding ? (
          <div className="grid items-center py-2 px-3 gap-2 bg-blue-bg2" style={{ gridTemplateColumns: '1fr auto auto' }}>
            <input type="text" value={newPageName} onChange={e => setNewPageName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPage(); if (e.key === 'Escape') setAdding(false); }} autoFocus placeholder="Nombre de la página (ej. VSL, Landing, Página de gracias)" className="text-[12px] py-1.5 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" />
            <button className="text-[11px] py-1 px-2.5 rounded bg-blue text-white font-medium cursor-pointer border-none" onClick={addPage}>Agregar</button>
            <button className="text-[11px] py-1 px-2 rounded bg-surface2 text-text2 cursor-pointer border-none" onClick={() => setAdding(false)}>×</button>
          </div>
        ) : (
          <button className="w-full text-left text-[11.5px] py-2 px-3 bg-transparent border-none cursor-pointer text-blue font-medium hover:bg-blue-bg2 inline-flex items-center gap-1" onClick={() => setAdding(true)}><Plus size={12} /> Agregar página</button>
        )}
      </div>

      {/* Footer: drive + docs */}
      <div className="flex flex-wrap items-center gap-1.5 py-2.5 px-3 border-t border-[#F0F2F5]" style={{ background: '#FAFBFC' }}>
        {s.drive_url ? (
          <a href={s.drive_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11.5px] no-underline py-1 px-2 rounded-md bg-white border border-[#E2E5EB] hover:border-blue hover:text-blue" style={{ color: '#6B7280' }}>
            <Folder size={12} /> Drive · {s.name}
          </a>
        ) : (
          <button className="inline-flex items-center gap-1.5 text-[11.5px] bg-transparent py-1 px-2 rounded-md border border-dashed border-[#D0D5DD] cursor-pointer text-text3 hover:text-blue hover:border-blue" onClick={() => {
            const u = window.prompt('URL del Drive de esta estrategia:');
            if (u) updateStrategy(s.id, { drive_url: u });
          }}><Folder size={12} /> + Drive</button>
        )}
        {(s.docs || []).map((d, di) => (
          <a key={di} href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11.5px] no-underline py-1 px-2 rounded-md bg-white border border-[#E2E5EB] hover:border-blue hover:text-blue" style={{ color: '#6B7280' }}>
            <FileText size={12} /> {d.label}
          </a>
        ))}
        <button className="inline-flex items-center gap-1 text-[11px] bg-transparent py-1 px-2 rounded-md border border-dashed border-[#D0D5DD] cursor-pointer text-text3 hover:text-blue hover:border-blue" onClick={() => {
          const label = window.prompt('Nombre del documento (ej. Guion VSL, Copy de anuncios):');
          if (!label) return;
          const url = window.prompt('URL del documento:');
          if (!url) return;
          updateStrategy(s.id, { docs: [...(s.docs || []), { label, url }] });
        }}><Plus size={11} /> Doc</button>
      </div>

      <VisualChecklist strategy={s} onUpdate={updateStrategy} />
    </div>
  );
}

export default function StrategyMatrix({ clientId }) {
  const { strategies, strategyPages, addStrategy } = useApp();
  const myStrategies = strategies.filter(s => s.client_id === clientId).sort((a, b) => (a.position || 0) - (b.position || 0));

  const newStrategy = () => {
    const name = window.prompt('Nombre de la nueva estrategia:');
    if (!name) return;
    addStrategy({ client_id: clientId, name, position: myStrategies.length, status: 'borrador', version: 'v1' });
  };

  return (
    <div className="mb-4">
      {myStrategies.length === 0 && (
        <div className="bg-white border border-dashed border-[#D0D5DD] rounded-xl text-center py-10 mb-3">
          <div className="text-[13px] mb-1 font-medium" style={{ color: '#1A1D26' }}>Sin estrategias todavía</div>
          <div className="text-[11.5px] text-text2 mb-3">Cada estrategia agrupa las páginas de un embudo (VSL, Landing, Página de gracias…) con sus URLs de testing y producción.</div>
        </div>
      )}
      {myStrategies.map(s => <StrategyCard key={s.id} s={s} pages={strategyPages} />)}
      <button className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg border border-[#E2E5EB] bg-white text-[12.5px] font-medium cursor-pointer hover:border-blue hover:text-blue" style={{ color: '#1A1D26' }} onClick={newStrategy}><Plus size={14} /> Nueva estrategia</button>
    </div>
  );
}
