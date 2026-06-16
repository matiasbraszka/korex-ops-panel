import { X } from 'lucide-react';

// Modal centrado reutilizable para los formularios de carga (ingreso/pago/egreso).
export default function Modal({ title, subtitle, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-2xl my-8 w-full ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="flex items-start gap-2 px-4 py-3 border-b border-border">
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-bold text-text">{title}</h2>
            {subtitle && <div className="text-[11.5px] text-text3 mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="text-text3 hover:text-text bg-transparent border-0 cursor-pointer p-0.5"><X size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="px-4 py-3 border-t border-border bg-surface2/40 flex items-center justify-end gap-2 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

// Clase base para inputs/selects de formulario.
export const ctrl = 'w-full border border-border rounded-md px-2.5 py-1.5 text-[13px] outline-none focus:border-[#0EA5A4] bg-white';

// Campo etiquetado (label arriba del control).
export function Field({ label, children, hint, required, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[11px] font-medium text-text2">{label}{required && <span className="text-red-500"> *</span>}</span>
      <div className="mt-0.5">{children}</div>
      {hint && <span className="text-[10px] text-text3 leading-tight block mt-0.5">{hint}</span>}
    </label>
  );
}

// Botón primario / secundario para el footer.
export const PrimaryBtn = ({ children, disabled, onClick }) => (
  <button onClick={onClick} disabled={disabled} style={{ backgroundColor: '#0EA5A4' }}
    className="text-[13px] font-semibold text-white rounded-md px-4 py-1.5 cursor-pointer border-0 disabled:opacity-60 hover:opacity-90">
    {children}
  </button>
);
export const GhostBtn = ({ children, onClick }) => (
  <button onClick={onClick} className="text-[13px] text-text2 bg-transparent border border-border rounded-md px-3 py-1.5 cursor-pointer hover:bg-surface2">
    {children}
  </button>
);
