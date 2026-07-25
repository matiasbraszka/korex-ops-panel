import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PhoneFrame, { KxScreen } from '../components/PhoneFrame';
import BottomNav from '../components/BottomNav';
import { Loading, DemoBanner, Spinner, useAsync } from '../components/ui';
import { api, isDemo, uploadRecurso, simulateUpload } from '../data/portalApi';
import { T } from '../components/theme';
import { IcoChevL, IcoChevR, IcoMenu, IcoComment, IcoCheck, IcoX, IcoUpload, IcoInfo, IcoFile, IcoPlaySoft } from '../components/icons';

// DOCUMENTO — la pantalla central del portal, exacta al prototipo:
//  · Ads / VSL: se leen, se comentan seleccionando texto y AL FINAL se suben
//    las grabaciones todas juntas.
//  · Avatar / Estrategia: solo lectura (los otros documentos del embudo).
// Las tres rayitas (☰) abren el cajón con todos los guiones del embudo.

const DOCS = {
  ads: { eyebrow: 'ADS', accent: 'var(--mk-blue-ops)' },
  vsl: { eyebrow: 'VSL', accent: 'var(--mk-green)' },
  avatar: { eyebrow: 'AVATARES', accent: 'var(--mk-orange)' },
  estrategia: { eyebrow: 'ESTRATEGIA', accent: 'var(--mk-purple)' },
};

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
  return html || '<p class="doc-p" style="color:var(--mk-text3);font-style:italic">Vacío</p>';
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

// Duración estimada de lectura (~2.4 palabras/seg), redondeada de a 5 segundos.
const segundos = (texto) => Math.max(15, Math.round(String(texto || '').split(/\s+/).filter(Boolean).length / 2.4 / 5) * 5);

let _uid = 0;

