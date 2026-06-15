import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { DEPARTMENTS, DEPARTMENT_ORDER } from '../../utils/constants';

// Ícono SVG de un área (mismo path/color que el diseño).
function AreaIcon({ dept, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={dept ? dept.color : '#9CA3AF'} strokeWidth="1.9" style={{ flexShrink: 0 }}>
      <path d={dept ? dept.path : 'M12 5v14M5 12h14'} />
    </svg>
  );
}

// Selector de área. variant='icon' muestra solo el ícono (filas/tarjetas);
// variant='chip' muestra ícono + label + chevron (ficha). El popover usa
// position:fixed para no quedar recortado por contenedores con overflow.
export default function DepartmentPicker({ value, onChange, variant = 'icon' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const dept = value ? DEPARTMENTS[value] : null;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-area-popover]')) return;
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
      const w = 196, h = 210, margin = 4;
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
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}>
      {variant === 'chip' ? (
        <span ref={btnRef} onClick={() => setOpen(v => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', border: '1px solid #E2E5EB', borderRadius: 8, padding: '4px 9px' }}>
          <AreaIcon dept={dept} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1D26' }}>{dept ? dept.label : 'Sin área'}</span>
          <ChevronDown size={13} stroke="#9CA3AF" />
        </span>
      ) : (
        <button ref={btnRef} type="button" onClick={() => setOpen(v => !v)} title={dept ? `Área: ${dept.label}` : 'Asignar área'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
          <AreaIcon dept={dept} />
        </button>
      )}

      {open && pos && (
        <div data-area-popover
          style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, zIndex: 1000, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 10, boxShadow: '0 12px 32px rgba(10,22,40,.16)', padding: 6 }}>
          {DEPARTMENT_ORDER.map(key => {
            const d = DEPARTMENTS[key];
            const active = value === key;
            return (
              <div key={key} onClick={() => { onChange(active ? null : key); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', background: active ? '#F5F7FF' : 'transparent' }}>
                <AreaIcon dept={d} size={16} />
                <span style={{ flex: 1, fontSize: 13, color: '#1A1D26' }}>{d.label}</span>
                {active && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5B7CF5" strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
