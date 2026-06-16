// Layout de página que llena el alto del área de Finanzas (sin números mágicos):
// PageCol = columna flex de alto completo; lo de arriba (filtros) queda fijo y
// TableScroll ocupa el resto, así su barra horizontal queda SIEMPRE al pie visible.
export function PageCol({ children, className = '' }) {
  return <div className={`h-full flex flex-col min-h-0 min-w-0 gap-2.5 ${className}`}>{children}</div>;
}

// Scroller de tabla: ocupa el espacio restante y scrollea en ambos ejes.
// La barra horizontal queda fija al fondo del área visible (no hay que bajar a buscarla).
export function TableScroll({ children, className = '', style }) {
  return (
    <div className={`flex-1 min-h-0 min-w-0 overflow-auto border border-border rounded-lg bg-white ${className}`} style={style}>
      {children}
    </div>
  );
}
