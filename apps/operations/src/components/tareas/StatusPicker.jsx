import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { SPRINT_COLUMNS, TASK_STATUS } from '../../utils/constants';

// Estados que ofrecemos (las 5 columnas del Kanban + Bloqueada).
const OPTIONS = [
  ...SPRINT_COLUMNS.map(c => ({ status: c.status, label: c.label, color: c.tx })),
  { status: 'blocked', label: 'Bloqueada', color: '#DC2626' },
];
const metaFor = (status) => {
  const col = SPRINT_COLUMNS.find(c => c.status === status);
  if (col) return { label: col.label, color: col.tx };
  const st = TASK_STATUS[status];
  if (st) return { label: st.label.charAt(0) + st.label.slice(1).toLowerCase(), color: st.color };
  return { label: '—', color: '#9CA3AF' };
};

// Badge clickeable con el estado/columna del Kanban; abre un popover (fixed,
// sin recortes) para cambiarlo.
export default function StatusPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const meta = metaFor(value);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && ref.current.contains(e.target)) return; if (e.target.closest && e.target.closest('[data-status-popover]')) return; setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 170, hgt = 240, margin = 4;
      let left = r.left; if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8; if (left < 8) left = 8;
      let top = r.bottom + margin; if (top + hgt > window.innerHeight - 8) top = Math.max(8, r.top - hgt - margin);
      setPos({ left, top, width: w });
    };
    place();
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
      <span ref={btnRef} onClick={() => setOpen(v => !v)} title="Cambiar estado"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: meta.color, background: meta.color + '1A', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {meta.label}<ChevronDown size={11} />
      </span>
      {open && pos && (
        <div data-status-popover style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, zIndex: 1000, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 10, boxShadow: '0 12px 32px rgba(10,22,40,.16)', padding: 6 }}>
          {OPTIONS.map(o => {
            const active = value === o.status;
            return (
              <div key={o.status} onClick={() => { onChange(o.status); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', background: active ? '#F5F7FF' : 'transparent' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: o.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: '#1A1D26' }}>{o.label}</span>
                {active && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5B7CF5" strokeWidth="2.2"><path d="M20 6 9 17l-5-5" /></svg>}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
