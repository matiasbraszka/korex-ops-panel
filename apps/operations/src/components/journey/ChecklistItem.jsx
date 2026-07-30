// ChecklistItem — una fila de la checklist de una tarjeta.
// Editable: texto (autoexpandible), rol funcional, persona opcional y tiempo.

import { useEffect, useRef, useState } from 'react';
import { X, User, ChevronUp, ChevronDown } from 'lucide-react';
import RolePicker from './RolePicker';

function autosize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function PersonPicker({ teamMembers, value, onChange }) {
  const [open, setOpen] = useState(false);
  const current = teamMembers.find((m) => (m.id === value || m.user_id === value)) || null;
  const initials = (m) => m.initials || (m.name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onPointerDown={(e) => e.stopPropagation()}
        className="shrink-0 flex items-center gap-1 text-[9.5px] font-semibold rounded px-1 py-0.5 cursor-pointer border"
        style={current
          ? { color: '#fff', background: current.color || '#64748B', borderColor: 'transparent' }
          : { color: 'var(--color-text3)', borderStyle: 'dashed', borderColor: 'var(--color-border-light)' }}
        title={current ? current.name : 'Asignar persona'}
      >
        {current ? <span>{initials(current)}</span> : <><User size={10} /> persona</>}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} onPointerDown={(e) => e.stopPropagation()} className="fixed inset-0 z-40 bg-transparent border-none cursor-default" />
          <div onPointerDown={(e) => e.stopPropagation()} className="absolute z-50 mt-1 left-0 w-48 max-h-64 overflow-auto bg-surface border border-border rounded-lg shadow-lg p-1">
            {teamMembers.length === 0 && <div className="px-2 py-2 text-[11.5px] text-text3">No hay personas cargadas.</div>}
            {teamMembers.map((m) => {
              const id = m.id || m.user_id;
              return (
                <button key={id} type="button" onClick={() => { onChange(id); setOpen(false); }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[12px] text-left hover:bg-surface2 cursor-pointer ${id === value ? 'bg-surface2' : ''}`}>
                  <span className="w-5 h-5 rounded-full grid place-items-center text-[8.5px] font-bold text-white shrink-0" style={{ background: m.color || '#64748B' }}>{initials(m)}</span>
                  <span className="text-text truncate">{m.name}</span>
                  {m.role && <span className="text-text3 text-[10px] truncate ml-auto">{m.role}</span>}
                </button>
              );
            })}
            {current && (
              <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="w-full text-left px-2 py-1.5 rounded text-[11.5px] text-text3 hover:bg-surface2 cursor-pointer border-t border-border mt-1">Quitar persona</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function ChecklistItem({ item, roles, teamMembers, canUp, canDown, onChange, onDelete, onToggle, onMove }) {
  const taRef = useRef(null);
  useEffect(() => { autosize(taRef.current); }, [item.text]);

  return (
    <div className="group/i flex items-start gap-1.5 px-2 py-1.5 border-b border-border/60 last:border-b-0 hover:bg-surface2/40">
      <button
        type="button"
        onClick={() => onToggle()}
        onPointerDown={(e) => e.stopPropagation()}
        className={`mt-0.5 w-3.5 h-3.5 rounded border shrink-0 cursor-pointer grid place-items-center ${item.done ? 'bg-purple border-purple text-white' : 'border-border-light bg-surface'}`}
        title={item.done ? 'Hecho' : 'Marcar como hecho'}
      >
        {item.done && <span className="text-[9px] leading-none">✓</span>}
      </button>

      <div className="flex-1 min-w-0">
        <textarea
          ref={taRef}
          value={item.text}
          rows={1}
          placeholder="Describí la tarea…"
          onChange={(e) => onChange({ text: e.target.value })}
          onInput={(e) => autosize(e.target)}
          onPointerDown={(e) => e.stopPropagation()}
          className={`w-full resize-none bg-transparent outline-none text-[11px] leading-snug text-text placeholder:text-text3 ${item.done ? 'line-through text-text3' : ''}`}
        />
        <div className="flex items-center flex-wrap gap-1 mt-0.5">
          <RolePicker roles={roles} value={item.roleId} onChange={(roleId) => onChange({ roleId })} muted={item.done} />
          <PersonPicker teamMembers={teamMembers} value={item.personId} onChange={(personId) => onChange({ personId })} />
          {(() => {
            const missing = item.minutes == null || item.minutes === '';
            return (
              <span
                className={`shrink-0 inline-flex items-center gap-0.5 rounded px-1 py-0.5 border ${missing ? 'border-red bg-red-bg' : 'border-border-light bg-surface2'}`}
                title={missing ? 'Falta cargar el tiempo (obligatorio, en minutos)' : (item.time ? `Estimación original: ${item.time}` : 'Minutos')}
              >
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={item.minutes ?? ''}
                  placeholder="—"
                  onChange={(e) => onChange({ minutes: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`w-9 bg-transparent outline-none text-[9.5px] text-right ${missing ? 'text-red placeholder:text-red' : 'text-text2'}`}
                />
                <span className={`text-[8.5px] ${missing ? 'text-red' : 'text-text3'}`}>min</span>
              </span>
            );
          })()}
        </div>
      </div>

      <div className="flex flex-col items-center gap-0.5 opacity-0 group-hover/i:opacity-100 shrink-0 mt-0.5">
        <div className="flex flex-col">
          <button type="button" disabled={!canUp} onClick={() => onMove(-1)} onPointerDown={(e) => e.stopPropagation()} className="text-text3 hover:text-purple disabled:opacity-20 disabled:hover:text-text3 cursor-pointer leading-none" title="Subir"><ChevronUp size={12} /></button>
          <button type="button" disabled={!canDown} onClick={() => onMove(1)} onPointerDown={(e) => e.stopPropagation()} className="text-text3 hover:text-purple disabled:opacity-20 disabled:hover:text-text3 cursor-pointer leading-none" title="Bajar"><ChevronDown size={12} /></button>
        </div>
        <button type="button" onClick={() => onDelete()} onPointerDown={(e) => e.stopPropagation()} className="text-text3 hover:text-red cursor-pointer" title="Borrar ítem"><X size={13} /></button>
      </div>
    </div>
  );
}
