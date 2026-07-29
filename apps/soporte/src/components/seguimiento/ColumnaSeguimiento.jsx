import { Zap, Hand } from 'lucide-react';
import TarjetaConv from './TarjetaConv.jsx';

// Una columna del tablero. El icono del encabezado dice si la columna se llena
// sola (rayo) o si la marca una persona (mano): es la diferencia que hace que
// este tablero no mienta.
export default function ColumnaSeguimiento({ col, filas, isAdmin, nombrePorMiembro, onAbrirChat, onMarcar }) {
  const Icon = col.auto ? Zap : Hand;

  return (
    <div className="rounded-xl overflow-hidden pb-2 bg-surface2 flex flex-col min-h-0">
      <div className="flex items-center gap-[7px] py-2.5 px-3 bg-white border-b border-border/70 shrink-0">
        <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: col.dot }} />
        <span className="text-[11.5px] font-bold text-text flex-1 truncate">{col.label}</span>
        <span title={col.auto ? 'Se llena sola' : 'La marcás vos'} className="text-text3 shrink-0">
          <Icon size={11} />
        </span>
        <span className="text-[10.5px] font-bold text-text2 rounded-full py-px px-[7px] shrink-0 bg-surface">
          {filas.length}
        </span>
      </div>

      <div className="px-1 pt-1.5 text-[10px] text-text3 leading-snug shrink-0">{col.ayuda}</div>

      <div className="p-1.5 flex flex-col gap-1.5 overflow-y-auto min-h-0">
        {!filas.length && <div className="text-[11px] text-text3/70 italic text-center py-3">Vacía</div>}
        {filas.map((row) => (
          <TarjetaConv
            key={row.id}
            row={row}
            isAdmin={isAdmin}
            duenoNombre={nombrePorMiembro[row.assigned_to] || null}
            onAbrirChat={onAbrirChat}
            onMarcar={onMarcar}
          />
        ))}
      </div>
    </div>
  );
}
