// Panel flotante de los popovers del panel Agentes (selector de agente, historial y contexto).
// `align` posiciona respecto del disparador; en mobile se estira a los costados.
export default function DropdownPanel({ children, align = 'left', width = 380, className = '', style }) {
  return (
    <div
      className={`absolute top-[calc(100%+8px)] z-50 bg-white border border-border rounded-2xl max-md:left-0 max-md:right-0 max-md:w-auto ${align === 'right' ? 'right-0' : 'left-0'} ${className}`}
      style={{ width, maxWidth: '80vw', boxShadow: '0 12px 32px rgba(10,22,40,.08), 0 4px 12px rgba(10,22,40,.05)', animation: 'agentPop .16s cubic-bezier(.4,0,.2,1)', ...style }}
    >
      {children}
    </div>
  );
}
