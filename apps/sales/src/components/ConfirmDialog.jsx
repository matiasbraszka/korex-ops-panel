import { useState, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';

// Hook que devuelve { confirm, dialog }. confirm() devuelve una Promise<boolean>.
// Reemplaza window.confirm() por un modal in-app sin pop-ups del browser.
//
// Uso:
//   const { confirm, dialog } = useConfirm();
//   const ok = await confirm({ title, message, danger: true });
//   if (ok) { ... }
//   ...
//   return <>... {dialog}</>;
export function useConfirm() {
  const [state, setState] = useState(null); // { title, message, danger, resolve }

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      setState({
        title: opts.title || '¿Confirmar?',
        message: opts.message || '',
        danger: !!opts.danger,
        confirmLabel: opts.confirmLabel || (opts.danger ? 'Eliminar' : 'Aceptar'),
        cancelLabel: opts.cancelLabel || 'Cancelar',
        resolve,
      });
    });
  }, []);

  const close = (val) => {
    state?.resolve(val);
    setState(null);
  };

  const dialog = state ? (
    <>
      {/* Backdrop sutil con blur, no negro */}
      <div className="fixed inset-0 z-[60] bg-text/15 backdrop-blur-sm transition-opacity"
           style={{ animation: 'fadeIn .15s ease-out' }}
           onClick={() => close(false)} />
      <div className="fixed z-[70] bg-white rounded-2xl border border-border
                      inset-x-4 top-1/2 -translate-y-1/2
                      md:inset-x-auto md:left-1/2 md:-translate-x-1/2
                      md:w-[400px] max-w-[440px] p-5
                      shadow-[0_24px_60px_-12px_rgba(26,29,38,.18),0_8px_24px_-8px_rgba(26,29,38,.12)]"
           style={{ animation: 'scaleIn .18s cubic-bezier(.16,1,.3,1)' }}
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            state.danger ? 'bg-red-bg text-red' : 'bg-blue-bg text-blue'
          }`}>
            <AlertTriangle size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-text">{state.title}</div>
            {state.message && (
              <div className="text-[12px] text-text2 mt-1 leading-relaxed">{state.message}</div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={() => close(false)}
                  className="py-2 px-3.5 rounded-lg border border-border bg-white text-text2 text-[12px] font-medium hover:bg-surface2 transition-colors">
            {state.cancelLabel}
          </button>
          <button type="button" autoFocus onClick={() => close(true)}
                  className={`py-2 px-3.5 rounded-lg text-white text-[12px] font-semibold transition-colors ${
                    state.danger ? 'bg-red hover:bg-red/90' : 'bg-blue hover:bg-blue-dark'
                  }`}>
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </>
  ) : null;

  return { confirm, dialog };
}

// Hook para toasts efimeros (reemplaza window.alert).
// Uso:
//   const { showToast, toasts } = useToast();
//   showToast('Algo salió mal', 'error');
//   ...
//   return <>... {toasts}</>;
export function useToast() {
  const [list, setList] = useState([]); // { id, message, kind }

  const showToast = useCallback((message, kind = 'info') => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, message, kind }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 3500);
  }, []);

  const toasts = (
    <div className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 pointer-events-none">
      {list.map((t) => (
        <div key={t.id}
             className={`pointer-events-auto px-3.5 py-2.5 rounded-lg shadow-lg text-[12.5px] font-medium max-w-[360px] animate-[slideInRight_.18s_ease-out] ${
               t.kind === 'error' ? 'bg-red text-white'
               : t.kind === 'success' ? 'bg-green text-white'
               : 'bg-text text-white'
             }`}>
          {t.message}
        </div>
      ))}
    </div>
  );

  return { showToast, toasts };
}
