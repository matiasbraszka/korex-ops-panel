// RolePicker — popover para elegir un rol funcional del catálogo de la pizarra.
// Muestra el rol actual como chip de color; al abrir lista los roles y permite
// quitar la asignación.

import { useState } from 'react';

export function RoleChip({ role, muted, onClick }) {
  if (!role) {
    return (
      <button
        type="button"
        onClick={onClick}
        onPointerDown={(e) => e.stopPropagation()}
        className="shrink-0 text-[9.5px] font-semibold text-text3 border border-dashed border-border-light rounded px-1.5 py-0.5 hover:text-purple hover:border-purple cursor-pointer"
        title="Asignar rol"
      >
        + rol
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className="shrink-0 text-[9.5px] font-bold rounded px-1.5 py-0.5 cursor-pointer uppercase tracking-wide"
      style={{ color: role.color, background: role.color + '22', opacity: muted ? 0.6 : 1 }}
      title="Cambiar rol"
    >
      {role.label}
    </button>
  );
}

export default function RolePicker({ roles, value, onChange, muted }) {
  const [open, setOpen] = useState(false);
  const current = roles.find((r) => r.id === value) || null;

  return (
    <div className="relative shrink-0">
      <RoleChip role={current} muted={muted} onClick={() => setOpen((v) => !v)} />
      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            onPointerDown={(e) => e.stopPropagation()}
            className="fixed inset-0 z-40 bg-transparent border-none cursor-default"
          />
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute z-50 mt-1 left-0 w-44 max-h-64 overflow-auto bg-surface border border-border rounded-lg shadow-lg p-1"
          >
            {roles.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { onChange(r.id); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[12px] text-left hover:bg-surface2 cursor-pointer ${r.id === value ? 'bg-surface2' : ''}`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                <span className="text-text truncate">{r.label}</span>
              </button>
            ))}
            {current && (
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className="w-full text-left px-2 py-1.5 rounded text-[11.5px] text-text3 hover:bg-surface2 cursor-pointer border-t border-border mt-1"
              >
                Quitar rol
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
