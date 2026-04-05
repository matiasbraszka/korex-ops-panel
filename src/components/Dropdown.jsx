import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function Dropdown({ open, onClose, items, anchorRef, minWidth = 180, maxHeight = 260, keepOpen = false }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!anchorRef?.current || !open) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= maxHeight ? rect.bottom + 4 : rect.top - maxHeight - 4;
    const left = Math.min(rect.left, window.innerWidth - minWidth - 12);
    setPos({ top: Math.max(8, top), left: Math.max(8, left) });
  }, [anchorRef, open, maxHeight, minWidth]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  // Outside-click handler with delay to prevent the opening click from closing it
  useEffect(() => {
    if (!open) return;

    let handler = null;
    const timerId = setTimeout(() => {
      handler = (e) => {
        if (
          menuRef.current && !menuRef.current.contains(e.target) &&
          anchorRef?.current && !anchorRef.current.contains(e.target)
        ) {
          onClose();
        }
      };
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
    }, 50);

    return () => {
      clearTimeout(timerId);
      if (handler) {
        document.removeEventListener('mousedown', handler);
        document.removeEventListener('touchstart', handler);
      }
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
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
      onTouchStart={(e) => e.stopPropagation()}
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
            style={item.style}
          >
            {item.icon && <span style={{ color: item.iconColor }}>{item.icon}</span>}
            {item.node || item.label}
          </div>
        );
      })}
    </div>,
    document.body
  );
}