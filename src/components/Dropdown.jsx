import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function Dropdown({ open, onClose, items, anchorRef, minWidth = 180, maxHeight = 260, keepOpen = false }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);

  const updatePosition = useCallback(() => {
    if (!anchorRef?.current || !open) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= maxHeight ? rect.bottom + 4 : rect.top - maxHeight - 4;
    const left = Math.min(rect.left, window.innerWidth - minWidth - 12);
    setPos({ top: Math.max(8, top), left: Math.max(8, left) });
  }, [anchorRef, open, maxHeight, minWidth]);

  // When dropdown opens, delay "ready" so the opening click doesn't hit the backdrop
  useEffect(() => {
    if (open) {
      setReady(false);
      updatePosition();
      const id = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(id);
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

  const handleBackdropClick = (e) => {
    if (!ready) return; // ignore clicks from the same frame that opened us
    e.stopPropagation();
    e.preventDefault();
    onClose();
  };

  return createPortal(
    <>
      {/* Invisible backdrop — click anywhere outside to close */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={handleBackdropClick}
        onMouseDown={handleBackdropClick}
      />
      {/* Menu */}
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