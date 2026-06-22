import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Flag } from 'lucide-react';
import { TASK_PRIORITY, TASK_PRIORITY_ORDER } from '../../utils/constants';

// Selector de prioridad de tarea (súper alta / alta / media / baja).
// variant='pill'  → píldora compacta (filas de Objetivos y tarjetas del Kanban).
// variant='chip'  → chip con label + chevron (ficha de la tarea).
// El popover usa position:fixed para no quedar recortado por contenedores con
// overflow (mismo patrón que DepartmentPicker).
export default function PriorityPicker({ value, onChange, variant = 'pill' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const prio = value ? TASK_PRIORITY[value] : null;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-prio-popover]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 188, h = 230, margin = 4;
      let left = r.right - w;
      if (left < 8) left = 8;
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      let top = r.bottom + margin;
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - margin);
      setPos({ left, top, width: w });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      {variant === 'chip' ? (
        <span ref={btnRef} onClick={() => setOpen(v => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', border: '1px solid #E2E5EB', borderRadius: 8, padding: '4px 9px', background: prio ? prio.bg : '#fff' }}>
          <Flag size={13} fill={prio ? prio.color : 'none'} stroke={prio ? prio.color : '#9CA3AF'} />
          <span style={{ fontSize: 13, fontWeight: 600, color: prio ? prio.color : '#9CA3AF' }}>{prio ? prio.label : 'Sin prioridad'}</span>
          <ChevronDown size={13} stroke="#9CA3AF" />
        </span>
      ) : prio ? (
        <span ref={btnRef} onClick={() => setOpen(v => !v)} title={`Prioridad: ${prio.label}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', borderRadius: 6, padding: '2px 7px', background: prio.bg, color: prio.color, fontSize: 10.5, fontWeight: 700, lineHeight: 1.4, whiteSpace: 'nowrap' }}>
          <Flag size={10} fill={prio.color} stroke={prio.color} />{prio.short}
        </span>
      ) : (
        <button ref={btnRef} type="button" onClick={() => setOpen(v => !v)} title="Asignar prioridad"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
          <Flag size={14} stroke="#C7CBD3" />
        </button>
      )}

      {open && pos && (
        <div data-prio-popover
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, zIndex: 1000, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 10, boxShadow: '0 12px 32px rgba(10,22,40,.16)', padding: 6 }}>
          {TASK_PRIORITY_ORDER.map(key => {
            const p = TASK_PRIORITY[key];
            const active = value === key;
            return (
              <div key={key} onClick={() => { onChange(active ? null : key); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', background: active ? '#F5F7FF' : 'transparent' }}>
                <Flag size={15} fill={p.color} stroke={p.color} />
                <span style={{ flex: 1, fontSize: 13, color: '#1A1D26' }}>{p.label}</span>
                {active && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5B7CF5" strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>}
              </div>
            );
          })}
          <div onClick={() => { onChange(null); setOpen(false); }}
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', borderTop: '1px solid #F0F2F5', marginTop: 4 }}>
            <Flag size={15} stroke="#9CA3AF" />
            <span style={{ flex: 1, fontSize: 13, color: '#9CA3AF' }}>Sin prioridad</span>
          </div>
        </div>
      )}
    </div>
  );
}
