import { useState, useRef, useEffect } from 'react';
import { Users, Building2, Ticket, MoreHorizontal, Eye, Lock } from 'lucide-react';
import { initials, colorFromString, prettyPreview, fmtPhone } from '../../lib/format.js';
import { ACCIONES, fmtEspera, colorEspera } from '../../lib/kanban.js';

// Nombre a mostrar. La vista no trae el contacto vinculado (es una vista sobre
// wa_conversations), asi que la prioridad es: nombre agendado > nombre de perfil
// de WhatsApp > telefono. A los no-admin no les revelamos el numero.
function nombre(row, isAdmin) {
  const named = row.custom_name || row.wa_profile_name;
  if (named) return named;
  if (!isAdmin) return row.is_group ? 'Grupo' : 'Contacto';
  return fmtPhone(String(row.wa_jid || '').split('@')[0]) || 'Contacto';
}

// Fecha por defecto del seguimiento: dentro de una semana, en formato AAAA-MM-DD.
function enUnaSemana() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

export default function TarjetaConv({ row, isAdmin, duenoNombre, onAbrirChat, onMarcar }) {
  const [menu, setMenu] = useState(false);
  const [pidiendoFecha, setPidiendoFecha] = useState(false);
  const [fecha, setFecha] = useState(row.seguimiento_fecha || enUnaSemana());
  const ref = useRef(null);

  const cerrarMenu = () => { setMenu(false); setPidiendoFecha(false); };

  useEffect(() => {
    if (!menu) return;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) cerrarMenu(); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [menu]);

  const name = nombre(row, isAdmin);
  const color = colorFromString(row.wa_jid || '');
  const espera = fmtEspera(row.horas_esperando);
  const colorEsp = colorEspera(row.horas_esperando, row.columna_kanban);
  const preview = prettyPreview(row.last_message_preview || '').replace(/^Vos: /, '');

  const marcar = (accion) => {
    // "Seguimiento" necesita un día: se pide ahí mismo, sin salir del menú.
    if (accion.pideFecha) { setPidiendoFecha(true); return; }
    cerrarMenu();
    onMarcar(row.id, accion.estado, null);
  };

  const confirmarFecha = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
    cerrarMenu();
    onMarcar(row.id, 'seguimiento', fecha);
  };

  return (
    <div className="relative bg-white border border-border/70 rounded-[10px] p-2.5 hover:border-[#F59E0B]/55 hover:shadow-[0_2px_8px_rgba(10,22,40,0.06)] transition-all">
      <div className="flex items-start gap-2">
        <button
          onClick={() => onAbrirChat(row.id)}
          title="Abrir el chat"
          className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer"
        >
          {/* Nombre + hace cuánto espera */}
          <div className="flex items-center gap-1.5">
            <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[9px] font-bold"
                  style={{ background: color + '1d', color }}>
              {row.is_group ? <Users size={11} /> : initials(name)}
            </span>
            <span className="text-[12.5px] font-semibold text-text truncate">{name}</span>
            <span className="flex-1" />
            <span className="text-[10.5px] font-bold shrink-0 tabular-nums" style={{ color: colorEsp }}>{espera}</span>
          </div>

          {preview && <div className="text-[11.5px] text-text3 truncate mt-1">{preview}</div>}

          {/* Cliente · dueño · chips */}
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {row.cliente_nombre && (
              <span className="text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-[#EEF2FF] text-[#4A67D8] truncate max-w-[130px] flex items-center gap-0.5">
                <Building2 size={9} className="shrink-0" /> {row.cliente_nombre}
              </span>
            )}
            {duenoNombre && (
              <span className="text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-surface2 text-text2 truncate max-w-[110px]">
                {duenoNombre}
              </span>
            )}
            {row.nunca_abierta && (
              <span title="Nunca se abrió este chat"
                    className="text-[9.5px] font-bold px-1.5 py-px rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center gap-0.5">
                <Eye size={9} /> Sin ver
              </span>
            )}
            {row.tickets_abiertos > 0 && (
              <span title={`${row.tickets_abiertos} pendiente(s) sin resolver`}
                    className="text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-[#FFF7ED] text-[#B45309] flex items-center gap-0.5">
                <Ticket size={9} /> {row.tickets_abiertos}
              </span>
            )}
            {row.bloqueado_manual && (
              <span title="Vinculada a mano: la clasificación automática no la toca"
                    className="text-[9.5px] font-semibold px-1 py-px rounded-full bg-surface2 text-text3 flex items-center gap-0.5">
                <Lock size={9} />
              </span>
            )}
            {row.estado === 'seguimiento' && row.seguimiento_fecha && (
              <span className="text-[9.5px] font-semibold px-1.5 py-px rounded-full bg-[#F5F3FF] text-[#7C3AED]">
                {row.seguimiento_fecha}
              </span>
            )}
          </div>
        </button>

        {/* Menú de acciones */}
        <div className="relative shrink-0" ref={ref}>
          <button onClick={() => setMenu((v) => !v)} title="Mover"
                  className="text-text3 hover:text-text bg-transparent border-0 cursor-pointer p-0.5 rounded">
            <MoreHorizontal size={15} />
          </button>
          {menu && (
            <div className="absolute right-0 top-6 z-20 w-[188px] bg-white border border-border rounded-[10px] shadow-[0_8px_24px_rgba(10,22,40,0.12)] py-1">
              {pidiendoFecha ? (
                <div className="px-2.5 py-2">
                  <div className="text-[10.5px] font-semibold text-text2 mb-1.5">¿Qué día la retomamos?</div>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
                         onKeyDown={(e) => { if (e.key === 'Enter') confirmarFecha(); }}
                         className="w-full text-[11.5px] px-1.5 py-1 rounded-lg border border-border outline-none focus:border-[#8B5CF6]" />
                  <div className="text-[9.5px] text-text3 mt-1 leading-snug">Cuando llegue el día vuelve sola a “A responder hoy”.</div>
                  <div className="flex gap-1.5 mt-2">
                    <button onClick={confirmarFecha}
                            className="flex-1 text-[11px] font-semibold text-white rounded-lg py-1 border-0 cursor-pointer"
                            style={{ background: '#8B5CF6' }}>Agendar</button>
                    <button onClick={() => setPidiendoFecha(false)}
                            className="text-[11px] font-semibold text-text3 rounded-lg py-1 px-2 bg-transparent border-0 cursor-pointer hover:text-text">Volver</button>
                  </div>
                </div>
              ) : ACCIONES.map((a) => (
                <button key={a.label} onClick={() => marcar(a)}
                        className="w-full text-left px-2.5 py-1.5 text-[12px] text-text2 hover:bg-surface2 bg-transparent border-0 cursor-pointer flex items-center gap-2">
                  <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: a.dot }} />
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
