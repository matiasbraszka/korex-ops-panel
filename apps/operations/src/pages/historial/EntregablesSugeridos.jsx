import { useMemo, useState, useEffect } from 'react';
import { T } from './tokens.js';
import { useViewport } from './useViewport.js';
import { useApp } from '../../context/AppContext';
import { getBullets, mondayOf, fmtDate, fmtDayShort } from '../../utils/helpers';

// Mapea el texto de un entregable a una de las categorías (tipos) configuradas.
// Devuelve siempre una key presente en `keys` (default 'entregable').
export function suggestTipo(text, keys = []) {
  const t = (text || '').toLowerCase();
  const has = (k) => keys.includes(k);
  if (has('metrica') && /\d/.test(t) && /%|cpl|cpm|ctr|roas|cpa|\$|usd|eur|\blead|registro|conversi|impresion|clicks?|gasto|spend|\bcac\b|\broi\b/.test(t)) return 'metrica';
  if (has('llamada') && /llamad|reuni[oó]n|\bcall\b|\bmeet|zoom/.test(t)) return 'llamada';
  if (has('Testimonio') && /testimoni|rese[ñn]a|\breview|caso de [eé]xito/.test(t)) return 'Testimonio';
  if (has('decision') && /decisi[oó]n|decidim|definim|se decidi|\bacord/.test(t)) return 'decision';
  if (has('Seguimiento') && /seguimiento|follow.?up|recordatori/.test(t)) return 'Seguimiento';
  return has('entregable') ? 'entregable' : (keys[0] || 'entregable');
}

