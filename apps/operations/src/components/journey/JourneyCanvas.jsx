// JourneyCanvas — viewport de lienzo infinito (pan + zoom) tipo Miro.
//
// Maneja la transformación translate/scale del "mundo", dibuja las flechas
// (conexiones) entre tarjetas y renderiza las tarjetas y casuísticas. El
// arrastre del fondo hace pan; la rueda hace zoom; se pueden crear uniones
// arrastrando desde la manija de una tarjeta hasta otra.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Plus, Minus, Maximize2, X } from 'lucide-react';
import JourneyCard from './JourneyCard';
import DecisionCard from './DecisionCard';
import { estimateNodeSize, LANE_BANDS } from './journeyData';

const WORLD_W = 20000;
const WORLD_H = 12000;
const MIN_SCALE = 0.12;
const MAX_SCALE = 2.2;

const CONN_COLOR = { flow: '#94A3B8', crit: '#F87171', gate: '#FBBF24', branch: '#C084FC' };

function nodeBox(n) {
  const { w, h } = estimateNodeSize(n);
  return { x: n.x, y: n.y, w, h };
}

// Puntos de anclaje entre dos tarjetas (borde a borde, según posición relativa).
function anchors(from, to) {
  const a = nodeBox(from), b = nodeBox(to);
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = bc.x - ac.x, dy = bc.y - ac.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const s = dx >= 0 ? 1 : -1;
    const p1 = { x: s > 0 ? a.x + a.w : a.x, y: ac.y };
    const p2 = { x: s > 0 ? b.x : b.x + b.w, y: bc.y };
    return { p1, p2, horiz: true, s };
  }
  const s = dy >= 0 ? 1 : -1;
  const p1 = { x: ac.x, y: s > 0 ? a.y + a.h : a.y };
  const p2 = { x: bc.x, y: s > 0 ? b.y : b.y + b.h };
  return { p1, p2, horiz: false, s };
}

function pathD(p1, p2, horiz, s) {
  if (horiz) {
    const c = Math.max(40, Math.abs(p2.x - p1.x) / 2);
    return `M ${p1.x} ${p1.y} C ${p1.x + s * c} ${p1.y}, ${p2.x - s * c} ${p2.y}, ${p2.x} ${p2.y}`;
  }
  const c = Math.max(40, Math.abs(p2.y - p1.y) / 2);
  return `M ${p1.x} ${p1.y} C ${p1.x} ${p1.y + s * c}, ${p2.x} ${p2.y - s * c}, ${p2.x} ${p2.y}`;
}

