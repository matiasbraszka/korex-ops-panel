import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function Dropdown({ open, onClose, items, anchorRef, minWidth = 180, maxHeight = 260, keepOpen = false }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);
  const [measured, setMeasured] = useState(false);

  const calcPos = useCallback(() => {
    if (!anchorRef?.current) return null;
    const rect = anchorRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null; // hidden element

    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < 100
      ? Math.max(8, rect.top - (menuRef.current?.scrollHeight || 200) - 4)
      : rect.bottom + 4;

    let left = rect.left;
    if (left + minWidth > window.innerWidth - 12) left = rect.right - minWidth;
    if (left < 8) left = 8;

    return { top, left };
  }, [anchorRef, minWidth]);

  useEffect(() => {
    if (!open) { setReady(false); setMeasured(false); return; }

    // Frame 1: render off-screen to measure
    setPos({ top: -9999, left: -9999 });
    setMeasured(false);
    setReady(false);

    const id = requestAnimationFrame(() => {
      // Frame 2: now menu is in DOM, calc real position
      const p = calcPos();
      if (p) setPos(p);
      setMeasured(true);
      requestAnimationFrame(() => setReady(true));
    });
    return () => cancelAnimationFrame(id);
  }, [open, calcPos]);

  useEffect(() => {
    if (!open || !measured) return;
    const onScroll = () => { const p = calcPos(); if (p) setPos(p); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); };
  }, [open, measured, calcPos]);

  if (!open) return null;

  return createPortal(
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={(e) => { if (ready) { e.stopPropagation(); onClose(); } }}
        onMouseDown={(e) => { if (ready) { e.stopPropagation(); onClose(); } }}
      />
      <div
        ref={menuRef}
        className="bg-white border border-border rounded-lg py-1 overflow-y-auto"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          zIndex: 9999,
          minWidth,
          maxHeight,
          maxWidth: 'calc(100vw - 16px)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
          opacity: measured ? 1 : 0,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {items.map((item, i) => {
          if (item.divider) {
            return (
              <div key={i} className="py-1 px-2.5 text-[9px] font-bold uppercase tracking-[0.5px] border-t border-border mt-0.5" style={{ color: item.color || 'var(--color-text3)' }}>
                {item.label}
              </div>
            );
          }
          return (
            <div
              key={i}
              className="py-2 px-3 text-[13px] cursor-pointer flex items-center gap-2 whitespace-nowrap hover:bg-blue-bg hover:text-blue active:bg-blue-bg transition-colors"
              onClick={(e) => { e.stopPropagation(); item.onClick?.(); if (!keepOpen) onClose(); }}
              onMouseDown={(e) => e.stopPropagation()}
              style={item.style}
            >
              {item.icon && <span style={{ color: item.iconColor }}>{item.icon}</span>}
              {item.node || item.label}
            </div>
          );
        })}
      </div>
    </>,
    document.body
  );
}