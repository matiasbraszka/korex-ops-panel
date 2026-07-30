// RolesCatalogEditor — modal para administrar el catálogo de roles funcionales
// de la pizarra (agregar, renombrar, cambiar color, borrar).

import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

export default function RolesCatalogEditor({ roles, addRole, updateRole, deleteRole, onClose }) {
  const [newLabel, setNewLabel] = useState('');

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    addRole(label, '#94A3B8');
    setNewLabel('');
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-surface rounded-xl border border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h3 className="text-[15px] font-bold text-text">Roles de la pizarra</h3>
            <p className="text-[11px] text-text3">Quién puede hacer cada tarea. Estos roles aparecen en cada ítem.</p>
          </div>
          <button onClick={onClose} className="text-text3 hover:text-text cursor-pointer" title="Cerrar"><X size={18} /></button>
        </div>

        <div className="p-3 max-h-[55vh] overflow-auto space-y-1.5">
          {roles.map((r) => (
            <div key={r.id} className="flex items-center gap-2 px-1">
              <input
                type="color"
                value={r.color}
                onChange={(e) => updateRole(r.id, { color: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border border-border bg-surface p-0.5 shrink-0"
                title="Color del rol"
              />
              <input
                value={r.label}
                onChange={(e) => updateRole(r.id, { label: e.target.value })}
                className="flex-1 min-w-0 bg-surface2 rounded-md px-2.5 py-1.5 text-[13px] text-text outline-none focus:ring-1 focus:ring-purple"
              />
              <button onClick={() => { if (confirm(`¿Borrar el rol "${r.label}"? Se quita de los ítems que lo usan.`)) deleteRole(r.id); }} className="text-text3 hover:text-red cursor-pointer shrink-0" title="Borrar rol"><Trash2 size={15} /></button>
            </div>
          ))}
          {roles.length === 0 && <p className="text-[12px] text-text3 px-1 py-4 text-center">No hay roles. Agregá el primero abajo.</p>}
        </div>

        <div className="flex items-center gap-2 px-3 py-3 border-t border-border">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder="Nombre del nuevo rol…"
            className="flex-1 bg-surface2 rounded-md px-2.5 py-1.5 text-[13px] text-text outline-none focus:ring-1 focus:ring-purple"
          />
          <button onClick={add} className="flex items-center gap-1.5 bg-purple text-white rounded-md px-3 py-1.5 text-[12.5px] font-semibold cursor-pointer hover:opacity-90"><Plus size={14} /> Agregar</button>
        </div>
      </div>
    </div>
  );
}
