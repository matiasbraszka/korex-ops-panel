import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Menu, MessageSquare, X, Check, Loader2, UploadCloud, Send, Film } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import BottomNav from '../components/BottomNav';
import { Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo, uploadRecurso, simulateUpload } from '../data/portalApi';
import { T, cardStyle, microLabel, bigBtn, pill } from '../components/theme';

// DOCUMENTO de guiones (Ads o VSL de un embudo) — la pantalla central del portal:
//  · se LEE como un documento (bloques HOOK/IDENTIFICACIÓN/… detectados del texto),
//  · se COMENTA seleccionando texto (mantener el dedo en el celular),
//  · y AL FINAL se suben las grabaciones, todas juntas.
// Las tres rayitas (☰) abren la lista de guiones para saltar a otro documento.

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rxEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Texto plano del DEL → HTML del documento: las líneas cortas en MAYÚSCULAS se
// vuelven micro-etiquetas de bloque (HOOK · 0-3s), el resto son párrafos.
function textoAHtml(texto) {
  const lineas = String(texto || '').split('\n');
  let html = '';
  for (const l of lineas) {
    const t = l.trim();
    if (!t) continue;
    const sinTiempos = t.replace(/[0-9·:\-–.()\s]/g, '');
    const esLabel = t.length <= 46 && sinTiempos.length >= 3 && sinTiempos === sinTiempos.toUpperCase() && /[A-ZÁÉÍÓÚÜÑ]/.test(sinTiempos);
    html += esLabel ? `<div class="doc-label">${esc(t)}</div>` : `<p class="doc-p">${esc(t)}</p>`;
  }
  return html || '<p class="doc-p" style="color:#9AA1AE;font-style:italic">Vacío</p>';
}

function marcarQuotes(html, cmts, marking) {
  let out = html;
  for (const c of cmts) {
    const q = (c.quote || '').trim();
    if (q.length < 2 || c.resolved) continue;
    try { out = out.replace(new RegExp('(?![^<]*>)(' + rxEsc(esc(q)) + ')'), `<mark data-cmt="${c.id}">$1</mark>`); } catch { /* raro */ }
  }
  if (marking && (marking.quote || '').trim().length >= 2) {
    try { out = out.replace(new RegExp('(?![^<]*>)(' + rxEsc(esc(marking.quote.trim())) + ')'), '<mark class="marcando">$1</mark>'); } catch { /* */ }
  }
  return out;
}

let _uid = 0;

