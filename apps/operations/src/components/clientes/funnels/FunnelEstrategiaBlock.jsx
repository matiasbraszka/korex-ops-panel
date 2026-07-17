// La sección "Estrategia" del DEL: la primera y la que estructura todo lo demás.
// Decisión de Matías (2026-07-16): "faltaría la estrategia arriba y ya quedaría
// perfectamente estructurado". Hace REAL el Paso 1 del riel ("Estrategia definida"),
// que hoy no define nadie: el tipo se adivina con una regex sobre el nombre de la
// carpeta del Drive. Estos campos son FIJOS (no texto del documento) porque de acá
// comen el riel de pasos y los agentes de IA.
import { useState, useRef, useEffect } from 'react';
import { Users, Package, AlertCircle } from 'lucide-react';

// El tipo: la única división que quedó después de jubilar las estrategias.
const TIPOS = [
  { key: 'reclutamiento', label: 'Reclutamiento', Icon: Users,   color: '#2E69E0', bg: '#E9F1FF', border: '#C7DBFB' },
  { key: 'producto',      label: 'Producto',      Icon: Package, color: '#15803D', bg: '#E6F7EE', border: '#BBF0D0' },
];

// El "punto diferencial del cliente" (decisión de Matías 2026-07-15): los ejes reales
// del SOP del blueprint. "Todo cliente pasa por las mismas secciones, pero no todas
// pesan igual." Define QUÉ SECCIÓN DE LA LANDING PESA MÁS.
const PUNTO_DIF = [
  { key: 'historia',    label: 'Historia',              hint: 'El origen del líder es lo que convence' },
  { key: 'testimonios', label: 'Testimonios',           hint: 'La prueba social es lo que convence' },
  { key: 'autoridad',   label: 'Autoridad',             hint: 'La trayectoria y los números convencen' },
  { key: 'producto',    label: 'Producto / entregables', hint: 'Lo que se entrega es lo que convence' },
];

