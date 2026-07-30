// DecisionCard — casuística «si pasa esto → hacé esto» (portada del CRM v3).
// Editable: condición, si sigue el flujo o no, demora, y la cadena de pasos
// (acción / escalada / email / pregunta). Se arrastra por la cabecera.

import { memo, useRef, useState } from 'react';
import { Trash2, GripVertical, Plus, X, GitBranch } from 'lucide-react';

const DELAY = {
  d0:   { bg: 'var(--color-green-bg)',  fg: 'var(--color-green)',  next: 'dwarn' },
  dwarn:{ bg: 'var(--color-yellow-bg)', fg: '#B45309',             next: 'dbad'  },
  dbad: { bg: 'var(--color-red-bg)',    fg: 'var(--color-red)',    next: 'd0'    },
};

// Tipos de línea de la cadena. El icono se cicla al hacerle clic.
const LINE = {
  action: { icon: '↳', color: 'var(--color-text2)', next: 'esc' },
  esc:    { icon: '⚠', color: 'var(--color-red)',   next: 'mail' },
  mail:   { icon: '✉', color: 'var(--color-blue)',  next: 'q' },
  q:      { icon: '?', color: 'var(--color-purple)', next: 'action' },
};

function AutoInput({ value, onChange, placeholder, className, style }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className={className}
      style={style}
    />
  );
}

function DecisionCard({ node, scale, actions, onStartLink }) {
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('input, textarea, button')) return;
    drag.current = { px: e.clientX, py: e.clientY, x: node.x, y: node.y };
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.stopPropagation();
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const dx = (e.clientX - drag.current.px) / scale;
    const dy = (e.clientY - drag.current.py) / scale;
    actions.moveNode(node.id, Math.round(drag.current.x + dx), Math.round(drag.current.y + dy));
  };
  const onPointerUp = (e) => { drag.current = null; setDragging(false); e.currentTarget.releasePointerCapture?.(e.pointerId); };

  const branches = node.branches || [];

  return (
    <div
      data-journey-card={node.id}
      className="absolute rounded-xl bg-surface border shadow-sm w-[420px]"
      style={{ left: node.x, top: node.y, borderColor: 'var(--color-purple)', borderLeft: '4px solid var(--color-purple)', boxShadow: dragging ? '0 10px 28px rgba(26,29,38,.20)' : undefined }}
    >
      {/* Cabecera */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border rounded-t-xl"
        style={{ cursor: dragging ? 'grabbing' : 'grab', background: 'var(--color-purple-bg)' }}
      >
        <GripVertical size={13} className="text-text3 shrink-0" />
        <GitBranch size={13} className="shrink-0 text-purple" />
        <input
          value={node.title}
          onChange={(e) => actions.updateNode(node.id, { title: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="Casuística"
          className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] font-bold text-purple placeholder:text-text3"
        />
        <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-purple bg-purple-bg rounded px-1 py-0.5">si pasa esto → hacé esto</span>
        <button type="button" onClick={() => { if (confirm('¿Borrar esta casuística?')) actions.deleteNode(node.id); }} onPointerDown={(e) => e.stopPropagation()} className="shrink-0 text-text3 hover:text-red cursor-pointer" title="Borrar"><Trash2 size={13} /></button>
      </div>

      {/* Ramas */}
      <div className="p-2 space-y-2">
        {branches.map((b) => {
          const dk = DELAY[b.delayKind] || DELAY.dwarn;
          return (
            <div key={b.id} className="rounded-lg border border-border/70 p-1.5" style={{ borderLeft: `3px solid ${b.ok ? 'var(--color-green)' : 'var(--color-red)'}` }}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => actions.updateBranch(node.id, b.id, { ok: !b.ok })}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="shrink-0 text-[10px] font-bold rounded-full px-2 py-0.5 cursor-pointer border"
                  style={b.ok
                    ? { color: 'var(--color-green)', background: 'var(--color-green-bg)', borderColor: 'var(--color-green)' }
                    : { color: 'var(--color-red)', background: 'var(--color-red-bg)', borderColor: 'var(--color-red)' }}
                  title="Cambiar entre «sigue el flujo» / «se desvía»"
                >
                  {b.ok ? '✓ sigue' : '✗ desvía'}
                </button>
                <AutoInput
                  value={b.cond}
                  onChange={(v) => actions.updateBranch(node.id, b.id, { cond: v })}
                  placeholder="Si pasa…"
                  className="flex-1 min-w-[120px] bg-transparent outline-none text-[11.5px] font-semibold text-text placeholder:text-text3"
                />
                <button type="button" onClick={() => actions.deleteBranch(node.id, b.id)} onPointerDown={(e) => e.stopPropagation()} className="shrink-0 text-text3 hover:text-red cursor-pointer" title="Borrar rama"><X size={13} /></button>
              </div>

              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => actions.updateBranch(node.id, b.id, { delayKind: dk.next })}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="shrink-0 text-[9.5px] font-bold rounded px-1.5 py-0.5 cursor-pointer"
                  style={{ background: dk.bg, color: dk.fg }}
                  title="Cambiar el color de la demora"
                >⏱</button>
                <AutoInput
                  value={b.delayText}
                  onChange={(v) => actions.updateBranch(node.id, b.id, { delayText: v })}
                  placeholder="demora / impacto"
                  className="flex-1 min-w-[100px] bg-transparent outline-none text-[10px] placeholder:text-text3"
                  style={{ color: dk.fg }}
                />
                {b.ok && <span className="text-[9.5px] font-bold text-green shrink-0">→ sigue el flujo</span>}
              </div>

              {/* Cadena de pasos */}
              {(b.chain || []).length > 0 && (
                <div className="mt-1.5 pl-1 space-y-1">
                  {b.chain.map((l) => {
                    const lt = LINE[l.type] || LINE.action;
                    return (
                      <div key={l.id} className="group/l flex items-start gap-1.5">
                        <button type="button" onClick={() => actions.updateChainLine(node.id, b.id, l.id, { type: lt.next })} onPointerDown={(e) => e.stopPropagation()} className="shrink-0 w-4 text-center text-[11px] font-bold cursor-pointer leading-tight mt-0.5" style={{ color: lt.color }} title="Cambiar tipo (acción / escalada / email / pregunta)">{lt.icon}</button>
                        <AutoInput
                          value={l.text}
                          onChange={(v) => actions.updateChainLine(node.id, b.id, l.id, { text: v })}
                          placeholder="paso…"
                          className="flex-1 min-w-0 bg-transparent outline-none text-[10.5px] leading-snug placeholder:text-text3"
                          style={{ color: lt.color }}
                        />
                        <button type="button" onClick={() => actions.deleteChainLine(node.id, b.id, l.id)} onPointerDown={(e) => e.stopPropagation()} className="opacity-0 group-hover/l:opacity-100 text-text3 hover:text-red shrink-0 cursor-pointer mt-0.5"><X size={11} /></button>
                      </div>
                    );
                  })}
                </div>
              )}

              <button type="button" onClick={() => actions.addChainLine(node.id, b.id, 'action')} onPointerDown={(e) => e.stopPropagation()} className="mt-1 flex items-center gap-1 text-[9.5px] font-medium text-text3 hover:text-purple cursor-pointer"><Plus size={10} /> paso</button>
            </div>
          );
        })}

        <button type="button" onClick={() => actions.addBranch(node.id)} onPointerDown={(e) => e.stopPropagation()} className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10.5px] font-medium text-text3 hover:text-purple border border-dashed border-border rounded-lg cursor-pointer"><Plus size={12} /> Agregar rama</button>
      </div>

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

export default memo(DecisionCard);
