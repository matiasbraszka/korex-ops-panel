import { useState } from 'react';
import { Calendar, Check, Eye, EyeOff, Plus, X } from 'lucide-react';
import PersonAvatar from '../../tareas/PersonAvatar';
import { AUDIT_ALCANCES, alcanceLabel } from './delTabs';
import { aFecha, textoPeriodo } from './auditoriaFmt';

// Encabezado exclusivo de una AUDITORÍA del DEL.
//
// Una auditoría es una sección normal (kind = 'auditoria') con una ficha propia
// guardada en del_auditorias. Esto es esa ficha: cuándo se hizo, qué período mira,
// de qué es, quiénes del equipo la hicieron —con su foto— y el embudo auditado,
// que es siempre el del DEL donde está.
//
// El interruptor "la ve el cliente" es el ÚNICO control de visibilidad de una
// auditoría: no pasa por el circuito de revisar/aprobar de las otras secciones,
// porque una auditoría no se aprueba, se publica o no.

const C = '#E11D48';        // el color de la categoría (delTabs: auditoria)
const BG = '#FFF1F2';
const BORDE = '#FBD5DB';

export default function AuditoriaHeader({ datos, editando, teamMembers = [], funnelName, onGuardar }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const d = datos || {};
  const equipo = Array.isArray(d.equipo) ? d.equipo : [];
  const periodo = textoPeriodo(d.desde, d.hasta);
  const visible = !!d.visibleCliente;

  const guardar = (cambios) => onGuardar?.({
    fecha: d.fecha || null, desde: d.desde || null, hasta: d.hasta || null,
    alcance: d.alcance || 'completo', equipo, visibleCliente: visible,
    ...cambios,
  });

  const miembro = (id) => teamMembers.find(m => String(m.id) === String(id));
  const toggleMiembro = (id) => {
    const yaEsta = equipo.some(x => String(x) === String(id));
    guardar({ equipo: yaEsta ? equipo.filter(x => String(x) !== String(id)) : [...equipo, id] });
  };

  const fechaGrande = aFecha(d.fecha);
  const disponibles = teamMembers.filter(m => m.is_active !== false);

  return (
    <div className="border-b" style={{ background: BG, borderColor: BORDE }}>
      <div className="flex items-start gap-3.5 py-3.5 px-4 flex-wrap sm:flex-nowrap">

        {/* Fecha de la auditoría, como el taco de un calendario */}
        <div className="shrink-0 w-[54px] rounded-[11px] overflow-hidden text-center border" style={{ borderColor: BORDE, background: '#fff' }}>
          <div className="text-[9px] font-extrabold uppercase tracking-[0.08em] py-[3px]" style={{ background: C, color: '#fff' }}>
            {fechaGrande ? fechaGrande.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '') : '—'}
          </div>
          <div className="text-[21px] font-extrabold leading-[1.15] pt-1 pb-1.5 tabular-nums" style={{ color: '#1A1D26' }}>
            {fechaGrande ? fechaGrande.getDate() : '·'}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {/* De qué es + el embudo auditado */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9.5px] font-extrabold uppercase tracking-[0.1em]" style={{ color: C }}>Auditoría</span>
            <span className="text-[15px] font-extrabold tracking-[-0.01em] text-[#1A1D26]">{alcanceLabel(d.alcance)}</span>
            {funnelName && (
              <span className="inline-flex items-center text-[10.5px] font-bold py-[2px] px-2 rounded-full border bg-white" style={{ color: C, borderColor: BORDE }}>
                {funnelName}
              </span>
            )}
          </div>

          {/* Período auditado */}
          <div className="flex items-center gap-1.5 mt-1 text-[12px] font-semibold text-[#7A5560]">
            <Calendar size={12} className="shrink-0" />
            {periodo || <span className="italic font-medium text-[#B69AA1]">Sin período cargado</span>}
          </div>

          {/* Quiénes la hicieron */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {equipo.length > 0 ? equipo.map((id) => {
              const m = miembro(id);
              return (
                <span key={id} className="inline-flex items-center gap-1.5 py-[3px] pl-[3px] pr-2.5 rounded-full border bg-white" style={{ borderColor: BORDE }}>
                  <PersonAvatar member={m} name={m?.name || String(id)} size={20} />
                  <span className="text-[11.5px] font-bold text-[#3F4653]">{m?.name || String(id)}</span>
                  {editando && (
                    <button onClick={() => toggleMiembro(id)} title="Sacar de la auditoría"
                      className="w-3.5 h-3.5 inline-flex items-center justify-center rounded-full border-none bg-transparent cursor-pointer text-[#C3C9D4] hover:text-[#B91C1C]">
                      <X size={10} />
                    </button>
                  )}
                </span>
              );
            }) : !editando && (
              <span className="text-[11.5px] italic text-[#B69AA1]">Todavía no se cargó quién la hizo</span>
            )}

            {editando && (
              <span className="relative inline-flex">
                <button onClick={() => setPickerOpen(o => !o)}
                  className="inline-flex items-center gap-1 py-[5px] px-2.5 rounded-full border bg-white text-[11px] font-bold cursor-pointer hover:bg-[#FFF7F8]"
                  style={{ color: C, borderColor: BORDE }}>
                  <Plus size={11} strokeWidth={3} />Quién la hizo
                </button>
                {pickerOpen && (<>
                  <span className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
                  <div className="absolute z-40 top-full left-0 mt-1 bg-white border border-[#E2E5EB] rounded-lg p-1 min-w-[210px] max-h-[280px] overflow-y-auto"
                    style={{ boxShadow: '0 6px 18px rgba(10,22,40,.14)' }}>
                    {disponibles.length === 0 && <div className="px-2 py-2 text-[11.5px] text-[#9098A4]">No hay nadie en el equipo.</div>}
                    {disponibles.map((m) => {
                      const puesto = equipo.some(x => String(x) === String(m.id));
                      return (
                        <button key={m.id} onClick={() => toggleMiembro(m.id)}
                          className="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-left text-[12px] font-semibold border-none bg-transparent cursor-pointer text-[#3F4653] hover:bg-[#F4F6F9]">
                          <PersonAvatar member={m} name={m.name} size={20} />
                          <span className="truncate flex-1 min-w-0">{m.name}</span>
                          {puesto && <Check size={13} className="shrink-0" style={{ color: C }} />}
                        </button>
                      );
                    })}
                  </div>
                </>)}
              </span>
            )}
          </div>
        </div>

        {/* Interruptor: ¿la ve el cliente en su plataforma? */}
        <button
          onClick={() => editando && guardar({ visibleCliente: !visible })}
          disabled={!editando}
          title={editando
            ? (visible ? 'La está viendo en su plataforma. Clic para ocultarla.' : 'Solo la ve el equipo. Clic para publicarla al cliente.')
            : (visible ? 'El cliente la ve en su plataforma' : 'Solo la ve el equipo')}
          className="shrink-0 inline-flex items-center gap-1.5 py-[6px] px-2.5 rounded-lg border text-[10.5px] font-extrabold uppercase tracking-[0.03em] bg-white disabled:cursor-default"
          style={visible
            ? { color: '#15803D', borderColor: '#BBF7D0', background: '#F0FDF4', cursor: editando ? 'pointer' : 'default' }
            : { color: '#7A8290', borderColor: '#E2E5EB', cursor: editando ? 'pointer' : 'default' }}>
          {visible ? <Eye size={12} /> : <EyeOff size={12} />}
          {visible ? 'La ve el cliente' : 'Solo equipo'}
        </button>
      </div>

      {/* Los campos, solo editando. Leyendo, el encabezado de arriba ya lo cuenta todo. */}
      {editando && (
        <div className="flex items-end gap-3 flex-wrap py-2.5 px-4 border-t" style={{ borderColor: BORDE }}>
          <Campo label="Fecha de la auditoría">
            <input type="date" value={d.fecha || ''} onChange={(e) => guardar({ fecha: e.target.value || null })}
              className="py-[5px] px-2 rounded-md border border-[#E2E5EB] bg-white text-[12px] font-semibold text-[#3F4653] outline-none" />
          </Campo>
          <Campo label="Período auditado">
            <span className="inline-flex items-center gap-1.5">
              <input type="date" value={d.desde || ''} onChange={(e) => guardar({ desde: e.target.value || null })}
                className="py-[5px] px-2 rounded-md border border-[#E2E5EB] bg-white text-[12px] font-semibold text-[#3F4653] outline-none" />
              <span className="text-[11px] font-bold text-[#9098A4]">a</span>
              <input type="date" value={d.hasta || ''} onChange={(e) => guardar({ hasta: e.target.value || null })}
                className="py-[5px] px-2 rounded-md border border-[#E2E5EB] bg-white text-[12px] font-semibold text-[#3F4653] outline-none" />
            </span>
          </Campo>
          <Campo label="¿De qué es?">
            <select value={d.alcance || 'completo'} onChange={(e) => guardar({ alcance: e.target.value })}
              className="py-[5px] px-2 rounded-md border border-[#E2E5EB] bg-white text-[12px] font-semibold text-[#3F4653] outline-none cursor-pointer">
              {AUDIT_ALCANCES.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
          </Campo>
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#A88F96]">{label}</span>
      {children}
    </label>
  );
}
