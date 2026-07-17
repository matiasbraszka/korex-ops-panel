import { Globe, Film, Copy, Check, Settings2, Link2 } from 'lucide-react';
import { copyText } from '../recursosShared';

// Configuracion de Meta y Links, con los HUECOS A LA VISTA.
//
// El punto de esta pantalla no es mostrar los links: ya se mostraban. Es mostrar
// los que FALTAN. Antes el panel dibujaba solo lo que existia, asi que cada funnel
// mostraba una lista distinta y no habia con que compararlos. Los slots son fijos:
// si el Boost no esta, se ve el hueco del Boost.

const SLOT_OBLIGATORIOS = [
  { k: 'ads_url',         label: 'Publicidad',  ph: 'https://mi-funnel.metodokorex.com/?pipeline_id=12', link: true, hint: 'La URL armada que se pega en el anuncio de Meta, con sus parámetros.' },
  { k: 'official_domain', label: 'Dominio',     ph: 'mi-funnel.metodokorex.com',                          link: true, hint: 'El dominio oficial. Es el único link que se ve en la lista de funnels.' },
  { k: 'testing_url',     label: 'Test',        ph: 'https://…',                                          link: true, hint: 'Dónde se prueba el funnel antes de publicarlo.' },
  { k: 'boost_url',       label: 'Boost',       ph: 'https://…',                                          link: true, hint: 'Link para hacer el boost.' },
];
const SLOT_OTROS = [
  { k: 'prod_url', label: 'Producción',   ph: 'https://…',          link: true, hint: 'La página en vivo.' },
  { k: 'vsl_url',  label: 'VSL (Voomly)', ph: 'https://voomly.com/…', link: true, video: true, hint: 'El video de la VSL. De acá salen las métricas de retención.' },
];
const SLOT_META = [
  { k: 'pixel_id',    label: 'Facebook Pixel ID',    ph: 'Ej: 1234567890',     hint: 'Para el seguimiento de eventos. Podés pegar el código entero: extrae el ID solo.' },
  { k: 'clarity_id',  label: 'Microsoft Clarity ID', ph: 'Ej: wa8bmh1fnd',     hint: 'Para mapas de calor y grabaciones. Podés pegar el código entero.' },
  { k: 'pipeline_id', label: 'Pipeline ID',          ph: 'Ej: 12',             hint: 'El que se usa para armar la URL de Publicidad.' },
  { k: 'ad_account',  label: 'Cuenta publicitaria',  ph: 'Ej: act_1234567890', nuevo: true, hint: 'La cuenta de Meta desde la que se paga este funnel.' },
];

// Pegar el <script> entero en un campo que dice "ID" es lo que el equipo viene
// haciendo (los 14 Clarity y 11 de 12 Pixel estaban asi). No se les cambia el
// habito: se acepta el codigo, se guarda en su columna y se extrae el ID.
const EXTRACTORES = {
  clarity_id: { re: /"clarity"\s*,\s*"script"\s*,\s*"([a-z0-9]{6,15})"/i, code: 'clarity_code' },
  pixel_id:   { re: /fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,20})['"]/i,    code: 'pixel_code' },
};

