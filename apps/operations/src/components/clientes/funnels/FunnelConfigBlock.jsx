import { useState, useEffect } from 'react';
import { Globe, Film, Copy, Check, Settings2, Link2, Megaphone, Plus, Trash2 } from 'lucide-react';
import { copyText } from '../recursosShared';
import { useApp } from '../../../context/AppContext';
import { getCfgJump, clearCfgJump } from './cfgJump';

// Pie de alta de las listas (cuentas / eventos): dos campos rotulados lado a lado
// y el botón Agregar debajo, todo dentro de la misma tarjeta de la lista.
function AltaDoble({ labelA, phA, monoA, labelB, phB, monoB, cta, onAdd }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' };
  const agregar = () => { if (!a.trim() && !b.trim()) return; onAdd(a.trim(), b.trim()); setA(''); setB(''); };
  const onKey = (e) => { if (e.key === 'Enter') agregar(); };
  const inputCls = 'w-full py-[7px] px-2.5 border border-[#E2E5EB] rounded-md text-[12px] text-[#1A1D26] bg-white outline-none focus:border-[#2E69E0]';
  return (
    <div className="border-t border-[#F1F3F7] p-3" style={{ background: '#FBFCFE' }}>
      <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="min-w-0">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#9098A4] mb-1">{labelA}</div>
          <input value={a} onChange={(e) => setA(e.target.value)} onKeyDown={onKey} placeholder={phA}
            onClick={(e) => e.stopPropagation()} className={inputCls} style={monoA ? mono : undefined} />
        </div>
        <div className="min-w-0">
          <div className="text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#9098A4] mb-1">{labelB}</div>
          <input value={b} onChange={(e) => setB(e.target.value)} onKeyDown={onKey} placeholder={phB}
            onClick={(e) => e.stopPropagation()} className={inputCls} style={monoB ? mono : undefined} />
        </div>
      </div>
      <button onClick={agregar}
        className="mt-2 w-full inline-flex items-center justify-center gap-1 py-[7px] px-3 border border-[#DCE3FF] rounded-md bg-[#F5F7FF] text-[#2E69E0] text-[11.5px] font-semibold cursor-pointer hover:bg-[#EEF2FF]">
        <Plus size={12} />{cta}
      </button>
    </div>
  );
}

// Configuracion de Meta y Links, con los HUECOS A LA VISTA.
//
// El punto de esta pantalla no es mostrar los links: ya se mostraban. Es mostrar
// los que FALTAN. Antes el panel dibujaba solo lo que existia, asi que cada funnel
// mostraba una lista distinta y no habia con que compararlos. Los slots son fijos:
// si el Boost no esta, se ve el hueco del Boost.