export default function DocumentoScreen() {
  const { sid, tipo } = useParams();
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.documento(sid, tipo), [sid, tipo]);

  const [drawer, setDrawer] = useState(false);
  const [selBtn, setSelBtn] = useState(null);     // {top,left,quote,sectionId}
  const [composer, setComposer] = useState(null); // {quote,sectionId,parentId?}
  const [draft, setDraft] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [localComs, setLocalComs] = useState([]);
  const [subidas, setSubidas] = useState([]);     // uploads en curso
  const [avatarSel, setAvatarSel] = useState(null);
  const scrollRef = useRef(null);
  const demo = isDemo();

  useEffect(() => { setLocalComs([]); setSubidas([]); setDrawer(false); scrollRef.current?.scrollTo?.(0, 0); }, [sid, tipo]);

  // Si vienen desde "Tus guiones para grabar", saltamos al guion exacto.
  const { state: navState } = useLocation();
  useEffect(() => {
    if (!loading && navState?.secId) {
      const t = setTimeout(() => {
        const el = scrollRef.current?.querySelector?.(`[data-secid="${navState.secId}"]`);
        el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      }, 150);
      return () => clearTimeout(t);
    }
  }, [loading, navState, sid, tipo]);

  if (loading) return <PhoneFrame><Loading label="Abriendo el documento…" /></PhoneFrame>;
  if (!data) return <PhoneFrame><div style={{ padding: 40, textAlign: 'center', color: T.text3 }}>No encontramos este documento.</div></PhoneFrame>;

  const doc = DOCS[data.tipo] || DOCS.ads;
  const esVsl = data.tipo === 'vsl';
  const esGuion = data.tipo === 'ads' || data.tipo === 'vsl';
  const secciones = Array.isArray(data.secciones) ? data.secciones : [];
  const comentarios = [...(Array.isArray(data.comentarios) ? data.comentarios : []), ...localComs];
  const topComs = comentarios.filter((c) => !c.parentId);
  const avatars = Array.isArray(data.avatars) ? data.avatars : [];
  const avatarActivo = avatarSel || avatars[0]?.id || 'general';
  const subidosOk = (data.subidas?.count || 0) + subidas.filter((u) => u.done).length;
  const listos = subidosOk > 0;
  const docs = data.docs || {};
  const otros = Array.isArray(data.otros) ? data.otros : [];
  const titulo = data.titulo
    || (data.tipo === 'ads' ? `Anuncios — ${data.funnel?.name || ''}`
      : data.tipo === 'vsl' ? `VSL — ${data.funnel?.name || ''}`
      : data.tipo === 'avatar' ? (secciones[0]?.titulo || 'Avatares')
      : `Embudo ${data.funnel?.name || ''}`);

  // ── Comentar: selección de texto → botón flotante → caja abajo ──
  const onDocMouseUp = () => {
    if (!esGuion && data.tipo !== 'avatar' && data.tipo !== 'estrategia') return;
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

  // Comentarios inline de una sección (tarjeta "Yo" del prototipo).
  const comsDe = (sec) => topComs.filter((c) => (c.sectionId || c.section_id) === sec.id).map((c) => (
    <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: 'var(--mk-bg-panel)', border: '1px solid #EEF0F4', borderRadius: 12, padding: '10px 12px', margin: '0 0 14px' }}>
      <div style={{ width: 24, height: 24, borderRadius: 99, background: c.isTeam ? 'var(--mk-ink)' : 'var(--mk-blue)', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {c.isCliente ? 'Yo' : String(c.authorName || 'K')[0].toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.45, color: T.text2 }}>{c.body}</div>
        {comentarios.filter((r) => r.parentId === c.id).map((r) => (
          <div key={r.id} style={{ fontSize: 12, color: T.text2, marginTop: 5, paddingLeft: 8, borderLeft: '2px solid var(--mk-border)' }}>
            <b style={{ color: r.isTeam ? T.primary : T.ink }}>{r.isTeam ? 'Equipo' : r.authorName}:</b> {r.body}
          </div>
        ))}
      </div>
      <div onClick={() => { setComposer({ sectionId: sec.id, parentId: c.id, quote: null }); setDraft(''); }} role="button" title="Responder" style={{ cursor: 'pointer', color: T.primary, padding: 2, flexShrink: 0, display: 'flex' }}>
        <IcoComment size={14} stroke="currentColor" sw={2.2} />
      </div>
    </div>
  ));

  return (
    <PhoneFrame>
      <KxScreen style={{ overflow: 'hidden', background: 'var(--mk-bg-panel)' }}>
        <style>{`
          .doc-label{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--mk-text3);margin:0 0 4px}
          .doc-p{font-size:15px;line-height:1.62;color:var(--mk-text-soft);margin:0 0 14px}
          mark[data-cmt]{background:rgba(234,179,8,.28);border-bottom:2px solid var(--mk-yellow);border-radius:2px;color:inherit;padding:0}
          mark.marcando{background:var(--mk-blue-bg);border-radius:2px;color:inherit;padding:0}
          .doc-sel,.doc-sel *{user-select:text!important;-webkit-user-select:text!important}
        `}</style>

        {/* Header del documento (exacto al prototipo) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 10px', background: '#fff', borderBottom: '1px solid var(--mk-border)', flex: 'none' }}>
          <div onClick={() => nav('/')} role="button" aria-label="Volver" style={{ cursor: 'pointer', width: 34, height: 34, borderRadius: 9, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <IcoChevL size={18} stroke="var(--mk-blue-ops)" sw={2.4} />
          </div>
          <div onClick={() => setDrawer(true)} role="button" aria-label="Lista de guiones" style={{ cursor: 'pointer', width: 34, height: 34, borderRadius: 9, border: '1px solid var(--mk-border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <IcoMenu size={17} stroke="var(--mk-text-soft)" sw={2.2} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', color: doc.accent }}>{doc.eyebrow}</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titulo}</div>
          </div>
          <div style={{ display: 'flex', background: T.surface2, borderRadius: 999, padding: 3, gap: 2, flex: 'none' }}>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '5px 13px', borderRadius: 999, background: '#fff', color: T.primary, boxShadow: '0 1px 2px rgba(10,22,40,.08)' }}>Leer</span>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '5px 13px', borderRadius: 999, color: T.text2 }}>Editar</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, border: '1px solid var(--mk-border)', background: '#fff', color: T.textSoft, fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 999, flex: 'none' }}>
            <IcoComment size={14} stroke="currentColor" sw={2} />
            {topComs.length}
          </div>
        </div>

        <div ref={scrollRef} className="kxs doc-sel" style={{ flex: 1, overflowY: 'auto', padding: '0 0 20px' }} onMouseUp={onDocMouseUp} onTouchEnd={onDocTouchEnd}>
          {isDemo() && <div style={{ padding: '10px 14px 0' }}><DemoBanner /></div>}

          {/* Aviso del flujo (solo guiones) */}
          {esGuion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--mk-blue-bg2)', borderBottom: '1px solid var(--mk-border)' }}>
              <IcoInfo size={15} stroke="var(--mk-blue-ops)" sw={2.2} style={{ flex: 'none' }} />
              <span style={{ fontSize: 12.5, fontWeight: 600, color: T.primaryInk }}>
                {esVsl ? 'Lee el guion, grábalo y sube tu video al final' : 'Graba los anuncios y súbelos todos juntos al final'}
              </span>
            </div>
          )}

          <div style={{ padding: '16px 16px 0' }}>
            {/* Encabezado del documento */}
            <div style={{ borderLeft: `3px solid ${doc.accent}`, paddingLeft: 12, marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: doc.accent, marginBottom: 3 }}>{doc.eyebrow}</div>
              <div style={{ fontSize: 19, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>{titulo}</div>
            </div>

            {secciones.length === 0 && (
              <div style={{ background: '#fff', borderRadius: 18, padding: 20, textAlign: 'center', color: T.text2, fontSize: 14, boxShadow: 'var(--shadow-md)' }}>
                {esGuion
                  ? <>Todavía no hay guiones de {esVsl ? 'VSL' : 'anuncios'} marcados para grabar en este embudo.</>
                  : <>Este documento todavía no tiene contenido.</>}
              </div>
            )}

            {/* Secciones */}
            <div style={{ fontSize: 15, lineHeight: 1.62, color: T.textSoft }}>
              {secciones.map((s, i) => {
                const coms = topComs.filter((c) => (c.sectionId || c.section_id) === s.id);
                const html = marcarQuotes(textoAHtml(s.texto), coms, marking && marking.sectionId === s.id ? marking : null);
                return (
                  <div key={s.id}>
                    {data.tipo === 'ads' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: T.primaryInk }}>ANUNCIO {i + 1}</span>
                        <span style={{ height: 1, flex: 1, background: 'var(--mk-border)' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>~{segundos(s.texto)} seg</span>
                      </div>
                    )}
                    {(data.tipo === 'ads' || (data.tipo !== 'ads' && secciones.length > 1)) && (
                      <div style={{ fontSize: 16, fontWeight: 800, color: T.text, letterSpacing: '-0.01em', marginBottom: 12 }}>
                        {s.titulo}{esGuion && s.grabado ? '  ✓' : ''}
                      </div>
                    )}
                    <div data-secid={s.id} dangerouslySetInnerHTML={{ __html: html }} />
                    {comsDe(s)}
                    <div style={{ height: 10 }} />
                  </div>
                );
              })}
            </div>

            {/* ── SUBIR LAS GRABACIONES (solo guiones, al final, todas juntas) ── */}
            {esGuion && secciones.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid var(--mk-border)', borderRadius: 18, overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}>
                <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #EEF0F4' }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, letterSpacing: '-0.02em', marginBottom: 4 }}>
                    {esVsl ? 'Tu video del VSL' : 'Ya los grabé, los subo'}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: T.text2 }}>
                    {esVsl
                      ? 'Un solo video. Si te equivocas, sube la toma nueva y usamos la última.'
                      : 'Todos tus videos van aquí. No importa el orden: los identificamos nosotros.'}
                  </div>
                </div>

                {!esVsl && (
                  <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9, borderBottom: '1px solid #EEF0F4' }}>
                    <ReglaFila ok texto="Vertical, con el celular quieto y buena luz" />
                    <ReglaFila ok texto="Un video por anuncio, de una sola toma" />
                    <ReglaFila texto="No los edites ni les pongas música" />
                  </div>
                )}

                <div style={{ padding: esVsl ? '12px 12px 16px' : 16 }}>
                  {/* Archivos ya subidos (VSL: fila con miniatura y chip LISTO) */}
                  {esVsl && (data.subidas?.items || []).map((it, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 6px' }}>
                      <div style={{ width: 44, height: 56, borderRadius: 10, background: '#E4E8EF', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IcoPlaySoft size={18} stroke="var(--mk-text3)" sw={2} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: T.textSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.titulo}</span>
                        <span style={{ fontSize: 12, color: T.text3 }}>subido el {it.fecha}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--mk-green)', background: 'var(--mk-green-bg)', padding: '5px 10px', borderRadius: 999 }}>LISTO</span>
                    </div>
                  ))}
                  {esVsl && subidas.map((u) => (
                    <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 6px' }}>
                      <div style={{ width: 44, height: 56, borderRadius: 10, background: '#E4E8EF', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {u.done ? <IcoCheck size={18} stroke="var(--mk-green)" sw={2.4} /> : u.error ? <IcoX size={16} stroke="var(--mk-red)" sw={2.4} /> : <Spinner size={16} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: T.textSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                        {!u.done && !u.error && <span style={{ fontSize: 12, color: T.text3 }}>{u.pct}%</span>}
                      </div>
                      {u.done && <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--mk-green)', background: 'var(--mk-green-bg)', padding: '5px 10px', borderRadius: 999 }}>LISTO</span>}
                    </div>
                  ))}

                  {/* Uploader */}
                  {esVsl && listos ? (
                    <>
                      <div style={{ height: 1, background: '#EEF0F4', margin: '6px 0 14px' }} />
                      <label style={{ height: 46, borderRadius: 999, border: '1px solid var(--mk-border)', background: '#fff', color: T.textSoft, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer' }}>
                        <input type="file" accept="video/*" onChange={onPick} style={{ display: 'none' }} />
                        <IcoUpload size={17} stroke="var(--mk-text-soft)" sw={2.2} />
                        Subir otra toma
                      </label>
                    </>
                  ) : !listos ? (
                    <label style={{ display: 'flex', border: '2px dashed #C3CFEF', borderRadius: 14, padding: '22px 16px', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'var(--mk-blue-bg2)', cursor: 'pointer', margin: esVsl ? '4px 4px 0' : 0 }}>
                      <input type="file" multiple={!esVsl} accept="video/*" onChange={onPick} style={{ display: 'none' }} />
                      <div style={{ width: 46, height: 46, borderRadius: 999, background: T.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IcoUpload size={22} stroke="#fff" sw={2.4} />
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, textAlign: 'center' }}>{esVsl ? 'Elige tu video del celular' : 'Elige los videos del celular'}</div>
                      <div style={{ fontSize: 12.5, color: T.text2, textAlign: 'center', lineHeight: 1.45 }}>{esVsl ? 'Un solo video, de la toma que más te gustó' : 'Puedes subirlos todos juntos'}</div>
                    </label>
                  ) : (
                    <div style={{ borderRadius: 14, padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 13, background: 'var(--mk-green-bg)', animation: 'kxUp .3s ease' }}>
                      <div style={{ width: 40, height: 40, flex: 'none', borderRadius: 999, background: 'var(--mk-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IcoCheck size={20} stroke="#fff" sw={2.8} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>Recibimos tus videos</div>
                        <div style={{ fontSize: 12.5, lineHeight: 1.45, color: T.textSoft }}>Los editamos y te los mostramos aquí.</div>
                      </div>
                    </div>
                  )}

                  {/* Ads: subidas en curso + estado */}
                  {!esVsl && listos && (
                    <label style={{ marginTop: 10, height: 46, borderRadius: 999, border: '1px solid var(--mk-border)', background: '#fff', color: T.textSoft, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer' }}>
                      <input type="file" multiple accept="video/*" onChange={onPick} style={{ display: 'none' }} />
                      <IcoUpload size={17} stroke="var(--mk-text-soft)" sw={2.2} />
                      Subir más videos
                    </label>
                  )}
                  {!esVsl && subidas.map((u) => (
                    <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 2px 0', fontSize: 13, fontWeight: 600, color: T.text }}>
                      {u.error ? <IcoX size={14} stroke="var(--mk-red)" sw={2.4} /> : u.done ? <IcoCheck size={14} stroke="var(--mk-green)" sw={2.8} /> : <Spinner size={13} />}
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                      {!u.done && !u.error && <span style={{ fontSize: 12, color: T.text3 }}>{u.pct}%</span>}
                    </div>
                  ))}
                  {!esVsl && avatars.length > 1 && !listos && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.text3, marginBottom: 6 }}>¿De qué avatar son estos videos?</div>
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                        {avatars.map((a) => (
                          <div key={a.id} onClick={() => setAvatarSel(a.id)} role="button" style={{ cursor: 'pointer', border: `1.5px solid ${avatarActivo === a.id ? 'var(--mk-blue-ops)' : 'var(--mk-border)'}`, background: avatarActivo === a.id ? 'var(--mk-blue-bg)' : '#fff', color: avatarActivo === a.id ? T.primary : T.text2, borderRadius: 999, padding: '7px 13px', fontSize: 12.5, fontWeight: 700 }}>{a.name}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!esVsl && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 12, padding: '11px 13px', background: 'var(--mk-bg-panel)', borderRadius: 12 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: T.textSoft, flex: 1 }}>
                        {listos ? (subidosOk === 1 ? '1 video recibido' : `${subidosOk} videos recibidos`) : 'Todavía no subiste ninguno'}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: '#fff', background: listos ? 'var(--mk-green)' : 'var(--mk-red)', padding: '5px 10px', borderRadius: 999 }}>
                        {listos ? 'LISTO' : 'FALTA'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SIGUIENTE */}
            {data.siguiente && (
              <div onClick={() => nav(`/documento/${data.siguiente.strategyId}/${data.siguiente.tipo}`)} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '22px 10px 6px' }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.primary }}>Siguiente: {data.siguiente.label}</span>
                <IcoChevR size={15} stroke="var(--mk-blue-ops)" sw={2.4} />
              </div>
            )}
          </div>
        </div>

        <BottomNav activeOverride="/guiones" />

        {/* ☰ Cajón: los guiones del embudo (overlay + panel animados) */}
        {drawer && (
          <>
            <div onClick={() => setDrawer(false)} style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(10,22,40,.35)', animation: 'kxFade .2s ease' }} />
            <div data-kx-drawer="" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 41, width: '82%', background: '#fff', boxShadow: '6px 0 30px rgba(10,22,40,.18)', padding: '18px 10px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', animation: 'kxDrawer .26s cubic-bezier(.4,0,.2,1)' }}>
              <div onClick={() => nav('/')} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 12px' }}>
                <IcoChevL size={16} stroke="var(--mk-blue-ops)" sw={2.4} />
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.primary }}>Volver al portal</span>
              </div>
              <div style={{ height: 1, background: 'var(--mk-border)', margin: '0 8px 12px' }} />

              {/* El embudo ACTUAL, en su caja: se ve clarito de qué embudo son estos guiones */}
              <div style={{ margin: '0 4px', background: 'var(--mk-blue-bg2)', border: '1px solid var(--mk-border)', borderRadius: 14, padding: '10px 6px 6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 8px 8px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: 'var(--mk-blue-ops)', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: T.primaryInk, textTransform: 'uppercase' }}>Estás en: {data.funnel?.name}</span>
                </div>
                <FilaDoc dot="var(--mk-blue-ops)" nombre={docs.ads?.titulo || 'Anuncios'} activo={data.tipo === 'ads'}
                  derecha={docs.ads?.pendiente ? 'por_grabar' : docs.ads?.listo ? 'check' : null}
                  onClick={() => { setDrawer(false); nav(`/documento/${sid}/ads`); }} />
                <FilaDoc dot="var(--mk-green)" nombre={docs.vsl?.titulo || 'VSL'} activo={data.tipo === 'vsl'}
                  derecha={docs.vsl?.pendiente ? 'por_grabar' : docs.vsl?.listo ? 'check' : null}
                  onClick={() => { setDrawer(false); nav(`/documento/${sid}/vsl`); }} />
                {docs.avatar?.existe !== false && (
                  <FilaDoc dot="var(--mk-orange)" nombre={docs.avatar?.titulo || 'Avatares'} activo={data.tipo === 'avatar'}
                    onClick={() => { setDrawer(false); nav(`/documento/${sid}/avatar`); }} />
                )}
                {docs.estrategia?.existe !== false && (
                  <FilaDoc dot="var(--mk-purple)" nombre="Estrategia del embudo" activo={data.tipo === 'estrategia'}
                    onClick={() => { setDrawer(false); nav(`/documento/${sid}/estrategia`); }} />
                )}
              </div>

              {otros.length > 0 && (
                <>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', color: T.text3, padding: '16px 8px 2px', textTransform: 'uppercase' }}>OTROS EMBUDOS</div>
                  <div style={{ fontSize: 11, color: T.text3, padding: '0 8px 6px' }}>Toca uno para abrir sus guiones.</div>
                  {otros.map((f) => (
                    <div key={f.id} onClick={() => { setDrawer(false); nav(`/documento/${f.id}/ads`); }} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 10px', margin: '0 4px', borderRadius: 10, border: '1px solid transparent' }}>
                      <IcoFile size={15} stroke="var(--mk-text3)" sw={1.9} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.text2 }}>{f.name}</span>
                      <IcoChevR size={14} stroke="var(--mk-text3)" sw={2.2} />
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}

        {/* Botón flotante Comentar (estilo del prototipo) */}
        {selBtn && !composer && (
          <div onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }} onClick={() => { setComposer({ ...selBtn, parentId: null }); setDraft(''); setSelBtn(null); }} role="button"
            style={{ position: 'fixed', zIndex: 70, top: Math.max(60, selBtn.top), left: Math.min(Math.max(selBtn.left, 70), (typeof window !== 'undefined' ? window.innerWidth : 400) - 70), transform: 'translate(-50%,-130%)', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, background: 'var(--mk-blue-ops)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--shadow-md)' }}>
            <IcoComment size={13} stroke="currentColor" sw={2.2} />
            Comentar
          </div>
        )}

        {/* Caja de comentario (hoja pegada abajo: el teclado no la tapa) */}
        {composer && (
          <div onMouseDown={(e) => e.stopPropagation()} style={{ position: 'fixed', left: 8, right: 8, bottom: 8, zIndex: 71, background: '#fff', border: '1px solid var(--mk-border)', borderRadius: 18, padding: 14, boxShadow: '0 -8px 40px rgba(10,22,40,.2)', maxWidth: 560, margin: '0 auto' }}>
            {composer.quote && <div style={{ fontSize: 12, color: '#8A6D2B', borderLeft: '2px solid var(--mk-yellow)', paddingLeft: 8, marginBottom: 8, fontStyle: 'italic' }}>“{composer.quote.slice(0, 140)}{composer.quote.length > 140 ? '…' : ''}”</div>}
            {composer.parentId && <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.primary, marginBottom: 6 }}>Respondiendo</div>}
            <textarea value={draft} autoFocus onChange={(e) => setDraft(e.target.value)} rows={3}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviarComentario(); } if (e.key === 'Escape') { setComposer(null); setDraft(''); } }}
              placeholder="Escribe tu nota… (sin miedo, el texto original no se toca)"
              style={{ width: '100%', border: '1px solid var(--mk-border)', borderRadius: 12, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', color: T.ink, outline: 'none', resize: 'vertical' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <button onClick={() => { setComposer(null); setDraft(''); }} style={{ border: '1px solid var(--mk-border)', background: '#fff', color: T.text2, borderRadius: 999, padding: '9px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={enviarComentario} disabled={enviando || !draft.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'var(--mk-blue-ops)', color: '#fff', borderRadius: 999, padding: '9px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: enviando || !draft.trim() ? 0.6 : 1 }}>
                {enviando ? <Spinner size={13} color="#fff" /> : <IcoComment size={13} stroke="currentColor" sw={2.2} />}Comentar
              </button>
            </div>
          </div>
        )}
      </KxScreen>
    </PhoneFrame>
  );
}

function ReglaFila({ ok = false, texto }) {
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
      {ok
        ? <IcoCheck size={17} stroke="var(--mk-green)" sw={2.4} style={{ flex: 'none', marginTop: 2 }} />
        : <IcoX size={17} stroke="var(--mk-red)" sw={2.4} style={{ flex: 'none', marginTop: 2 }} />}
      <span style={{ fontSize: 13.5, lineHeight: 1.5, color: ok ? T.textSoft : T.text2 }}>{texto}</span>
    </div>
  );
}

function FilaDoc({ dot, nombre, activo, derecha, onClick }) {
  return (
    <div onClick={onClick} role="button" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 10px', borderRadius: 10, background: activo ? '#fff' : 'transparent', boxShadow: activo ? 'var(--shadow-sm)' : 'none' }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: dot, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
      {derecha === 'por_grabar' && (
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: '#fff', background: 'var(--mk-red)', padding: '4px 8px', borderRadius: 999 }}>POR GRABAR</span>
      )}
      {derecha === 'check' && <IcoCheck size={16} stroke="var(--mk-green)" sw={2.6} />}
    </div>
  );
}
