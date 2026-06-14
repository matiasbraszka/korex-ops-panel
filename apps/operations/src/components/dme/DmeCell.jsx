import { fmtMetric } from '../../lib/dme/format.js';

// Sin dato cargado -> celda en blanco (no 0, no "—").
const isBlank = (v) => v == null || (typeof v === 'number' && !Number.isFinite(v));

// Celda de la tabla DME. `tone` (del semaforo) pinta fondo/texto; null = neutra.
export default function DmeCell({ kind, value, tone, onClick, bold = false, clickable = false }) {
  const blank = isBlank(value);
  return (
    <td
      onClick={onClick}
      title={clickable ? 'Tocá para cargar/editar este día' : undefined}
      className={`text-left px-2.5 py-1.5 tabular-nums whitespace-nowrap border-l border-[#F1F3F7] ${clickable ? 'cursor-pointer hover:ring-1 hover:ring-blue/40' : ''} ${bold ? 'font-bold' : ''}`}
      style={!blank && tone ? { background: tone.bg, color: tone.fg, fontWeight: 600 } : undefined}
    >
      {blank ? '' : fmtMetric(kind, value)}
    </td>
  );
}
