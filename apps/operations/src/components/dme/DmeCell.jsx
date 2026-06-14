import { fmtMetric } from '../../lib/dme/format.js';

// Celda de la tabla DME. `tone` (del semaforo) pinta fondo/texto; null = neutra.
export default function DmeCell({ kind, value, tone, onClick, bold = false, clickable = false }) {
  return (
    <td
      onClick={onClick}
      title={clickable ? 'Tocá para cargar/editar este día' : undefined}
      className={`text-right px-2.5 py-1.5 tabular-nums whitespace-nowrap border-l border-[#F1F3F7] ${clickable ? 'cursor-pointer hover:ring-1 hover:ring-blue/40' : ''} ${bold ? 'font-bold' : ''}`}
      style={tone ? { background: tone.bg, color: tone.fg, fontWeight: 600 } : undefined}
    >
      {fmtMetric(kind, value)}
    </td>
  );
}