// Fila de dato: etiqueta a la izquierda, valor a la derecha.
function Row({ label, children, hint }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[#EDF0F5] last:border-b-0">
      <span className="w-[112px] shrink-0 text-[11.5px] font-bold text-[#6B7280] pt-1">{label}</span>
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">{children}</div>
      {hint && <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.05em] text-[#C2410C] bg-[#FFF7ED] border border-[#FED7AA] rounded-full py-0.5 px-2 pt-1">{hint}</span>}
    </div>
  );
}

export default function FunnelEstrategiaBlock({ f, onUpdate }) {
  // El objetivo es texto libre: guardado con debounce para no pegarle a la base en cada tecla.
  const [obj, setObj] = useState(f.objetivo || '');
  const [camp, setCamp] = useState(f.campaign || '');
  const objTimer = useRef(null);
  const campTimer = useRef(null);
  useEffect(() => { setObj(f.objetivo || ''); }, [f.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCamp(f.campaign || ''); }, [f.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const guardarObj = (v) => {
    setObj(v);
    clearTimeout(objTimer.current);
    objTimer.current = setTimeout(() => { if ((v || '') !== (f.objetivo || '')) onUpdate(f.id, { objetivo: v || null }); }, 700);
  };
  const guardarCamp = (v) => {
    setCamp(v);
    clearTimeout(campTimer.current);
    campTimer.current = setTimeout(() => { if ((v || '') !== (f.campaign || '')) onUpdate(f.id, { campaign: v || null }); }, 700);
  };

  const chip = (on, color, bg, border) => on
    ? { background: bg, color, border: `1.5px solid ${border}` }
    : { background: '#fff', color: '#6B7280', border: '1.5px solid #E7EAF0' };

  return (
    <section id="sec-estrategia" data-secid="estrategia" className="rounded-xl border border-[#E7EAF0] bg-white overflow-hidden" style={{ scrollMarginTop: 60 }}>
      {/* Barra de sección, con el color de Estrategia (cian), como en la maqueta. */}
      <div className="flex items-center gap-2.5 py-2.5 px-4 border-b border-[#EDF0F5]" style={{ borderLeft: '4px solid #0891B2' }}>
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg shrink-0" style={{ background: '#ECFEFF', color: '#0891B2' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
        </span>
        <span className="text-[9.5px] font-extrabold tracking-[0.09em] uppercase shrink-0" style={{ color: '#0891B2' }}>Estrategia</span>
        <span className="text-[15px] font-bold text-[#1A1D26] tracking-[-.01em] flex-1 min-w-0 truncate">De qué va este funnel</span>
      </div>

      <div className="px-4 py-1.5">
        {/* TIPO — el que hace real el Paso 1 del riel. */}
        <Row label="Tipo" hint={f.tipo ? '' : 'falta definirlo'}>
          {TIPOS.map(t => {
            const on = f.tipo === t.key;
            return (
              <button key={t.key} onClick={() => onUpdate(f.id, { tipo: on ? null : t.key })}
                className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full text-[12px] font-bold cursor-pointer transition-colors"
                style={chip(on, t.color, t.bg, t.border)}>
                <t.Icon size={13} />{t.label}
              </button>
            );
          })}
        </Row>

        {/* CAMPAÑA — etiqueta opcional para agrupar. */}
        <Row label="Campaña">
          <input value={camp} onChange={e => guardarCamp(e.target.value)}
            placeholder="Sin campaña · es opcional, sólo para agrupar"
            className="w-full text-[13px] text-[#1A1D26] border border-transparent hover:border-[#E2E5EB] focus:border-[#2E69E0] rounded-md px-2 py-1 -ml-2 bg-transparent focus:bg-white outline-none placeholder:text-[#AEB4BF] placeholder:font-normal" />
        </Row>

        {/* PUNTO DIFERENCIAL — qué sección de la landing pesa más. */}
        <Row label="Punto diferencial" hint={f.punto_dif ? '' : 'campo nuevo'}>
          {PUNTO_DIF.map(p => {
            const on = f.punto_dif === p.key;
            return (
              <button key={p.key} title={p.hint} onClick={() => onUpdate(f.id, { punto_dif: on ? null : p.key })}
                className="inline-flex items-center py-1 px-2.5 rounded-full text-[12px] font-semibold cursor-pointer transition-colors"
                style={chip(on, '#0E7490', '#ECFEFF', '#A5E8F0')}>
                {p.label}
              </button>
            );
          })}
        </Row>

        {/* FECHA DE INICIO — reusa created_date del funnel. */}
        <Row label="Fecha de inicio">
          <input type="date" value={f.created_date || ''} onChange={e => onUpdate(f.id, { created_date: e.target.value || null })}
            className="text-[12.5px] text-[#3F4653] border border-transparent hover:border-[#E2E5EB] focus:border-[#2E69E0] rounded-md px-2 py-1 -ml-2 bg-transparent focus:bg-white outline-none cursor-pointer" />
          {!f.created_date && <span className="text-[12px] text-[#AEB4BF]">Sin fecha</span>}
        </Row>

        {/* Nota que explica por qué esta sección existe. */}
        <div className="flex gap-2 mt-3 mb-1 py-2.5 px-3 rounded-lg bg-[#F8FAFC] border border-[#EDF0F5]">
          <AlertCircle size={15} className="shrink-0 text-[#94A3B8] mt-0.5" />
          <p className="text-[11.5px] text-[#6B7280] leading-relaxed m-0">
            El <b className="text-[#4B5563]">tipo</b> y el <b className="text-[#4B5563]">punto diferencial</b> no son
            texto suelto: de acá salen el riel de pasos de arriba y lo que leen los agentes. El punto diferencial
            decide qué sección de la landing pesa más.
          </p>
        </div>

        {/* OBJETIVO — texto libre. */}
        <div className="pt-2 pb-3">
          <h3 className="text-[13px] font-extrabold text-[#1A1D26] mb-1.5">Objetivo de este funnel</h3>
          <textarea value={obj} onChange={e => guardarObj(e.target.value)} rows={3}
            placeholder="¿Qué tiene que lograr? A quién le habla y qué lo hace distinto de los otros funnels de este cliente."
            className="w-full text-[13px] text-[#1A1D26] leading-relaxed border border-[#E7EAF0] focus:border-[#2E69E0] rounded-lg px-3 py-2 bg-white outline-none resize-y placeholder:text-[#AEB4BF]" />
        </div>
      </div>
    </section>
  );
}