// Que se guarda cuando alguien escribe (o pega) en un campo.
// Devuelve el patch para onUpdate, o null si no cambio nada.
function patchDeCampo(f, k, raw) {
  const v = (raw || '').trim();
  const ex = EXTRACTORES[k];
  if (ex && /<script|fbq\(|clarity/i.test(v)) {
    const id = (v.match(ex.re) || [])[1] || null;
    // Sin ID reconocible: se guarda el codigo igual y el ID queda vacio (hueco a
    // la vista). Nunca se tira lo que la persona pego.
    return { [ex.code]: v, [k]: id };
  }
  if (v === (f[k] || '')) return null;
  return { [k]: v || null };
}

function Campo({ f, slot, onUpdate }) {
  const val = f[slot.k] || '';
  const ex = EXTRACTORES[slot.k];
  const codigoPegado = ex ? !!(f[ex.code] || '').trim() : false;
  const Icon = slot.video ? Film : Globe;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-[7px] mb-1.5">
        <span className="text-[12.5px] font-semibold text-[#1A1D26]">{slot.label}</span>
        {slot.nuevo && <span className="text-[9px] font-bold uppercase tracking-[0.04em] py-px px-1.5 rounded-full" style={{ background: '#F5F3FF', color: '#7C3AED' }}>campo nuevo</span>}
        {/* El ID salio del codigo pegado: anda, pero conviene saber de donde vino. */}
        {codigoPegado && val && <span title="El ID se sacó del código que estaba pegado" className="text-[9px] font-bold py-px px-1.5 rounded-full" style={{ background: '#FEF3C7', color: '#92400E' }}>del código</span>}
        {codigoPegado && !val && <span title="Hay código pegado pero no se pudo leer el ID" className="text-[9px] font-bold py-px px-1.5 rounded-full" style={{ background: '#FEF2F2', color: '#B91C1C' }}>código sin ID</span>}
      </div>
      <div className="flex items-stretch gap-[7px]">
        <div className="flex-1 min-w-0 flex items-stretch border rounded-lg overflow-hidden bg-white" style={{ borderColor: '#E2E5EB' }}>
          <span className="flex items-center justify-center w-[38px] shrink-0 border-r text-[#9098A4]" style={{ background: '#F4F5F7', borderColor: '#E2E5EB' }}>
            {slot.link ? <Icon size={14} /> : <span className="text-[14px] font-bold leading-none">#</span>}
          </span>
          <input
            key={f.id + slot.k}
            defaultValue={val}
            placeholder={slot.ph}
            title={slot.hint}
            onClick={e => e.stopPropagation()}
            onBlur={(e) => {
              const patch = patchDeCampo(f, slot.k, e.target.value);
              if (patch) onUpdate(f.id, patch);
              if (patch && patch[slot.k] != null) e.target.value = patch[slot.k];
            }}
            className="flex-1 min-w-0 py-2.5 px-[11px] text-[12.5px] text-[#1A1D26] bg-transparent outline-none border-none placeholder:text-[#B6BCC6] focus:bg-[#FCFDFF]"
          />
        </div>
        {!!val && (
          <button onClick={(e) => { e.stopPropagation(); copyText(val); }} title={`Copiar: ${val}`}
            className="w-[38px] shrink-0 flex items-center justify-center border rounded-lg bg-white cursor-pointer text-[#9098A4] hover:border-[#2E69E0] hover:text-[#2E69E0]" style={{ borderColor: '#E2E5EB' }}>
            <Copy size={14} />
          </button>
        )}
      </div>
      <div className="text-[11px] text-[#AEB4BF] mt-1.5 leading-[1.45]">{slot.hint}</div>
    </div>
  );
}

function Grupo({ titulo, Icon, slots, f, onUpdate, contador }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={13} className="text-[#AEB4BF] shrink-0" />
        <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#9098A4]">{titulo}</span>
        {contador && <span className="text-[10px] font-bold rounded-full py-px px-2" style={{ background: contador.ok === contador.total ? '#ECFDF5' : '#FEF9E7', color: contador.ok === contador.total ? '#15803D' : '#A16207' }}>{contador.ok}/{contador.total}</span>}
      </div>
      <div className="grid gap-x-[18px] gap-y-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))' }}>
        {slots.map(s => <Campo key={s.k} f={f} slot={s} onUpdate={onUpdate} />)}
      </div>
    </div>
  );
}

export default function FunnelConfigBlock({ f, onUpdate, events, onTrack }) {
  const okReq = SLOT_OBLIGATORIOS.filter(s => (f[s.k] || '').trim()).length;
  const okMeta = SLOT_META.filter(s => (f[s.k] || '').trim()).length;

  return (
    <div className="border border-[#E7EAF0] rounded-xl bg-white overflow-hidden mb-3.5">
      <div className="flex items-center gap-2.5 py-3 px-[18px] border-b border-[#EDF0F5]">
        <span className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg shrink-0" style={{ background: '#EEF3FF', color: '#2E69E0' }}><Settings2 size={15} /></span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-[#1A1D26]">Configuración de Meta y links</div>
          <div className="text-[11px] text-[#9098A4]">Los campos se ven siempre, aunque estén vacíos: así se comparan funnel contra funnel</div>
        </div>
      </div>

      <div className="p-[18px]">
        <Grupo titulo="Obligatorios" Icon={Link2} slots={SLOT_OBLIGATORIOS} f={f} onUpdate={onUpdate} contador={{ ok: okReq, total: SLOT_OBLIGATORIOS.length }} />
        <Grupo titulo="Otros enlaces" Icon={Link2} slots={SLOT_OTROS} f={f} onUpdate={onUpdate} />
        <Grupo titulo="Configuración de Meta" Icon={Settings2} slots={SLOT_META} f={f} onUpdate={onUpdate} contador={{ ok: okMeta, total: SLOT_META.length }} />

        {/* Los eventos se editan en su modal (tiene nombre + propósito + código por evento).
            Acá sólo se ven, que es lo que hace falta para saber si están. */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Check size={13} className="text-[#AEB4BF] shrink-0" />
            <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#9098A4]">Eventos de conversión</span>
            <button onClick={(e) => { e.stopPropagation(); onTrack(f); }} className="text-[10.5px] font-semibold text-[#2E69E0] cursor-pointer border-none bg-transparent hover:underline ml-1">editar</button>
          </div>
          {events.length ? (
            <div className="flex flex-wrap gap-1.5">
              {events.map(ev => (
                <span key={ev.id} className="inline-flex items-center gap-1.5 py-[5px] px-2.5 rounded-md text-[11.5px] font-semibold" style={{ background: '#F5F3FF', border: '1px solid #E4DBFF', color: '#7C3AED' }}>
                  {ev.name || 'sin nombre'}
                  {ev.code && <span className="font-mono text-[10px] opacity-70">{ev.code}</span>}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex items-stretch border rounded-lg overflow-hidden bg-white max-w-[320px]" style={{ borderColor: '#E2E5EB' }}>
              <span className="flex items-center justify-center w-[38px] shrink-0 border-r text-[#9098A4]" style={{ background: '#F4F5F7', borderColor: '#E2E5EB' }}><Check size={14} /></span>
              <span className="flex-1 flex items-center py-2.5 px-[11px] text-[12.5px] text-[#B6BCC6]">Ej: eventos_pre-landing</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
