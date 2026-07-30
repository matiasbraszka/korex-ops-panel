// JourneyCard — tarjeta libre del lienzo con título editable y checklist.
// Se arrastra por la cabecera; el cuerpo edita los ítems.

import { memo, useRef, useState } from 'react';
import { Plus, Trash2, GripVertical, Diamond, Zap } from 'lucide-react';
import ChecklistItem from './ChecklistItem';
import { LANES, formatMinutes } from './journeyData';

const LANE_KEYS = ['A', 'B', 'C', 'D', 'G'];

function laneColor(lane) {
  return (LANES[lane] || LANES.A).color;
}

function LanePicker({ lane, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onPointerDown={(e) => e.stopPropagation()}
        className="w-3 h-3 rounded-full border border-white/40 cursor-pointer"
        style={{ background: laneColor(lane) }}
        title={`Carril: ${(LANES[lane] || {}).label || '—'}`}
      />
      {open && (
        <>
          <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} onPointerDown={(e) => e.stopPropagation()} className="fixed inset-0 z-40 bg-transparent border-none cursor-default" />
          <div onPointerDown={(e) => e.stopPropagation()} className="absolute z-50 mt-1 left-0 w-40 bg-surface border border-border rounded-lg shadow-lg p-1">
            {LANE_KEYS.map((k) => (
              <button key={k} type="button" onClick={() => { onChange(k); setOpen(false); }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[12px] text-left hover:bg-surface2 cursor-pointer ${k === lane ? 'bg-surface2' : ''}`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: LANES[k].color }} />
                <span className="text-text truncate">{LANES[k].label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function JourneyCard({ node, roles, teamMembers, scale, actions, onStartLink }) {
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  const isGate = node.kind === 'gate';
  const accent = isGate ? '#FBBF24' : laneColor(node.lane);
  const highlight = node.kind === 'crit';

  const onHeaderPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('input, textarea, button')) return; // no arrastrar desde controles
    drag.current = { px: e.clientX, py: e.clientY, x: node.x, y: node.y };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.stopPropagation();
  };
  const onHeaderPointerMove = (e) => {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.px) / scale;
    const dy = (e.clientY - drag.current.py) / scale;
    actions.moveNode(node.id, Math.round(drag.current.x + dx), Math.round(drag.current.y + dy));
  };
  const onHeaderPointerUp = (e) => {
    drag.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      data-journey-card={node.id}
      className="absolute rounded-xl bg-surface border shadow-sm"
      style={{
        left: node.x, top: node.y, width: 330,
        borderColor: highlight ? 'var(--color-red)' : 'var(--color-border)',
        borderLeft: `4px solid ${accent}`,
        boxShadow: dragging ? '0 10px 28px rgba(26,29,38,.20)' : undefined,
      }}
    >
      {/* Cabecera (zona de arrastre) */}
      <div
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border rounded-t-xl"
        style={{ cursor: dragging ? 'grabbing' : 'grab', background: isGate ? '#FEF9EC' : 'var(--color-surface)' }}
      >
        <GripVertical size={13} className="text-text3 shrink-0" />
        <LanePicker lane={node.lane} onChange={(lane) => actions.updateNode(node.id, { lane })} />
        {isGate && <Diamond size={12} className="shrink-0" style={{ color: accent }} fill={accent} />}
        {node.kind === 'flash' && <Zap size={12} className="shrink-0 text-yellow" />}
        <input
          value={node.title}
          onChange={(e) => actions.updateNode(node.id, { title: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="Título de la tarjeta"
          className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] font-bold text-text placeholder:text-text3"
        />
        {node.kind === 'crit' && <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-red bg-red-bg rounded px-1 py-0.5">crítico</span>}
        <button type="button" onClick={() => { if (confirm('¿Borrar esta tarjeta?')) actions.deleteNode(node.id); }} onPointerDown={(e) => e.stopPropagation()} className="shrink-0 text-text3 hover:text-red cursor-pointer" title="Borrar tarjeta"><Trash2 size={13} /></button>
      </div>

      {isGate && node.subtitle && (
        <div className="px-2.5 py-1.5 text-[10px] text-text2 bg-yellow-bg/50 border-b border-border">{node.subtitle}</div>
      )}

      {/* Checklist */}
      <div>
        {node.items.map((it, idx) => (
          <ChecklistItem
            key={it.id}
            item={it}
            roles={roles}
            teamMembers={teamMembers}
            canUp={idx > 0}
            canDown={idx < node.items.length - 1}
            onChange={(patch) => actions.updateItem(node.id, it.id, patch)}
            onDelete={() => actions.deleteItem(node.id, it.id)}
            onToggle={() => actions.toggleItem(node.id, it.id)}
            onMove={(dir) => actions.moveItem(node.id, it.id, dir)}
          />
        ))}
      </div>

      {isGate && node.note && (
        <div className="mx-2.5 my-2 text-[9.5px] leading-snug text-text2 bg-yellow-bg border border-dashed border-yellow/50 rounded-md px-2 py-1.5">{node.note}</div>
      )}

      {/* Total de tiempo de la tarjeta + agregar ítem */}
      {(() => {
        const total = node.items.reduce((a, it) => a + (Number.isFinite(it.minutes) ? it.minutes : 0), 0);
        const missing = node.items.filter((it) => it.minutes == null || it.minutes === '').length;
        return (
          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-t border-border rounded-b-xl">
            <span className="text-[10px] font-semibold text-text2 inline-flex items-center gap-1">
              ⏱ {formatMinutes(total)}
              {missing > 0 && <span className="text-red font-medium">· {missing} sin tiempo</span>}
            </span>
            <button
              type="button"
              onClick={() => actions.addItem(node.id)}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-[10.5px] font-medium text-text3 hover:text-purple cursor-pointer"
            >
              <Plus size={12} /> Ítem
            </button>
          </div>
        );
      })()}

      {/* Manija para tirar una flecha hacia otra tarjeta */}
      {onStartLink && (
        <button
          type="button"
          title="Arrastrá hasta otra tarjeta para unirlas"
          onPointerDown={(e) => { e.stopPropagation(); onStartLink(node.id, e); }}
          className="absolute top-1/2 -right-2.5 -translate-y-1/2 w-4 h-4 rounded-full bg-purple border-2 border-white shadow cursor-crosshair opacity-40 hover:opacity-100"
        />
      )}
    </div>
  );
}

// Solo se re-dibuja la tarjeta cuyo nodo cambió (no las 50+ al mover una).
export default memo(JourneyCard);