// Extrae URLs sueltas del texto y las devuelve como links [{ url }].
export function extractUrls(text) {
  const re = /(https?:\/\/[^\s)]+)|(\bwww\.[^\s)]+)/gi;
  const found = (text || '').match(re) || [];
  return found.map((u) => ({ url: /^https?:\/\//i.test(u) ? u : 'https://' + u }));
}

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function shortTitle(text, n = 70) {
  const t = (text || '').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > 40 ? cut.slice(0, sp) : cut) + '…';
}

function weekLabel(monday) {
  if (!monday) return '';
  const [y, m, d] = monday.split('-').map(Number);
  const end = new Date(y, m - 1, d + 6);
  const pad = (n) => String(n).padStart(2, '0');
  const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  return `${fmtDate(monday)} – ${fmtDate(endStr)}`;
}

/**
 * Panel de entregables sugeridos: lista los bullets `entregable` que el equipo
 * reportó (informes diarios + semanales) para este cliente, agrupados por semana.
 * - onPick(suggestion): llena el formulario de la derecha (uno por uno).
 * - onSaveMany(eventos): crea varios de una (multi-selección).
 */
export function EntregablesSugeridos({
  open, clienteId, onPick, onSaveMany, eventosExistentes,
  faseActual, currentUser, tipos = [],
}) {
  const vp = useViewport();
  const { teamReports, teamMembers } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [week, setWeek] = useState('');

  const tipoKeys = useMemo(() => tipos.map((t) => t.key), [tipos]);
  const tipoByKey = useMemo(() => Object.fromEntries(tipos.map((t) => [t.key, t])), [tipos]);

  const memberById = useMemo(() => {
    const m = {};
    (teamMembers || []).forEach((x) => { m[x.id] = x; });
    return m;
  }, [teamMembers]);

  // Entregables del cliente, deduplicados por texto (prefiere el diario, fecha más temprana).
  const suggestions = useMemo(() => {
    if (!clienteId) return [];
    const map = new Map();
    (teamReports || []).forEach((r) => {
      if (!r?.report_date) return;
      (r.progress_by_client || []).forEach((p) => {
        if (p.client_id !== clienteId) return;
        getBullets(p).forEach((b) => {
          if (b.category !== 'entregable') return;
          const text = (b.text || '').trim();
          if (!text) return;
          const key = norm(text);
          const cand = {
            key, text,
            date: r.report_date,
            weekly: r.report_type === 'weekly',
            author: memberById[r.user_id]?.name || '',
            monday: mondayOf(r.report_date),
          };
          const ex = map.get(key);
          if (!ex) { map.set(key, cand); return; }
          if (ex.weekly && !cand.weekly) { map.set(key, cand); return; }
          if (ex.weekly === cand.weekly && cand.date < ex.date) map.set(key, cand);
        });
      });
    });
    return Array.from(map.values());
  }, [teamReports, clienteId, memberById]);

  // Entregables ya cargados en el historial (por texto) → para atenuarlos.
  const loadedSet = useMemo(() => {
    const s = new Set();
    (eventosExistentes || []).forEach((e) => {
      if (e?.descripcion) s.add(norm(e.descripcion));
      if (e?.titulo) s.add(norm(e.titulo));
    });
    return s;
  }, [eventosExistentes]);
  const isLoaded = (s) => loadedSet.has(s.key) || loadedSet.has(norm(shortTitle(s.text)));

  const weeks = useMemo(() => {
    const set = new Set(suggestions.map((s) => s.monday));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [suggestions]);

  // Default: la semana más reciente con entregables.
  useEffect(() => {
    if (weeks.length && week !== '__all__' && !weeks.includes(week)) setWeek(weeks[0]);
  }, [weeks]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const arr = week === '__all__' ? suggestions : suggestions.filter((s) => s.monday === week);
    return arr.slice().sort((a, b) => {
      const la = isLoaded(a) ? 1 : 0, lb = isLoaded(b) ? 1 : 0;
      if (la !== lb) return la - lb;
      return (b.date || '').localeCompare(a.date || '');
    });
  }, [suggestions, week, loadedSet]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSel = (key) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  const buildEvento = (s) => ({
    tipo: suggestTipo(s.text, tipoKeys),
    titulo: shortTitle(s.text),
    descripcion: s.text,
    fase: faseActual || '',
    tiempo: 0,
    responsable: 'Korex',
    estado: 'completado',
    links: extractUrls(s.text),
    incluirResumen: true,
    fecha: s.date,
    hora: '',
    autor: currentUser?.name || '',
    autorUser: currentUser ? {
      id: currentUser.id, name: currentUser.name,
      avatar_url: currentUser.avatar || '', color: currentUser.color || '#5B7CF5',
      initials: currentUser.initials || '',
    } : null,
  });

  const handleBatch = () => {
    const chosen = list.filter((s) => selected.has(s.key) && !isLoaded(s));
    if (!chosen.length) return;
    onSaveMany && onSaveMany(chosen.map(buildEvento));
    setSelected(new Set());
  };

  const selCount = list.filter((s) => selected.has(s.key) && !isLoaded(s)).length;
  const total = suggestions.length;

  // ── Contenido (lista) reutilizable en desktop y mobile ──
  const body = (
    <>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.text3, textTransform: 'uppercase' }}>
          Entregables del equipo
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginTop: 2 }}>
          Cargar al historial
        </div>
        <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
          De los informes diarios y semanales · {total} en total
        </div>
        {weeks.length > 0 && (
          <select
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            style={{
              width: '100%', marginTop: 10, background: '#fff', border: `1px solid ${T.border}`,
              borderRadius: 8, padding: '8px 10px', fontSize: 12, color: T.text,
              fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
            }}
          >
            {weeks.map((m) => (
              <option key={m} value={m}>Semana {weekLabel(m)}</option>
            ))}
            <option value="__all__">Todas las semanas</option>
          </select>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {list.length === 0 ? (
          <div style={{ textAlign: 'center', color: T.text3, fontSize: 12, padding: '32px 8px' }}>
            {total === 0
              ? 'No hay entregables reportados por el equipo para este cliente todavía.'
              : 'Sin entregables en la semana seleccionada.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map((s) => {
              const loaded = isLoaded(s);
              const tk = suggestTipo(s.text, tipoKeys);
              const tinfo = tipoByKey[tk] || { label: tk, color: T.green, bg: T.greenBg, dot: '◆' };
              const checked = selected.has(s.key);
              return (
                <div key={s.key} style={{
                  border: `1px solid ${checked ? T.blue : T.border}`,
                  background: loaded ? T.bg : '#fff',
                  borderRadius: 10, padding: '10px 12px', opacity: loaded ? 0.6 : 1,
                  transition: 'border 0.12s, opacity 0.12s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    {!loaded && (
                      <input
                        type="checkbox" checked={checked} onChange={() => toggleSel(s.key)}
                        style={{ accentColor: T.blue, width: 15, height: 15, marginTop: 2, cursor: 'pointer', flexShrink: 0 }}
                      />
                    )}
                    {loaded && (
                      <span style={{ color: T.green, fontSize: 13, marginTop: 1, flexShrink: 0 }} title="Ya cargado">✓</span>
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, color: T.text, lineHeight: 1.4 }}>{s.text}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: tinfo.color, background: tinfo.bg,
                          border: `1px solid ${tinfo.color}30`, borderRadius: 6, padding: '2px 6px',
                        }}>{tinfo.dot} {tinfo.label}</span>
                        <span style={{ fontSize: 10.5, color: T.text3 }}>{fmtDayShort(s.date)} {fmtDate(s.date)}</span>
                        {s.author && <span style={{ fontSize: 10.5, color: T.text3 }}>· {s.author}</span>}
                        {s.weekly && <span style={{ fontSize: 10.5, color: T.text3 }}>· semanal</span>}
                      </div>
                    </div>
                  </div>
                  {!loaded && (
                    <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={() => { onPick && onPick(s); if (vp.mobile) setMobileOpen(false); }} style={{
                        background: T.blueBg, border: `1px solid ${T.blue}30`, color: T.blue,
                        borderRadius: 7, padding: '5px 12px', fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>Usar →</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selCount > 0 && (
        <div style={{ padding: '12px 14px', borderTop: `1px solid ${T.border}`, background: T.bg }}>
          <button onClick={handleBatch} style={{
            width: '100%', background: T.blue, border: 'none', color: '#fff',
            borderRadius: 10, padding: '11px', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Agregar {selCount} al historial</button>
        </div>
      )}
    </>
  );

  // ── Mobile: botón flotante + hoja a pantalla completa ──
  if (vp.mobile) {
    if (!open) return null;
    return (
      <>
        <button onClick={() => setMobileOpen(true)} style={{
          position: 'fixed', left: 14, bottom: 14, zIndex: 52,
          background: T.blue, color: '#fff', border: 'none', borderRadius: 999,
          padding: '10px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(91,124,245,0.4)', fontFamily: 'inherit',
        }}>📋 Entregables{total ? ` (${total})` : ''}</button>
        {mobileOpen && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 60, background: '#fff',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 10px' }}>
              <button onClick={() => setMobileOpen(false)} style={{
                background: T.surface2, border: 'none', cursor: 'pointer', color: T.text2,
                fontSize: 16, width: 36, height: 36, borderRadius: 8,
              }}>✕</button>
            </div>
            {body}
          </div>
        )}
      </>
    );
  }

  // ── Desktop: panel fijo pegado a la izquierda del drawer ──
  return (
    <div style={{
      position: 'fixed', top: 0, bottom: 0, right: 'min(460px, 95vw)',
      width: 'min(400px, 42vw)', background: '#fff', borderLeft: `1px solid ${T.border}`,
      borderRight: `1px solid ${T.border}`, boxShadow: '-8px 0 24px rgba(0,0,0,0.06)',
      zIndex: 51, transform: open ? 'translateX(0)' : 'translateX(120%)',
      transition: 'transform 0.28s cubic-bezier(.4,0,.2,1)',
      display: 'flex', flexDirection: 'column',
    }}>
      {body}
    </div>
  );
}
