import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function Dropdown({ open, onClose, items, anchorRef, minWidth = 180, maxHeight = 260, keepOpen = false }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);

  const updatePosition = useCallback(() => {
    if (!anchorRef?.current || !open) return;
    const rect = anchorRef.current.getBoundingClientRect();

    // Vertical: prefer below, fall back to above
    const spaceBelow = window.innerHeight - rect.bottom;
    let top;
    if (spaceBelow >= maxHeight) {
      top = rect.bottom + 4;
    } else {
      top = Math.max(8, rect.top - maxHeight - 4);
    }

    // Horizontal: align to anchor left, but keep within viewport
    let left = rect.left;
    // If menu would overflow right edge, align to right edge of anchor
    if (left + minWidth > window.innerWidth - 12) {
      left = rect.right - minWidth;
    }
    // Ensure not off-screen left
    left = Math.max(8, left);

    setPos({ top, left });
  }, [anchorRef, open, maxHeight, minWidth]);

  useEffect(() => {
    if (open) {
      setReady(false);
      // Double rAF: first to ensure DOM is painted, second to enable backdrop
      updatePosition();
      const id1 = requestAnimationFrame(() => {
        updatePosition(); // recalc after DOM paint
        const id2 = requestAnimationFrame(() => setReady(true));
        return () => cancelAnimationFrame(id2);
      });
      return () => cancelAnimationFrame(id1);
    } else {
      setReady(false);
    }
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  if (!open) return null;

  const handleBackdropClose = (e) => {
    if (!ready) return;
    e.stopPropagation();
    e.preventDefault();
    onClose();
  };

  return createPortal(
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={handleBackdropClose}
        onMouseDown={handleBackdropClose}
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
              className="py-2.5 px-3.5 text-[13px] cursor-pointer flex items-center gap-2.5 whitespace-nowrap hover:bg-blue-bg hover:text-blue active:bg-blue-bg transition-colors"
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