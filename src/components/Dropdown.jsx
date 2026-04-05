import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function Dropdown({ open, onClose, items, anchorRef, minWidth = 180, maxHeight = 260, keepOpen = false }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePosition = useCallback(() => {
    if (!anchorRef?.current || !open) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const menuHeight = maxHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= menuHeight ? rect.bottom + 2 : rect.top - menuHeight - 2;
    // On mobile, center horizontally if not enough space
    const isMobile = window.innerWidth < 768;
    let left;
    if (isMobile) {
      left = Math.max(8, Math.min(rect.left, window.innerWidth - minWidth - 8));
    } else {
      left = Math.min(rect.left, window.innerWidth - minWidth - 8);
    }
    setPos({ top: Math.max(4, top), left: Math.max(4, left) });
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

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && anchorRef?.current && !anchorRef.current.contains(e.target)) {
        onClose();
      }
    };
    // Listen to both mouse and touch events for mobile support
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="bg-white border border-border rounded-md py-1 overflow-y-auto"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        minWidth,
        maxHeight,
        maxWidth: 'calc(100vw - 16px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      }}
      onClick={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
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
            className="py-2.5 px-3 text-xs cursor-pointer flex items-center gap-2 whitespace-nowrap hover:bg-blue-bg hover:text-blue active:bg-blue-bg"
            onClick={() => { item.onClick?.(); if (!keepOpen) onClose(); }}
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