const JourneyCanvas = forwardRef(function JourneyCanvas(props, ref) {
  const { board, roles, teamMembers, connections, actions } = props;
  const vpRef = useRef(null);
  const [view, setView] = useState({ scale: 0.55, tx: 40, ty: 40 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const pan = useRef(null);
  const [selConn, setSelConn] = useState(null);
  const [linking, setLinking] = useState(null); // { fromId, x, y, pointerId }
  const linkRef = useRef(null);

  const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  const toWorld = (clientX, clientY) => {
    const r = vpRef.current.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.tx) / v.scale, y: (clientY - r.top - v.ty) / v.scale };
  };

  const zoomAt = useCallbackSafe((cx, cy, factor) => {
    setView((v) => {
      const ns = clampScale(v.scale * factor);
      const k = ns / v.scale;
      return { scale: ns, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  });

  const fitView = useCallbackSafe(() => {
    const nodes = board?.nodes || [];
    const vp = vpRef.current;
    if (!nodes.length || !vp) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const { w, h } = estimateNodeSize(n);
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w); maxY = Math.max(maxY, n.y + h);
    }
    const pad = 80;
    const topInset = 60; // deja lugar arriba para la franja fija de días
    const cw = maxX - minX + pad * 2, ch = maxY - minY + pad * 2;
    const r = vp.getBoundingClientRect();
    const availH = r.height - topInset;
    const scale = clampScale(Math.min(r.width / cw, availH / ch, 1.2));
    const tx = (r.width - (maxX - minX) * scale) / 2 - (minX - pad) * scale;
    const ty = topInset + (availH - (maxY - minY) * scale) / 2 - (minY - pad) * scale;
    setView({ scale, tx, ty });
  });

  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current) return;
    if (board?.nodes?.length) { fitView(); didFit.current = true; }
  }, [board, fitView]);

  const zoomIn = useCallbackSafe(() => { const r = vpRef.current.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1.2); });
  const zoomOut = useCallbackSafe(() => { const r = vpRef.current.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, 1 / 1.2); });

  useImperativeHandle(ref, () => ({
    fitView, zoomIn, zoomOut,
    centerWorld: () => {
      const r = vpRef.current.getBoundingClientRect();
      const v = viewRef.current;
      return { x: (r.width / 2 - v.tx) / v.scale, y: (r.height / 2 - v.ty) / v.scale };
    },
  }), [fitView, zoomIn, zoomOut]);

  // ── Crear unión (linking) desde la manija de una tarjeta ──────────────────
  // Identidad estable: así el memo de las tarjetas no se rompe en cada render.
  const startLink = useCallbackSafe((fromId, e) => {
    const w = toWorld(e.clientX, e.clientY);
    const st = { fromId, x: w.x, y: w.y, pointerId: e.pointerId };
    linkRef.current = st;
    setLinking(st);
    vpRef.current.setPointerCapture?.(e.pointerId);
  });

  // ── Pan / linking ─────────────────────────────────────────────────────────
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('[data-journey-card], [data-conn], button, input, textarea')) return;
    setSelConn(null);
    pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    vpRef.current.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (linkRef.current) {
      const w = toWorld(e.clientX, e.clientY);
      const next = { ...linkRef.current, x: w.x, y: w.y };
      linkRef.current = next; setLinking(next);
      return;
    }
    // Capturamos el estado del paneo ANTES de actualizar (no leemos el ref
    // dentro del updater: podría anularse al soltar y romper el render).
    const p = pan.current;
    if (!p) return;
    const nx = p.tx + (e.clientX - p.x);
    const ny = p.ty + (e.clientY - p.y);
    setView((v) => ({ ...v, tx: nx, ty: ny }));
  };
  const onPointerUp = (e) => {
    if (linkRef.current) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const card = el?.closest?.('[data-journey-card]');
      const toId = card?.getAttribute('data-journey-card');
      if (toId) actions.addConnection(linkRef.current.fromId, toId);
      linkRef.current = null; setLinking(null);
      vpRef.current.releasePointerCapture?.(e.pointerId);
      return;
    }
    pan.current = null;
    vpRef.current.releasePointerCapture?.(e.pointerId);
  };

  const onWheel = (e) => {
    e.preventDefault();
    const r = vpRef.current.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  const nodeById = {};
  let contentLeft = 60, contentRight = 1200;
  (board?.nodes || []).forEach((n) => {
    nodeById[n.id] = n;
    const { w } = estimateNodeSize(n);
    contentLeft = Math.min(contentLeft, n.x);
    contentRight = Math.max(contentRight, n.x + w);
  });
  const bandLeft = contentLeft - 40;
  const bandWidth = contentRight - bandLeft + 120;
  const PHASE_X0 = 60, PHASE_COL_W = 460;
  const worldBottom = Math.max(...LANE_BANDS.map((b) => b.y + b.h));
  const phases = board?.phases || [];
  const phaseX = (ph, i) => (ph.x != null ? ph.x : PHASE_X0 + i * PHASE_COL_W);
  const conns = (connections || []).map((c) => {
    const from = nodeById[c.from], to = nodeById[c.to];
    if (!from || !to) return null;
    const { p1, p2, horiz, s } = anchors(from, to);
    return { ...c, d: pathD(p1, p2, horiz, s), mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
  }).filter(Boolean);

  // Línea temporal mientras se arrastra una unión.
  let linkPath = null;
  if (linking && nodeById[linking.fromId]) {
    const a = nodeBox(nodeById[linking.fromId]);
    linkPath = `M ${a.x + a.w} ${a.y + a.h / 2} L ${linking.x} ${linking.y}`;
  }

  return (
    <div
      ref={vpRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={(e) => { if (!e.target.closest('[data-journey-card]')) fitView(); }}
      className="relative w-full h-full overflow-hidden select-none touch-none"
      style={{ cursor: pan.current ? 'grabbing' : (linking ? 'crosshair' : 'grab'), background: 'var(--color-bg)' }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: WORLD_W, height: WORLD_H,
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          backgroundImage: 'radial-gradient(var(--color-border-light) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      >
        {/* Bandas de carril (detrás de todo) */}
        {LANE_BANDS.map((b) => (
          <div
            key={b.key}
            className="absolute rounded-2xl"
            style={{ left: bandLeft, top: b.y, width: bandWidth, height: b.h, background: b.color + '12', borderLeft: `4px solid ${b.color}`, pointerEvents: 'none' }}
          />
        ))}

        {/* Separadores verticales de fase (columnas de tiempo) — scrollean con el contenido */}
        {phases.map((ph, i) => (
          <div key={'sep-' + ph.id} className="absolute" style={{ left: phaseX(ph, i) - 16, top: -6, height: worldBottom + 30, borderLeft: '2px dashed var(--color-border)', pointerEvents: 'none' }} />
        ))}

        {/* Flechas / uniones */}
        <svg width={WORLD_W} height={WORLD_H} className="absolute top-0 left-0" style={{ overflow: 'visible', pointerEvents: 'none' }}>
          <defs>
            {Object.entries(CONN_COLOR).map(([k, col]) => (
              <marker key={k} id={`arr-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 L10 5 L0 10 z" fill={col} />
              </marker>
            ))}
          </defs>
          {conns.map((c) => {
            const col = CONN_COLOR[c.kind] || CONN_COLOR.flow;
            const sel = selConn === c.id;
            return (
              <g key={c.id}>
                {/* hit area invisible para poder seleccionar/borrar */}
                <path d={c.d} data-conn={c.id} onClick={() => setSelConn(c.id)} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} />
                <path d={c.d} fill="none" stroke={col} strokeWidth={sel ? 3.5 : 2} strokeDasharray={c.kind === 'branch' ? '6 5' : 'none'} markerEnd={`url(#arr-${c.kind})`} style={{ pointerEvents: 'none' }} />
              </g>
            );
          })}
          {linkPath && <path d={linkPath} fill="none" stroke="#C084FC" strokeWidth={2} strokeDasharray="5 5" style={{ pointerEvents: 'none' }} />}
        </svg>

        {/* Botón borrar de la unión seleccionada */}
        {selConn && (() => {
          const c = conns.find((x) => x.id === selConn);
          if (!c) return null;
          return (
            <button
              onClick={() => { actions.deleteConnection(c.id); setSelConn(null); }}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute z-20 w-6 h-6 rounded-full bg-red text-white grid place-items-center shadow-md cursor-pointer border-2 border-white"
              style={{ left: c.mid.x - 12, top: c.mid.y - 12 }}
              title="Borrar unión"
            >
              <X size={13} />
            </button>
          );
        })()}

        {/* Tarjetas */}
        {(board?.nodes || []).map((node) => (
          node.nodeType === 'decision' ? (
            <DecisionCard key={node.id} node={node} scale={view.scale} actions={actions} onStartLink={startLink} />
          ) : (
            <JourneyCard key={node.id} node={node} roles={roles} teamMembers={teamMembers} scale={view.scale} actions={actions} onStartLink={startLink} />
          )
        ))}
      </div>

      {/* Encabezados de fase FIJOS arriba (línea de tiempo): siguen las columnas
          al moverte de lado, pero NO se van al bajar. Editables. */}
      <div className="absolute inset-x-0 top-0 h-[52px] z-20 overflow-hidden">
        <div className="absolute inset-0 bg-bg/85 border-b border-border backdrop-blur-sm pointer-events-none" />
        {phases.map((ph, i) => {
          const left = view.tx + phaseX(ph, i) * view.scale;
          const w = PHASE_COL_W * view.scale - 14;
          if (left + w < 2 || left > (vpRef.current?.clientWidth || 9999)) return null;
          const isGate = ph.gate ?? /gate/i.test(ph.t || '');
          const isRes = ph.res ?? /resultado/i.test(ph.t || '');
          const bg = isGate ? 'var(--color-yellow)' : isRes ? 'var(--color-green)' : 'var(--color-blue)';
          const fg = isGate ? '#1a1405' : '#ffffff';
          return (
            <div key={'ph-' + ph.id} className="absolute top-1.5" style={{ left, width: Math.max(76, w) }}>
              <div className="rounded-lg shadow-sm px-2.5 py-1 mx-0.5" style={{ background: bg }}>
                <input
                  value={ph.t || ''}
                  onChange={(e) => actions.updatePhase?.(ph.id, { t: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                  placeholder="Fase"
                  className="w-full bg-transparent outline-none font-extrabold text-[12px] leading-tight placeholder:opacity-60"
                  style={{ color: fg }}
                />
                <input
                  value={ph.sub || ''}
                  onChange={(e) => actions.updatePhase?.(ph.id, { sub: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                  placeholder="detalle / días"
                  className="w-full bg-transparent outline-none text-[9px] leading-tight placeholder:opacity-60 truncate"
                  style={{ color: fg, opacity: 0.9 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Etiquetas de carril fijas a la izquierda (siguen a su banda) */}
      <div className="absolute inset-y-0 left-0 pointer-events-none z-10">
        {LANE_BANDS.map((b) => {
          const top = view.ty + b.y * view.scale;
          const h = b.h * view.scale;
          if (top + h < 4 || top > (vpRef.current?.clientHeight || 9999)) return null;
          return (
            <div
              key={b.key}
              className="absolute left-2 rounded-lg bg-surface/95 border border-border shadow-sm px-2.5 py-1.5 backdrop-blur-sm"
              style={{ top: Math.max(58, Math.min(top + 8, top + h - 40)), borderLeft: `4px solid ${b.color}`, maxWidth: 160 }}
            >
              <div className="text-[11.5px] font-bold text-text leading-tight truncate" style={{ color: b.color }}>{b.label}</div>
              <div className="text-[9.5px] text-text3 leading-tight truncate">{b.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Controles de zoom */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1.5 z-10">
        <button onClick={zoomOut} className="w-9 h-9 rounded-lg bg-surface border border-border text-text2 hover:border-purple hover:text-purple grid place-items-center shadow-sm cursor-pointer" title="Alejar"><Minus size={16} /></button>
        <div className="h-9 px-3 rounded-lg bg-surface border border-border text-text3 text-[12px] grid place-items-center min-w-[54px]">{Math.round(view.scale * 100)}%</div>
        <button onClick={zoomIn} className="w-9 h-9 rounded-lg bg-surface border border-border text-text2 hover:border-purple hover:text-purple grid place-items-center shadow-sm cursor-pointer" title="Acercar"><Plus size={16} /></button>
        <button onClick={fitView} className="h-9 px-3 rounded-lg bg-surface border border-border text-text2 hover:border-purple hover:text-purple flex items-center gap-1.5 text-[12px] font-medium shadow-sm cursor-pointer" title="Ajustar vista"><Maximize2 size={14} /> Ajustar</button>
      </div>
    </div>
  );
});

// Custom hook liviano para una referencia de callback estable.
function useCallbackSafe(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useRef((...args) => ref.current(...args)).current;
}

export default JourneyCanvas;