const SLOT_OBLIGATORIOS = [
  { k: 'ads_url',         label: 'Publicidad',  ph: 'https://mi-funnel.metodokorex.com/?pipeline_id=12', link: true, hint: 'La URL armada que se pega en el anuncio de Meta, con sus parámetros.' },
  { k: 'official_domain', label: 'Dominio',     ph: 'mi-funnel.metodokorex.com',                          link: true, hint: 'El dominio oficial. Es el único link que se ve en la lista de funnels.' },
  { k: 'boost_url',       label: 'Boost',       ph: 'https://…',                                          link: true, hint: 'Link para hacer el boost.' },
  { k: 'prod_url',        label: 'Producción',  ph: 'https://…',                                          link: true, hint: 'La página en vivo.' },
];
// "Test" y "VSL (Voomly)" se quitaron a pedido (2026-07-27): el link de test no se
// usaba y el de Voomly ya vive en la carpeta "VSL edición" de Recursos (por archivo).
// Producción subió al lado de Boost (misma grilla) y la sección "Otros enlaces" murió.
// Los 3 eventos estándar de todo funnel (mismo set que STD_EVENTS de FunnelsView).
const EVENTOS_STD = ['Visitas', 'Registro lead', 'Thank you page'];
const SLOT_META = [
  { k: 'pixel_id',    label: 'Pixel de Meta',        ph: 'Pegá acá el código completo del pixel (o solo el ID)', hint: 'Pegá el <script> entero del Meta Pixel: el sistema guarda el código y extrae el ID solo. También sirve pegar solo el número.' },
  { k: 'clarity_id',  label: 'Microsoft Clarity ID', ph: 'Ej: wa8bmh1fnd',     hint: 'Para mapas de calor y grabaciones. Podés pegar el código entero.' },
  { k: 'pipeline_id', label: 'Pipeline ID',          ph: 'Ej: 12',             hint: 'El que se usa para armar la URL de Publicidad.' },
];
// "Cuenta publicitaria" dejó de ser un campo del funnel (2026-07-27): las cuentas son
// DEL CLIENTE (pueden ser varias y aplican a todos sus funnels) → clients.meta_ads.

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
    <div className="min-w-0" data-cfg={slot.k}>
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
  // Cuentas publicitarias: viven en el CLIENTE (clients.meta_ads) — varias, y las
  // comparten todos sus funnels. Se editan acá mismo para no ir a otra pantalla.
  const { clients, updateClient } = useApp();
  const cliente = (clients || []).find(c => c.id === f.client_id) || null;
  const cuentas = Array.isArray(cliente?.metaAds) ? cliente.metaAds : [];
  const guardarCuentas = (arr) => cliente && updateClient(cliente.id, { metaAds: arr });
  const agregarCuenta = (idRaw, nombre) => {
    let idAcc = (idRaw || '').trim();
    if (!idAcc) { window.alert('Falta el ID de la cuenta (act_…).'); return; }
    if (/^\d+$/.test(idAcc)) idAcc = 'act_' + idAcc;
    if (cuentas.some(a => (a.id || ('act_' + (a.account_id || ''))) === idAcc)) { window.alert('Esa cuenta ya está cargada.'); return; }
    // account_id (numérico) acompaña al id: es el campo que usa la sync de métricas.
    guardarCuentas([...cuentas, { id: idAcc, account_id: idAcc.replace(/^act_/, ''), use_token: true, name: (nombre || '').trim() || (cliente?.name || 'Cuenta'), currency: 'USD', spent: '', status: 'activa' }]);
  };
  const mono = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' };
  // Campos editables en la fila misma (clic → escribís → al salir se guarda).
  const inputFila = 'w-full border-none bg-transparent outline-none rounded px-1 -mx-1 focus:bg-[#F4F7FE]';

  // Último eslabón del salto Panorama → config: si la instrucción apunta a este
  // funnel, desplazar hasta el campo, destellarlo en amarillo y enfocar su input.
  useEffect(() => {
    const j = getCfgJump();
    if (!j || j.funnel !== f.id) return;
    clearCfgJump();
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-cfg="${j.campo}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.transition = 'box-shadow .3s';
      el.style.boxShadow = '0 0 0 3px #FFD84D';
      el.style.borderRadius = '10px';
      setTimeout(() => { el.style.boxShadow = 'none'; }, 2600);
      el.querySelector('input')?.focus();
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.id]);

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
        {/* Anuncios comprometidos: definen el 100% del funnel; los de más = optimización. */}
        <div data-cfg="ads_target" className="mb-3.5 flex items-center gap-3 py-2.5 px-3 rounded-xl bg-[#F8FAFF] border border-[#E7EAF0]">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold text-[#1A1D26]">Anuncios a entregar (para el 100%)</div>
            <div className="text-[11px] text-[#9098A4]">Cuántos anuncios editados = trato cumplido. Los que hagas de más cuentan como optimización.</div>
          </div>
          <input type="number" min="0" defaultValue={f.ads_target ?? ''} placeholder="ej. 15"
            onBlur={(e) => { const raw = e.target.value.trim(); const v = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0); if (v !== (f.ads_target ?? null)) onUpdate(f.id, { ads_target: v }); }}
            className="w-20 text-center py-2 px-2 text-[14px] font-bold text-[#1A1D26] bg-white border border-[#D5DCE7] rounded-lg outline-none focus:border-[#2E69E0]" />
        </div>
        <Grupo titulo="Obligatorios" Icon={Link2} slots={SLOT_OBLIGATORIOS} f={f} onUpdate={onUpdate} contador={{ ok: okReq, total: SLOT_OBLIGATORIOS.length }} />
        <Grupo titulo="Configuración de Meta" Icon={Settings2} slots={SLOT_META} f={f} onUpdate={onUpdate} contador={{ ok: okMeta, total: SLOT_META.length }} />

        {/* Cuentas y eventos: DOS COLUMNAS con listas prolijas (mismo espíritu que los
            links de arriba: cada cosa en su fila, con su rótulo, fácil de escanear). */}
        <div className="grid gap-x-[18px] gap-y-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>

          {/* Columna 1: cuentas publicitarias (del CLIENTE, valen para todos sus funnels). */}
          {cliente && (
            <div data-cfg="cuentas">
              <div className="flex items-center gap-2 mb-2.5">
                <Megaphone size={13} className="text-[#AEB4BF] shrink-0" />
                <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#9098A4]">Cuentas publicitarias</span>
                <span className="text-[10px] text-[#AEB4BF]">· del cliente</span>
              </div>
              <div className="border border-[#E7EAF0] rounded-[10px] bg-white overflow-hidden">
                {cuentas.length === 0 && <div className="py-3 px-3.5 text-[12px] text-[#B6BCC6]">Todavía no hay cuentas cargadas.</div>}
                {cuentas.map((a, i) => {
                  const accId = a.id || (a.account_id ? 'act_' + a.account_id : '');
                  return (
                  <div key={accId + '_' + i} className={'flex items-center gap-2.5 py-2.5 px-3.5' + (i ? ' border-t border-[#F1F3F7]' : '')}>
                    <div className="flex-1 min-w-0">
                      <input defaultValue={a.name || ''} placeholder="Nombre de la cuenta" title="Clic para editar el nombre"
                        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (a.name || '')) guardarCuentas(cuentas.map((x, j) => j === i ? { ...x, name: v } : x)); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                        className={inputFila + ' text-[12.5px] font-semibold text-[#1A1D26]'} />
                      <input defaultValue={accId} placeholder="act_… (falta el ID)" title="Clic para editar el ID"
                        onBlur={(e) => { let v = e.target.value.trim(); if (/^\d+$/.test(v)) v = 'act_' + v; if (v !== accId) guardarCuentas(cuentas.map((x, j) => j === i ? { ...x, id: v, account_id: v.replace(/^act_/, '') } : x)); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                        className={inputFila + ' text-[11px] text-[#9098A4]'} style={mono} />
                    </div>
                    <button onClick={() => accId && copyText(accId)} title="Copiar el ID" className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[#E2E5EB] bg-white text-[#9CA3AF] cursor-pointer hover:text-[#2E69E0] hover:border-[#C7D2FE] shrink-0"><Copy size={12} /></button>
                    <button onClick={() => { if (window.confirm(`¿Sacar la cuenta "${a.name || accId}" del cliente?`)) guardarCuentas(cuentas.filter((_, j) => j !== i)); }} title="Sacar esta cuenta"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[#E2E5EB] bg-white text-[#C3C9D4] cursor-pointer hover:text-[#EF4444] hover:border-[#FECACA] shrink-0"><Trash2 size={12} /></button>
                  </div>
                  );
                })}
                <AltaDoble labelA="ID de la cuenta" phA="act_123456789" monoA labelB="Nombre" phB="Ej: Cuenta principal"
                  cta="Agregar cuenta" onAdd={agregarCuenta} />
              </div>
            </div>
          )}

          {/* Columna 2: eventos de conversión (de ESTE funnel). */}
          <div data-cfg="eventos">
            <div className="flex items-center gap-2 mb-2.5">
              <Check size={13} className="text-[#AEB4BF] shrink-0" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#9098A4]">Eventos de conversión</span>
              <span className="text-[10px] text-[#AEB4BF]">· de este funnel</span>
              {/* El link "editar códigos" se sacó (2026-07-28): todo se edita en las filas. */}
            </div>
            <div className="border border-[#E7EAF0] rounded-[10px] bg-white overflow-hidden">
              {events.length === 0 && <div className="py-3 px-3.5 text-[12px] text-[#B6BCC6]">Todavía no hay eventos.</div>}
              {events.map((ev, i) => (
                <div key={ev.id} className={'flex items-center gap-2.5 py-2.5 px-3.5' + (i ? ' border-t border-[#F1F3F7]' : '')}>
                  <div className="flex-1 min-w-0">
                    <input defaultValue={ev.name || ''} placeholder="Evento (ej: Registro de lead)" title="Clic para editar el evento"
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (ev.name || '')) onUpdate(f.id, { conversion_events: events.map(x => x.id === ev.id ? { ...x, name: v } : x) }); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                      className={inputFila + ' text-[12.5px] font-semibold text-[#1A1D26]'} />
                    <input defaultValue={ev.code || ''} placeholder="nombre en Meta (ej: registro_de_lead)" title="Clic para editar el nombre técnico"
                      onBlur={(e) => { const v = e.target.value.trim(); if (v !== (ev.code || '')) onUpdate(f.id, { conversion_events: events.map(x => x.id === ev.id ? { ...x, code: v } : x) }); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
                      className={inputFila + ' text-[11px] text-[#9098A4]'} style={mono} />
                  </div>
                  <button onClick={() => onUpdate(f.id, { conversion_events: events.filter(x => x.id !== ev.id) })} title="Sacar este evento"
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[#E2E5EB] bg-white text-[#C3C9D4] cursor-pointer hover:text-[#EF4444] hover:border-[#FECACA] shrink-0"><Trash2 size={12} /></button>
                </div>
              ))}
              {EVENTOS_STD.some(n => !events.some(e => (e.name || '').trim().toLowerCase() === n.toLowerCase())) && (
                <div className="flex items-center gap-1.5 flex-wrap py-2 px-3.5 border-t border-[#F1F3F7]">
                  <span className="text-[10px] font-semibold text-[#AEB4BF]">Estándar:</span>
                  {EVENTOS_STD.filter(n => !events.some(e => (e.name || '').trim().toLowerCase() === n.toLowerCase())).map(n => (
                    <button key={n} onClick={() => onUpdate(f.id, { conversion_events: [...events, { id: 'ev' + Math.random().toString(36).slice(2, 8), name: n, purpose: '', code: '' }] })}
                      className="inline-flex items-center gap-1 py-1 px-2 border border-dashed border-[#C9D6FF] rounded-full bg-white text-[#2E69E0] text-[10.5px] font-semibold cursor-pointer hover:bg-[#F5F7FF]">+ {n}</button>
                  ))}
                </div>
              )}
              <AltaDoble labelA="Evento" phA="Ej: Registro de lead" labelB="Nombre (en Meta)" phB="ej: registro_de_lead" monoB
                cta="Agregar evento" onAdd={(evento, codigo) => {
                  if (!(evento || '').trim()) { window.alert('Poné qué evento es (ej: Registro de lead).'); return; }
                  onUpdate(f.id, { conversion_events: [...events, { id: 'ev' + Math.random().toString(36).slice(2, 8), name: evento.trim(), purpose: '', code: (codigo || '').trim() }] });
                }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
