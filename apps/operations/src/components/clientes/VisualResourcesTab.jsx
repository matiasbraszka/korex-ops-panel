import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ResourcesPanel } from '@korex/ui';
import { Check, Image as ImageIcon, Folder, Plus, X, Pencil } from 'lucide-react';

const CLIENT_RESOURCE_CATEGORIES = ['folder', 'doc', 'sheet', 'landing', 'pdf', 'other'];

const DEFAULT_TEMPLATE = [
  { label: 'Logo', ok: false },
  { label: 'Fotos de producto', ok: false },
  { label: 'Testimonios escritos', ok: false },
  { label: 'Foto de perfil', ok: false },
  { label: 'Videos testimonio', ok: false },
  { label: 'Video presentación', ok: false },
  { label: 'Caso de éxito', ok: false },
];

function VisualChecklist({ client, updateClient }) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const items = client.visualResources && client.visualResources.length > 0
    ? client.visualResources
    : DEFAULT_TEMPLATE;

  const done = items.filter(i => i.ok).length;

  const toggle = (idx) => {
    const next = items.map((it, i) => i === idx ? { ...it, ok: !it.ok } : it);
    updateClient(client.id, { visualResources: next });
  };

  const removeItem = (idx) => {
    const next = items.filter((_, i) => i !== idx);
    updateClient(client.id, { visualResources: next });
  };

  const addItem = () => {
    const label = newLabel.trim();
    if (!label) return;
    updateClient(client.id, { visualResources: [...items, { label, ok: false }] });
    setNewLabel('');
    setAdding(false);
  };

  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm p-[18px]">
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-2 font-bold text-[14px]" style={{ color: '#1A1D26' }}>
          <ImageIcon size={16} className="text-text2" /> Checklist de recursos visuales
        </div>
        <span className="text-[11px] font-semibold py-1 px-2 rounded-full" style={{ background: '#F0F2F5', color: '#6B7280' }}>{done} / {items.length}</span>
      </div>
      <div className="text-[11.5px] mb-3" style={{ color: '#6B7280' }}>{done} / {items.length} recursos disponibles</div>
      <ul className="list-none p-0 m-0 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 py-2 px-2.5 rounded-lg hover:bg-[#F7F9FC] group">
            <button
              className={`w-5 h-5 rounded inline-flex items-center justify-center shrink-0 cursor-pointer border-2`}
              style={it.ok ? { background: '#ECFDF5', borderColor: '#16A34A' } : { background: '#FFFFFF', borderColor: '#D0D5DD' }}
              onClick={() => toggle(i)}
              title={it.ok ? 'Marcar como faltante' : 'Marcar como disponible'}
            >
              {it.ok && <Check size={12} strokeWidth={3} className="text-[#16A34A]" />}
            </button>
            <span className={`flex-1 text-[12.5px] ${it.ok ? 'font-semibold' : 'font-medium'}`} style={{ color: it.ok ? '#1A1D26' : '#6B7280' }}>{it.label}</span>
            <button
              className="w-5 h-5 rounded bg-transparent border-none cursor-pointer text-text3 opacity-0 group-hover:opacity-100 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center transition-opacity"
              onClick={() => removeItem(i)}
              title="Quitar de la checklist"
            ><X size={11} /></button>
          </li>
        ))}
      </ul>
      <div className="mt-3 pt-3 border-t border-[#F0F2F5]">
        {adding ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addItem(); if (e.key === 'Escape') setAdding(false); }}
              placeholder="Ej. Reels editados, Stories templates"
              className="flex-1 text-[12.5px] py-1.5 px-2.5 rounded-md border border-[#E2E5EB] outline-none focus:border-blue"
              autoFocus
            />
            <button className="text-[11.5px] py-1 px-2.5 rounded bg-blue text-white font-medium cursor-pointer border-none" onClick={addItem}>Agregar</button>
            <button className="text-[11.5px] py-1 px-2 rounded bg-surface2 text-text2 cursor-pointer border-none" onClick={() => setAdding(false)}>×</button>
          </div>
        ) : (
          <button className="inline-flex items-center gap-1 text-[11.5px] py-1.5 px-2 rounded-md text-blue font-medium cursor-pointer bg-transparent border-none hover:bg-blue-bg2" onClick={() => setAdding(true)}>
            <Plus size={12} /> Agregar recurso
          </button>
        )}
      </div>
    </div>
  );
}

export default function VisualResourcesTab({ client }) {
  const { updateClient } = useApp();

  return (
    <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <VisualChecklist client={client} updateClient={updateClient} />
      <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm p-[18px]">
        <div className="inline-flex items-center gap-2 font-bold text-[14px] mb-3" style={{ color: '#1A1D26' }}>
          <Folder size={16} className="text-text2" /> Carpetas y enlaces
        </div>
        <ResourcesPanel
          title={null}
          links={client.links || []}
          allowedCategories={CLIENT_RESOURCE_CATEGORIES}
          onAdd={(link) => updateClient(client.id, { links: [...(client.links || []), link] })}
          onUpdate={(prevLink, patch) => {
            const newLinks = (client.links || []).map((l, i) =>
              i === prevLink.originalIdx ? { ...l, ...patch } : l,
            );
            updateClient(client.id, { links: newLinks });
          }}
          onDelete={(prevLink) => {
            const newLinks = (client.links || []).filter((_, i) => i !== prevLink.originalIdx);
            updateClient(client.id, { links: newLinks });
          }}
        />
      </div>
    </div>
  );
}
