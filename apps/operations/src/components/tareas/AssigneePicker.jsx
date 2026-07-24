import { useState, useRef, useEffect } from 'react';
import { UserPlus, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';

// Avatar (foto o iniciales) clickeable que abre un popover para reasignar la
// tarea sin abrir la ficha. Popover en position:fixed para no quedar recortado.
function memberFromName(members, name) {
  const first = String(name || '').split(',')[0]?.trim().toLowerCase();
  if (!first) return null;
  return (members || []).find(m => m.name?.toLowerCase() === first || m.name?.toLowerCase().split(' ')[0] === first) || null;
}

function Av({ m, size = 24 }) {
  const s = { width: size, height: size, borderRadius: '50%', flexShrink: 0 };
  if (m?.avatar || m?.avatar_url) return <img src={m.avatar || m.avatar_url} alt={m.name} style={{ ...s, objectFit: 'cover' }} />;
  return <span style={{ ...s, background: m?.color || '#9CA3AF', color: '#fff', fontSize: size * 0.4, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(m?.initials || m?.name?.slice(0, 2) || '?').toUpperCase()}</span>;
}

// `cliente` (opcional): { name, active, onSelect } — permite asignar la tarea AL
// CLIENTE: aparece como opción arriba de la lista y, elegida, la tarea se ve en
// la home de SU portal (tasks.asignada_cliente). Elegir a alguien del equipo la
// devuelve al equipo (y desaparece del portal).
export default function AssigneePicker({ value, onChange, size = 24, cliente = null }) {
  const { teamMembers } = useApp();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const cur = memberFromName(teamMembers, value);
  const esCliente = !!cliente?.active;
  const clienteIni = (cliente?.name || 'CL').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && ref.current.contains(e.target)) return; if (e.target.closest && e.target.closest('[data-assignee-popover]')) return; setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = 220, hgt = 300, margin = 4;
      let left = r.right - w; if (left < 8) left = 8; if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      let top = r.bottom + margin; if (top + hgt > window.innerHeight - 8) top = Math.max(8, r.top - hgt - margin);
      setPos({ left, top, width: w });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }} onClick={(e) => e.stopPropagation()}>
      <span ref={btnRef} onClick={() => setOpen(v => !v)} title={esCliente ? `La hace el cliente: ${cliente.name} (la ve en su portal)` : cur ? `Responsable: ${cur.name}` : 'Asignar responsable'} style={{ cursor: 'pointer', display: 'inline-flex' }}>
        {esCliente
          ? <span style={{ width: size, height: size, borderRadius: '50%', background: '#059669', color: '#fff', fontSize: size * 0.38, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 0 2px #A7F3D0' }}>{clienteIni}</span>
          : cur
            ? <Av m={cur} size={size} />
            : <span style={{ width: size, height: size, borderRadius: '50%', border: '1.5px dashed #CBD0D8', color: '#B6B9C0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><UserPlus size={size * 0.55} /></span>}
      </span>
      {open && pos && (
        <div data-assignee-popover style={{ position: 'fixed', left: pos.left, top: pos.top, width: pos.width, maxHeight: 300, overflowY: 'auto', zIndex: 1000, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 10, boxShadow: '0 12px 32px rgba(10,22,40,.16)', padding: 6 }}>
          <div onClick={() => { onChange(''); if (esCliente) cliente?.onSelect?.(false); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', background: !cur && !esCliente ? '#F5F7FF' : 'transparent' }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', border: '1.5px dashed #CBD0D8', color: '#B6B9C0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><UserPlus size={13} /></span>
            <span style={{ flex: 1, fontSize: 13, color: '#6B7280' }}>Sin asignar</span>
            {!cur && !esCliente && <Check size={15} stroke="#5B7CF5" strokeWidth={2.2} />}
          </div>
          {/* El CLIENTE como asignado: la tarea es de él y aparece en la home de su portal. */}
          {cliente && (
            <div onClick={() => { cliente.onSelect?.(true); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', background: esCliente ? '#ECFDF5' : 'transparent', borderBottom: '1px solid #F0F2F5', marginBottom: 2 }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#059669', color: '#fff', fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{clienteIni}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#065F46', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Cliente · {cliente.name}</span>
              {esCliente ? <Check size={15} stroke="#059669" strokeWidth={2.2} /> : <span style={{ fontSize: 9, fontWeight: 800, color: '#059669', background: '#D1FAE5', borderRadius: 999, padding: '2px 6px', flexShrink: 0 }}>PORTAL</span>}
            </div>
          )}
          {(teamMembers || []).map(m => {
            const active = !esCliente && cur?.id === m.id;
            return (
              <div key={m.id} onClick={() => { onChange(m.name); if (esCliente) cliente?.onSelect?.(false); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', background: active ? '#F5F7FF' : 'transparent' }}>
                <Av m={m} size={24} />
                <span style={{ flex: 1, fontSize: 13, color: '#1A1D26', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                {active && <Check size={15} stroke="#5B7CF5" strokeWidth={2.2} />}
              </div>
            );
          })}
        </div>
      )}
    </span>
  );
}
