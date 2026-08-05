// SaveToDel — botón "Guardar en DEL" + selector de pestaña, reutilizable por las tarjetas de
// anuncio/VSL y por las acciones de cada respuesta. Guarda el `text` recibido en el DEL del funnel:
// crea una pestaña nueva (en la sección que le corresponde a ese agente: anuncios/vsl/landing…)
// o lo agrega al final de una pestaña existente. No pisa: siempre concatena con sello y fecha.
import { useState } from 'react';
import { supabase } from '@korex/db';
import { FileOutput, Plus, Loader2, Check } from 'lucide-react';
import { sanitizeDelHtml } from '../clientes/funnels/delSanitize';

// A qué pestaña (kind) del DEL va cada agente por defecto, y cómo se titula la
// sección exportada. Es solo la sugerencia: el destino se elige a mano (abajo).
const DEL_KIND = { anuncios: 'anuncios', vsl: 'vsl', landing: 'pg_landing', descubrimiento: 'estrategia' };
const DEL_LABEL = { anuncios: 'Anuncios (IA)', vsl: 'VSL (IA)', landing: 'Copy del funnel (IA)', descubrimiento: 'Descubrimiento (IA)' };

// Todas las categorías del DEL. Cualquier agente puede escribir en cualquiera:
// el de VSL puede dejar una idea en Anuncios, el de Descubrimiento en Avatares.
// Antes el destino lo fijaba el agente y no había forma de cambiarlo.
const CATEGORIAS = [
  { kind: 'estrategia', label: 'Estrategia' },
  { kind: 'avatares', label: 'Avatares' },
  { kind: 'vsl', label: 'VSL' },
  { kind: 'anuncios', label: 'Anuncios' },
  { kind: 'pg_prelanding', label: 'Pre-landing' },
  { kind: 'pg_landing', label: 'Landing VSL' },
  { kind: 'pg_formulario', label: 'Formulario' },
  { kind: 'pg_thankyou', label: 'Thank you' },
  { kind: 'pg_testimonios', label: 'Testimonios' },
  { kind: 'mensajes', label: 'Mensajes' },
  { kind: 'otros', label: 'Otros' },
];