export default function DocumentoScreen() {
  const { sid, tipo } = useParams();
  const nav = useNavigate();
  const { data, loading, reload } = useAsync(() => api.documento(sid, tipo), [sid, tipo]);
  const { data: funnels } = useAsync(() => api.funnels(), []);

  const [drawer, setDrawer] = useState(false);
  const [selBtn, setSelBtn] = useState(null);     // {top,left,quote,sectionId}
  const [composer, setComposer] = useState(null); // {quote,sectionId,parentId?}
  const [draft, setDraft] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [localComs, setLocalComs] = useState([]);
  const [subidas, setSubidas] = useState([]);     // uploads en curso
  const [avatarSel, setAvatarSel] = useState(null);
  const inputRef = useRef(null);
  const demo = isDemo();

  useEffect(() => { setLocalComs([]); setSubidas([]); setDrawer(false); window.scrollTo(0, 0); }, [sid, tipo]);

  if (loading) return <PhoneFrame><Loading label="Abriendo el documento…" /></PhoneFrame>;
  if (!data) return <PhoneFrame><div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>No encontramos este documento.</div></PhoneFrame>;

  const esVsl = data.tipo === 'vsl';
  const secciones = Array.isArray(data.secciones) ? data.secciones : [];
  const comentarios = [...(Array.isArray(data.comentarios) ? data.comentarios : []), ...localComs];
  const topComs = comentarios.filter((c) => !c.parentId);
  const avatars = Array.isArray(data.avatars) ? data.avatars : [];
  const avatarActivo = avatarSel || avatars[0]?.id || 'general';
  const subidosOk = (data.subidas?.count || 0) + subidas.filter((u) => u.done).length;

  // ── Comentar: selección de texto → botón flotante → caja abajo ──
  const onDocMouseUp = () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!sel || sel.isCollapsed || text.length < 2) { setSelBtn(null); return; }
    let node = sel.anchorNode;
    while (node && node.nodeType !== 1) node = node.parentNode;
    const secEl = node?.closest?.('[data-secid]');
    if (!secEl) { setSelBtn(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelBtn({ top: rect.top, left: rect.left + rect.width / 2, quote: text.slice(0, 300), sectionId: secEl.getAttribute('data-secid') });
  };
  const onDocTouchEnd = () => setTimeout(onDocMouseUp, 80);

  const enviarComentario = async () => {
    const body = draft.trim();
    if (!body || !composer) return;
    setEnviando(true);
    try {
      const r = await api.comentar(composer.sectionId, body, composer.quote || null, composer.parentId || null);
      if (r?.ok) {
        setLocalComs((prev) => [...prev, { id: r.id || 'tmp' + Date.now(), sectionId: composer.sectionId, body, quote: composer.quote || null, parentId: composer.parentId || null, resolved: false, authorName: 'Tú', isTeam: false, isCliente: true, createdAt: new Date().toISOString() }]);
        setDraft(''); setComposer(null); setSelBtn(null);
      } else window.alert('No pude guardar el comentario. Prueba de nuevo.');
    } finally { setEnviando(false); }
  };

  // ── Subidas al final del documento ──
  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const folder = esVsl ? 'vsl_rec' : `ad_rec__${avatarActivo}`;
    files.forEach((file) => {
      const uid = 'u' + (++_uid);
      setSubidas((prev) => [{ uid, name: file.name, pct: 0, done: false, error: false }, ...prev]);
      const onProgress = (f) => setSubidas((prev) => prev.map((u) => (u.uid === uid ? { ...u, pct: Math.round(f * 100) } : u)));
      const done = () => setSubidas((prev) => prev.map((u) => (u.uid === uid ? { ...u, pct: 100, done: true } : u)));
      const fail = () => setSubidas((prev) => prev.map((u) => (u.uid === uid ? { ...u, error: true } : u)));
      if (demo) simulateUpload(file, onProgress, done);
      else uploadRecurso(folder, file, onProgress, { strategyId: data.funnel.id }).then(done).catch(fail);
    });
  };

  const marking = composer && !composer.parentId ? composer : selBtn;

  return (
    <PhoneFrame>
      <style>{`
        .doc-label{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#9AA1AE;margin:14px 0 4px}
        .doc-p{font-size:14.5px;line-height:1.6;color:#2A2E3A;margin:0 0 8px}
        mark[data-cmt]{background:#FEF3C7;border-bottom:2px solid #EAB308;border-radius:2px;padding:0 1px;cursor:pointer}
        mark.marcando{background:#DBE2FE;border-radius:2px;padding:0 1px}
        .doc-sel,.doc-sel *{user-select:text!important;-webkit-user-select:text!important}
      `}</style>

      {/* Header: volver + tres rayitas + título + comentarios */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: T.bg, padding: '12px 14px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => nav('/guiones')} aria-label="Volver" style={hBtn}><ChevronLeft size={18} color={T.ink} /></button>
        <button onClick={() => setDrawer(true)} aria-label="Lista de guiones" style={hBtn}><Menu size={17} color={T.ink} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={microLabel(T.primary)}>{esVsl ? 'VSL' : 'Ads'}</div>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.funnel?.name}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${T.border}`, background: '#fff', borderRadius: 999, padding: '6px 11px', fontSize: 12.5, fontWeight: 800, color: T.text2, flexShrink: 0 }}>
          <MessageSquare size={13} />{topComs.length}
        </span>
      </div>

      {/* Aviso: el flujo esperado */}
      <div style={{ margin: '0 14px 10px', background: T.primarySoft, border: '1px solid #D5D9FC', borderRadius: 12, padding: '9px 13px', fontSize: 12.5, fontWeight: 700, color: T.primary }}>
        {esVsl ? 'Lee el guion, grábalo y sube tu video al final.' : 'Graba los anuncios y súbelos todos juntos al final.'}
      </div>

      <main className="doc-sel" style={{ flex: 1, overflowY: 'auto', background: T.bg, padding: '0 14px 20px' }} onMouseUp={onDocMouseUp} onTouchEnd={onDocTouchEnd}>
        {isDemo() && <DemoBanner />}

        {/* Título del documento */}
        <div style={{ ...cardStyle, padding: '14px 16px', marginBottom: 12, borderLeft: `4px solid ${T.primary}` }}>
          <div style={microLabel(T.primary)}>{esVsl ? 'VSL' : 'Ads'}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: '-0.01em' }}>{esVsl ? 'VSL' : 'Anuncios'} · {data.funnel?.name}</div>
        </div>

        {secciones.length === 0 && (
          <div style={{ ...cardStyle, padding: 20, textAlign: 'center', color: T.text2, fontSize: 14 }}>
            Todavía no hay guiones de {esVsl ? 'VSL' : 'anuncios'} marcados para grabar en este embudo.
          </div>
        )}

        {secciones.map((s, i) => {
          const coms = topComs.filter((c) => (c.sectionId || c.section_id) === s.id);
          const html = marcarQuotes(textoAHtml(s.texto), coms, marking && marking.sectionId === s.id ? marking : null);
          return (
            <div key={s.id} style={{ ...cardStyle, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={microLabel(T.primary)}>{esVsl ? 'VSL' : `Anuncio ${i + 1}`}</span>
                <span style={{ flex: 1, height: 1, background: '#EDEFF5' }} />
                {s.grabado && <span style={pill(T.greenSoft, T.green)}><Check size={10} strokeWidth={3} />Grabado</span>}
              </div>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: T.ink, marginBottom: 4 }}>{s.titulo}</div>
              <div data-secid={s.id} dangerouslySetInnerHTML={{ __html: html }} />
              {/* Comentarios de esta sección (los tuyos y los del equipo) */}
              {coms.map((c) => (
                <div key={c.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#F7F8FC', border: `1px solid ${T.border}`, borderRadius: 12, padding: '9px 12px', marginTop: 9 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 999, background: c.isTeam ? T.ink : T.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
                    {c.isCliente ? 'Yo' : String(c.authorName || 'K')[0].toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: T.text, lineHeight: 1.45 }}>{c.body}</div>
                    {comentarios.filter((r) => r.parentId === c.id).map((r) => (
                      <div key={r.id} style={{ fontSize: 12.5, color: T.text2, marginTop: 5, paddingLeft: 8, borderLeft: `2px solid ${T.border}` }}>
                        <b style={{ color: c.isTeam ? T.primary : T.ink }}>{r.isTeam ? 'Equipo' : r.authorName}:</b> {r.body}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => { setComposer({ sectionId: s.id, parentId: c.id, quote: null }); setDraft(''); }} title="Responder" style={{ border: 'none', background: 'none', cursor: 'pointer', color: T.primary, padding: 2, flexShrink: 0 }}><MessageSquare size={14} /></button>
                </div>
              ))}
            </div>
          );
        })}

        {/* ── SUBIR LAS GRABACIONES (al final, todas juntas) ── */}
        {secciones.length > 0 && (
          <div style={{ ...cardStyle, padding: '16px 16px', marginTop: 18 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, marginBottom: 4 }}>
              {esVsl ? 'Tu video del VSL' : 'Ya los grabé, los subo'}
            </div>
            <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.5, marginBottom: 10 }}>
              {esVsl
                ? 'Un solo video. Si te equivocas, sube la toma nueva y usamos la última.'
                : 'Todos tus videos van aquí. No importa el orden: los identificamos nosotros.'}
            </div>
            {!esVsl && (
              <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.7, marginBottom: 10 }}>
                • Vertical, con el celular quieto y buena luz<br />
                • Un video por anuncio, de una sola toma<br />
                • No los edites ni les pongas música
              </div>
            )}
            {!esVsl && avatars.length > 1 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ ...microLabel(), marginBottom: 6 }}>¿De qué avatar son estos videos?</div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {avatars.map((a) => (
                    <button key={a.id} onClick={() => setAvatarSel(a.id)} style={{ border: `1.5px solid ${avatarActivo === a.id ? T.primary : T.border}`, background: avatarActivo === a.id ? T.primarySoft : '#fff', color: avatarActivo === a.id ? T.primary : T.text2, borderRadius: 999, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{a.name}</button>
                  ))}
                </div>
              </div>
            )}
            <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, borderRadius: 14, border: `2px dashed ${T.primary}55`, background: T.primarySoft, cursor: 'pointer', padding: '18px 14px', marginBottom: 10 }}>
              <input ref={inputRef} type="file" multiple={!esVsl} accept="video/*" onChange={onPick} style={{ display: 'none' }} />
              <UploadCloud size={26} color={T.primary} />
              <span style={{ fontSize: 15, fontWeight: 800, color: T.primary }}>{esVsl ? (subidosOk > 0 ? 'Subir otra toma' : 'Elige tu video') : 'Elige los videos del celular'}</span>
              {!esVsl && <span style={{ fontSize: 12, color: T.text2 }}>Puedes subirlos todos juntos</span>}
            </label>
            {subidas.map((u) => (
              <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', fontSize: 13, fontWeight: 600, color: T.text }}>
                {u.error ? <X size={14} color={T.red} /> : u.done ? <Check size={14} color={T.green} strokeWidth={3} /> : <Loader2 size={13} color={T.primary} className="mk-spin" />}
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                {!u.done && !u.error && <span style={{ fontSize: 12, color: T.text3 }}>{u.pct}%</span>}
              </div>
            ))}
            {(data.subidas?.items || []).map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', fontSize: 13, color: T.text2 }}>
                <Film size={14} color={T.text3} /><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo}</span>
                <span style={{ fontSize: 11.5, color: T.text3 }}>{it.fecha}</span>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              {subidosOk > 0
                ? <span style={pill(T.greenSoft, T.green)}><Check size={10} strokeWidth={3} />{esVsl ? 'Listo' : `${subidosOk} ${subidosOk === 1 ? 'video subido' : 'videos subidos'}`}</span>
                : <span style={pill(T.redSoft, T.red)}>Falta</span>}
            </div>
          </div>
        )}

        {/* SIGUIENTE */}
        {data.siguiente && (
          <button onClick={() => nav(`/documento/${data.siguiente.strategyId}/${data.siguiente.tipo}`)} style={{ ...bigBtn(T.ink), marginTop: 14 }}>
            Siguiente: {data.siguiente.label} <ChevronRight size={15} />
          </button>
        )}
      </main>

      <BottomNav dotGuiones={false} />

      {/* ☰ Cajón: la lista de guiones para saltar de documento */}
      {drawer && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(false); }} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,.45)', display: 'flex' }}>
          <div style={{ background: '#fff', height: '100%', width: 300, maxWidth: '86vw', overflowY: 'auto', padding: 14, boxShadow: '8px 0 30px rgba(10,22,40,.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: '1px solid #F0F2F5', marginBottom: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: T.ink }}>Guiones de tus embudos</span>
              <button onClick={() => setDrawer(false)} aria-label="Cerrar" style={{ ...hBtn, width: 32, height: 32 }}><X size={15} color={T.text2} /></button>
            </div>
            {(Array.isArray(funnels) ? funnels : []).filter((f) => (f.guionesTotal || 0) > 0).map((f) => (
              <div key={f.id} style={{ marginBottom: 10 }}>
                <div style={{ ...microLabel(), margin: '8px 2px 4px' }}>{f.name}</div>
                {['ads', 'vsl'].map((tp) => (
                  <button key={tp} onClick={() => { setDrawer(false); nav(`/documento/${f.id}/${tp}`); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 'none', borderRadius: 10, padding: '9px 10px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', background: f.id === sid && tp === (esVsl ? 'vsl' : 'ads') ? T.primarySoft : 'transparent', color: f.id === sid && tp === (esVsl ? 'vsl' : 'ads') ? T.primary : T.text }}>
                    {tp === 'vsl' ? 'VSL' : 'Anuncios (Ads)'}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botón flotante Comentar */}
      {selBtn && !composer && (
        <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }} onClick={() => { setComposer({ ...selBtn, parentId: null }); setDraft(''); setSelBtn(null); }}
          style={{ position: 'fixed', zIndex: 70, top: Math.max(60, selBtn.top), left: Math.min(Math.max(selBtn.left, 70), (typeof window !== 'undefined' ? window.innerWidth : 400) - 70), transform: 'translate(-50%,-130%)', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, border: 'none', background: T.ink, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 24px rgba(10,22,40,.3)' }}>
          <MessageSquare size={14} />Comentar
        </button>
      )}

      {/* Caja de comentario (hoja pegada abajo: el teclado no la tapa) */}
      {composer && (
        <div onMouseDown={(e) => e.stopPropagation()} style={{ position: 'fixed', left: 8, right: 8, bottom: 8, zIndex: 71, background: '#fff', border: `1px solid ${T.border}`, borderRadius: 18, padding: 14, boxShadow: '0 -8px 40px rgba(10,22,40,.2)' }}>
          {composer.quote && <div style={{ fontSize: 12, color: '#8A6D2B', borderLeft: '2px solid #EAB308', paddingLeft: 8, marginBottom: 8, fontStyle: 'italic' }}>“{composer.quote.slice(0, 140)}{composer.quote.length > 140 ? '…' : ''}”</div>}
          {composer.parentId && <div style={{ ...microLabel(T.primary), marginBottom: 6 }}>Respondiendo</div>}
          <textarea value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} rows={3}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviarComentario(); } if (e.key === 'Escape') { setComposer(null); setDraft(''); } }}
            placeholder="Escribe tu nota… (sin miedo, el texto original no se toca)"
            style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: 12, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: T.ink, outline: 'none', resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button onClick={() => { setComposer(null); setDraft(''); }} style={{ border: `1px solid ${T.border}`, background: '#fff', color: T.text2, borderRadius: 999, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={enviarComentario} disabled={enviando || !draft.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: T.primary, color: '#fff', borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: enviando || !draft.trim() ? 0.6 : 1 }}>
              {enviando ? <Loader2 size={13} className="mk-spin" /> : <Send size={13} />}Comentar
            </button>
          </div>
        </div>
      )}
    </PhoneFrame>
  );
}

const hBtn = { width: 36, height: 36, borderRadius: 11, border: `1px solid #E8EAF0`, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 };
