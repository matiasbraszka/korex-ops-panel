import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ open, onClose, title, children, footer, maxWidth = 480 }) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="bg-white border border-border rounded-[14px] w-full max-h-[90vh] overflow-y-auto"
        style={{ maxWidth, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}
      >
        <div className="py-[18px] px-[22px] border-b border-border flex items-center justify-between">
          <div className="text-base font-bold">{title}</div>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-text3 text-lg cursor-pointer w-7 h-7 rounded-md flex items-center justify-center hover:bg-surface2 hover:text-text"
          >
            &times;
          </button>
        </div>
        <div className="py-5 px-[22px]">{children}</div>
        {footer && (
          <div className="py-3.5 px-[22px] border-t border-border flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}