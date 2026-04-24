import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function Dropdown({ open, onClose, items, anchorRef, minWidth = 180, maxHeight = 260, keepOpen = false, searchable = false }) {
  const menuRef = useRef(null);
  const searchRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [ready, setReady] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [search, setSearch] = useState('');

  const calcPos = useCallback(() => {
    if (!anchorRef?.current) return null;
    const rect = anchorRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;

    // Calculate available space
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const menuH = menuRef.current?.scrollHeight || maxHeight;

    let top;
    if (spaceBelow >= menuH || spaceBelow >= spaceAbove) {
      // Below — cap so it doesn't go off screen
      top = rect.bottom + 4;
      if (top + menuH > window.innerHeight - 8) {
        top = window.innerHeight - menuH - 8;
      }
    } else {
      // Above
      top = rect.top - menuH - 4;
    }
    top = Math.max(8, top);

    let left = rect.left;
    if (left + minWidth > window.innerWidth - 12) left = rect.right - minWidth;
    if (left < 8) left = 8;

    return { top, left };
  }, [anchorRef, minWidth, maxHeight]);

  useEffect(() => {
    if (!open) { setReady(false); setMeasured(false); setSearch(''); return; }

    setPos({ top: -9999, left: -9999 });
    setMeasured(false);
    setReady(false);

    const id = requestAnimationFrame(() => {
      const p = calcPos();
      if (p) setPos(p);
      setMeasured(true);
      requestAnimationFrame(() => {
        setReady(true);
        if (searchable && searchRef.current) searchRef.current.focus();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [open, calcPos, searchable]);

  useEffect(() => {
    if (!open || !measured) return;
    const onScroll = () => { const p = calcPos(); if (p) setPos(p); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); };
  }, [open, measured, calcPos]);

  if (!open) return null;

  // Filter items by search
  const filteredItems = search.trim()
    ? items.filter(item => {
        if (item.divider) return false;
        const label = item.label || '';
        const nodeName = item.node?.props?.children?.[2]?.props?.children || '';
        return label.toLowerCase().includes(search.toLowerCase()) || String(nodeName).toLowerCase().includes(search.toLowerCase());
      })
    : items;

  return createPortal(
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={(e) => { if (ready) { e.stopPropagation(); onClose(); } }}
        onMouseDown={(e) => { if (ready) { e.stopPropagation(); onClose(); } }}
      />
      <div
        ref={menuRef}
        className="bg-white border border-border rounded-lg overflow-hidden flex flex-col"
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
        {/* Search input */}
        {searchable && (
          <div className="px-2 pt-2 pb-1 border-b border-border shrink-0">
            <input
              ref={searchRef}
              type="text"
              className="w-full border border-border rounded-md py-1.5 px-2.5 text-xs font-sans outline-none bg-surface2 focus:border-blue placeholder:text-text3"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        {/* Items */}
        <div className="overflow-y-auto py-1" style={{ maxHeight: searchable ? maxHeight - 44 : maxHeight }}>
          {filteredItems.length === 0 && search.trim() && (
            <div className="py-3 px-3 text-xs text-text3 text-center">Sin resultados</div>
          )}
          {filteredItems.map((item, i) => {
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
      </div>
    </>,
    document.body
  );
}