// Markdown simple → HTML dentro de la whitelist del DEL (h1-h3, p, ul/li, strong, br).
function mdToHtml(src) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>');
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = []; let list = null; let para = [];
  const flushPara = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
  const flushList = () => { if (list) { out.push('<ul>' + list.map((li) => '<li>' + inline(li) + '</li>').join('') + '</ul>'); list = null; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (h) { flushPara(); flushList(); const n = h[1].length; out.push(`<h${n}>` + inline(h[2]) + `</h${n}>`); }
    else if (bullet) { flushPara(); (list = list || []).push(bullet[1]); }
    else if (line.trim() === '') { flushPara(); flushList(); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return out.join('');
}

const btnBase = 'inline-flex items-center gap-1.5 rounded-lg py-1.5 px-2.5 text-[11.5px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

// variant: 'chip' (gris, para la fila de acciones) | 'card' (destacado, para el header de la tarjeta)
export default function SaveToDel({ sel, subagentKey, text, label = 'Guardar en DEL', variant = 'chip', accent }) {
  const [open, setOpen] = useState(false);
  const [secs, setSecs] = useState(null);   // null = sin cargar | [] = sin pestañas | [...]
  const [state, setState] = useState('idle'); // idle | saving | done | error
  const [msg, setMsg] = useState('');

  if (!sel?.funnelId) return null;

  const abrir = async () => {
    if (state === 'saving') return;
    const next = !open;
    setOpen(next);
    if (!next || secs !== null) return;
    try {
      // SIEMPRE por doc_id, y acotado por cliente. Antes había un `else if` que, cuando
      // el funnel no tenía del_doc_id, listaba las secciones por strategy_id — la CARPETA
      // de Drive, que pueden compartir dos funnels. Esa lista después se usaba para elegir
      // a qué documento escribir (ver `guardar`), así que podía terminar guardando en el
      // DEL equivocado. Si el funnel no tiene DEL, no hay lista: se crea uno nuevo.
      const { data: page } = await supabase.from('strategy_pages')
        .select('del_doc_id,strategy_id,client_id').eq('id', sel.funnelId).maybeSingle();
      let list = [];
      if (page?.del_doc_id) {
        const { data } = await supabase.from('del_sections')
          .select('id,title,kind,ord,doc_id')
          .eq('doc_id', page.del_doc_id)
          .eq('client_id', page.client_id || sel.clientId)
          .order('ord');
        list = data || [];
      }
      setSecs(list);
    } catch { setSecs([]); }
  };

  const guardar = async (target, kindElegido) => {
    setOpen(false); setState('saving'); setMsg('');
    try {
      const html = sanitizeDelHtml(mdToHtml(text || ''));
      const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
      if (target === 'new') {
        const { data: page } = await supabase.from('strategy_pages')
          .select('name,del_doc_id,strategy_id,client_id').eq('id', sel.funnelId).maybeSingle();
        // El documento sale del funnel y de nadie más. Antes, si el funnel no tenía DEL,
        // caía a `secs[0].doc_id` — el documento de la primera sección de una lista que
        // venía sin verificar cliente. O sea: adivinaba, y podía escribir en el DEL de
        // otro cliente. Si no hay DEL, se crea uno; nunca se hereda el de otro.
        let docId = page?.del_doc_id || null;
        if (!docId) {
          const { data: newDoc, error: e1 } = await supabase.rpc('del_doc_create', {
            p_client_id: sel.clientId, p_strategy_id: sel.strategyId || page?.strategy_id || null, p_title: page?.name || 'DEL',
          });
          if (e1) throw e1;
          docId = newDoc;
          if (docId) await supabase.from('strategy_pages').update({ del_doc_id: docId }).eq('id', sel.funnelId);
        }
        if (!docId) throw new Error('No se pudo ubicar ni crear el DEL de este funnel.');
        const kind = kindElegido || DEL_KIND[subagentKey] || 'otros';
        const nombreCat = CATEGORIAS.find((c) => c.kind === kind)?.label;
        // Si el destino no es el propio del agente, el título lo dice: así en el
        // DEL se entiende de dónde salió sin tener que abrirlo.
        const title = kindElegido && kindElegido !== (DEL_KIND[subagentKey] || 'otros')
          ? `${nombreCat} (IA) · ${fecha}`
          : `${DEL_LABEL[subagentKey] || 'Contenido (IA)'} · ${fecha}`;
        const { data: secId, error: e2 } = await supabase.rpc('del_section_add', {
          p_doc_id: docId, p_title: title, p_kind: kind, p_after_ord: null, p_by: 'Agente IA',
        });
        if (e2) throw e2;
        const { error: e3 } = await supabase.rpc('del_section_save', { p_id: secId, p_html: html, p_by: 'Agente IA' });
        if (e3) throw e3;
        setState('done'); setMsg(`Creada la pestaña «${title}»`);
        setSecs(null);
      } else {
        const { data: sec } = await supabase.from('del_sections').select('title,html').eq('id', target).maybeSingle();
        const sep = `<hr><p><strong>— ${DEL_LABEL[subagentKey] || 'IA'} · ${fecha} —</strong></p>`;
        const nuevo = sanitizeDelHtml(`${(sec?.html || '').trim()}${sep}${html}`);
        const { error } = await supabase.rpc('del_section_save', { p_id: target, p_html: nuevo, p_by: 'Agente IA' });
        if (error) throw error;
        setState('done'); setMsg(`Agregado al final de «${sec?.title || 'la pestaña'}»`);
      }
    } catch (err) {
      setState('error'); setMsg(err?.message || 'No se pudo guardar en el DEL.');
    }
  };

  const style = variant === 'card'
    ? (state === 'done'
        ? { background: 'var(--color-green-bg)', color: '#15803D', border: '1px solid #C7EBD4' }
        : { background: '#fff', color: accent || '#2E69E0', border: `1px solid ${(accent || '#2E69E0')}66` })
    : { background: '#fff', color: 'var(--color-text2)', border: '1px solid var(--color-border)' };

  return (
    <div className="relative inline-grid gap-1">
      <button onClick={abrir} disabled={state === 'saving'} className={btnBase} style={style}
        title="Guardar esta respuesta en el DEL: pestaña nueva o al final de una existente">
        {state === 'saving' ? <><Loader2 size={13} className="animate-spin" /> Guardando…</>
          : state === 'done' ? <><Check size={13} /> En el DEL</>
          : <><FileOutput size={13} /> {label}</>}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 z-20 bg-white border border-border rounded-xl p-2 grid gap-1 w-[300px] shadow-lg">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text3 px-1 pt-0.5">¿Dónde lo guardo en el DEL?</div>

          {/* Pestaña NUEVA, en la categoría que se elija. La del propio agente va
              primera y marcada; el resto está disponible igual. */}
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-text3 px-1">Crear una pestaña nueva en…</div>
          <div className="max-h-[176px] overflow-y-auto grid gap-0.5">
            {[...CATEGORIAS].sort((a, b) => {
              const propio = DEL_KIND[subagentKey] || 'otros';
              return (b.kind === propio) - (a.kind === propio);
            }).map((c) => {
              const propio = c.kind === (DEL_KIND[subagentKey] || 'otros');
              return (
                <button key={c.kind} onClick={() => guardar('new', c.kind)}
                  className="flex items-center gap-2 text-left py-1.5 px-2 rounded-lg text-[12.5px] font-semibold text-text cursor-pointer border-none bg-transparent hover:bg-surface2">
                  <Plus size={14} className={propio ? 'text-green shrink-0' : 'text-text3 shrink-0'} /> {c.label}
                  {propio && <span className="text-[10px] text-green font-bold ml-auto">sugerida</span>}
                </button>
              );
            })}
          </div>

          {secs === null && <div className="px-2 py-1 text-[12px] text-text3">Cargando pestañas…</div>}
          {Array.isArray(secs) && secs.length > 0 && (
            <>
              <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-text3 px-1 pt-1">Agregar al final de…</div>
              <div className="max-h-[220px] overflow-y-auto grid gap-0.5">
                {secs.map((s) => (
                  <button key={s.id} onClick={() => guardar(s.id)} title={s.title}
                    className="flex items-center gap-2 text-left py-1.5 px-2 rounded-lg text-[12.5px] text-text2 cursor-pointer border-none bg-transparent hover:bg-surface2">
                    <FileOutput size={13} className="text-text3 shrink-0" />
                    <span className="truncate">{s.title || 'Sin título'}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {Array.isArray(secs) && secs.length === 0 && (
            <div className="px-2 py-1 text-[11.5px] text-text3">Este funnel todavía no tiene pestañas: se creará una nueva.</div>
          )}
        </div>
      )}

      {msg && <div className={`text-[11px] font-semibold ${state === 'error' ? 'text-red' : 'text-green'} max-w-[280px]`}>{msg}</div>}
    </div>
  );
}
