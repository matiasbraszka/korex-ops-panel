import { useEffect, useState, useMemo, useCallback } from 'react';
import { sbFetch } from '@korex/db';
import TagSelect from '../components/TagSelect.jsx';
import EditableCell from '../components/EditableCell.jsx';
import { Search, AddButton, Msg } from '../components/bits.jsx';
import { useOptions } from '../lib/options.js';
import { money, money2, fdate, catChip, catColor } from '../lib/format.js';

// Egresos (diseño Claude Design): tabla editable con conciliación bancaria
// (Mercury / Kraken), categorías como etiquetas y alta inline.
const numE = (x) => { const n = parseFloat(String(x).replace(',', '.')); return isFinite(n) ? n : null; };
const todayE = () => new Date().toISOString().slice(0, 10);
const inp = { width: '100%', border: '1px solid #99E6E3', borderRadius: 6, padding: '5px 6px', fontSize: 11, outline: 'none', background: '#fff' };

export default function EgresosPage() {
  const [rows, setRows] = useState(null);
  const [reconMap, setReconMap] = useState({});
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [hover, setHover] = useState(null);
  const [nf, setNf] = useState(null);
  const [busy, setBusy] = useState(false);
  const setF = (k, v) => setNf((s) => ({ ...s, [k]: v }));
  const catOpts = useOptions('categoria_egreso');

  const load = useCallback(() => {
    sbFetch('fin_expenses?select=id,expense_date,category,reason,detail,project,paid_by,amount,amount_eur&order=expense_date.desc.nullslast&limit=6000')
      .then((d) => setRows(Array.isArray(d) ? d : [])).catch((e) => setError(String(e)));
    sbFetch('fin_expense_recon?select=expense_id,source,ref_id,amount,dt,who,category,confidence&limit=6000')
      .then((d) => { const m = {}; (Array.isArray(d) ? d : []).forEach((r) => { m[r.expense_id] = r; }); setReconMap(m); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const patchExpense = (id, body) => {
    setRows((rs) => (rs || []).map((r) => (r.id === id ? { ...r, ...body } : r)));
    sbFetch(`fin_expenses?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(body) }).catch(() => load());
  };
  const startAdd = () => setNf({ expense_date: todayE(), amount: '', amount_eur: '', category: 'Herramientas', reason: '', detail: '', project: '', paid_by: '' });
  const saveNew = async () => {
    if (!nf.amount) return;
    setBusy(true);
    try {
      await sbFetch('fin_expenses', {
        method: 'POST', headers: { Prefer: 'return=minimal' }, throwOnError: true,
        body: JSON.stringify({ expense_date: nf.expense_date || null, month_date: nf.expense_date ? nf.expense_date.slice(0, 7) + '-01' : null, amount: numE(nf.amount), amount_eur: numE(nf.amount_eur), currency: 'USD', category: nf.category || null, reason: (nf.reason || '').trim() || null, detail: (nf.detail || '').trim() || null, project: (nf.project || '').trim() || null, paid_by: (nf.paid_by || '').trim() || null, facturado: false }),
      });
      await sbFetch('rpc/fin_expense_recon_run', { method: 'POST', body: '{}' }).catch(() => {});
      setNf(null); setBusy(false); load();
    } catch { setBusy(false); }
  };

  const data = useMemo(() => (rows ? rows.map((r) => ({ ...r, recon: reconMap[r.id] })) : null), [rows, reconMap]);
  const cats = useMemo(() => (data ? [...new Set(data.map((r) => r.category).filter(Boolean))].sort() : []), [data]);
  const filtered = useMemo(() => {
    if (!data) return [];
    const qq = q.trim().toLowerCase();
    return data.filter((r) => (!qq || [r.reason, r.detail, r.project].some((x) => (x || '').toLowerCase().includes(qq))) && (!cat || r.category === cat));
  }, [data, q, cat]);

  const totals = useMemo(() => {
    const t = { usd: 0, eur: 0, byCat: {} };
    filtered.forEach((r) => { const u = Number(r.amount) || 0; t.usd += u; t.eur += Number(r.amount_eur) || 0; if (r.category) t.byCat[r.category] = (t.byCat[r.category] || 0) + u; });
    return t;
  }, [filtered]);

  if (error) return <Msg>Error cargando egresos: {error}</Msg>;
  if (!data) return <Msg>Cargando egresos…</Msg>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '16px 22px 0' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexShrink: 0, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <div style={{ background: '#FFF1F2', border: '1px solid #FBC9CF', borderLeft: '3px solid #e11d48', borderRadius: 12, padding: '11px 16px', minWidth: 170 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#e11d48' }}>Total egresos (US$)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#e11d48', marginTop: 3 }}>{money(totals.usd)}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, padding: '11px 16px', minWidth: 120 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8A93A2' }}>Registros</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 3 }}>{filtered.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, padding: '11px 16px', flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8A93A2', marginBottom: 7 }}>Por categoría</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {Object.entries(totals.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const [bg, fg] = catChip(k); return (
              <span key={k} style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: bg, color: fg }}>{k}: <b>{money(v)}</b></span>
            ); })}
            {!Object.keys(totals.byCat).length && <span style={{ fontSize: 12, color: '#9AA4B2' }}>—</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 11, flexShrink: 0 }}>
        <AddButton active={!!nf} label={nf ? 'Cancelar' : 'Nuevo egreso'} onClick={() => (nf ? setNf(null) : startAdd())} />
        <Search value={q} onChange={setQ} placeholder="Buscar motivo, detalle o proyecto…" />
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {[['', 'Todas'], ...cats.map((c) => [c, c])].map(([v, label]) => { const sel = cat === v; const [cbg, cfg] = catChip(v); return (
            <button key={v || 'all'} onClick={() => setCat(v)} style={{ border: `1px solid ${sel ? 'transparent' : '#E2E5EB'}`, background: sel ? (v ? cbg : '#0EA5A4') : '#fff', color: sel ? (v ? cfg : '#fff') : '#475569', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 20, cursor: 'pointer' }}>{label}</button>
          ); })}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#9AA4B2' }}>mostrando {filtered.length} de {data.length}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, boxShadow: '0 1px 3px rgba(13,17,23,.04)' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12.5, whiteSpace: 'nowrap' }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748B' }}>
            {['Fecha', 'Egreso €', 'Egreso US$', 'Banco', 'Categoría', 'Motivo', 'Detalle', 'Proyecto', 'Pagó'].map((h) => <Th key={h}>{h}</Th>)}
          </tr></thead>
          <tbody>
            {nf && (
              <tr style={{ background: '#F0FDFA' }}>
                <td style={cellPad}><input type="date" value={nf.expense_date} onChange={(e) => setF('expense_date', e.target.value)} style={inp} /></td>
                <td style={cellPad}><input inputMode="decimal" placeholder="€" value={nf.amount_eur} onChange={(e) => setF('amount_eur', e.target.value)} style={inp} /></td>
                <td style={cellPad}><input inputMode="decimal" placeholder="US$ *" value={nf.amount} onChange={(e) => setF('amount', e.target.value)} style={inp} /></td>
                <td style={{ ...cellPad, textAlign: 'center', color: '#9AA4B2', fontSize: 9 }}>auto</td>
                <td style={cellPad}><TagSelect value={nf.category} opts={catOpts.options} onChange={(v) => setF('category', v)} onAdd={catOpts.add} onRename={catOpts.rename} onRemove={catOpts.remove} /></td>
                <td style={cellPad}><input value={nf.reason} onChange={(e) => setF('reason', e.target.value)} placeholder="motivo" style={inp} /></td>
                <td style={cellPad}><input value={nf.detail} onChange={(e) => setF('detail', e.target.value)} placeholder="detalle" style={inp} /></td>
                <td style={cellPad}><input value={nf.project} onChange={(e) => setF('project', e.target.value)} placeholder="proyecto" style={inp} /></td>
                <td style={cellPad}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input value={nf.paid_by} onChange={(e) => setF('paid_by', e.target.value)} placeholder="pagó" style={inp} />
                    <button onClick={saveNew} disabled={busy || !nf.amount} title="Guardar" style={{ border: 0, background: '#16a34a', color: '#fff', borderRadius: 6, width: 22, height: 22, cursor: 'pointer', fontWeight: 700, opacity: (busy || !nf.amount) ? 0.4 : 1 }}>✓</button>
                    <button onClick={() => setNf(null)} title="Cancelar" style={{ border: 0, background: '#e2e8f0', color: '#64748B', borderRadius: 6, width: 22, height: 22, cursor: 'pointer', fontWeight: 700 }}>✕</button>
                  </div>
                </td>
              </tr>
            )}
            {filtered.map((r) => { const hov = hover === r.id; return (
              <tr key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} style={{ background: hov ? '#FFF7F8' : '#fff' }}>
                <td style={{ padding: 0, borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9', color: '#64748B' }}>
                  <div style={{ borderLeft: `3px solid ${catColor(r.category)}`, padding: '9px 14px' }}>
                    <EditableCell type="date" value={r.expense_date} display={() => fdate(r.expense_date)} onSave={(v) => patchExpense(r.id, { expense_date: v || null, month_date: v ? v.slice(0, 7) + '-01' : null })} />
                  </div>
                </td>
                <Td muted><EditableCell type="num" align="right" value={r.amount_eur} display={() => money2(r.amount_eur, '€')} onSave={(v) => patchExpense(r.id, { amount_eur: numE(v) })} /></Td>
                <Td style={{ fontWeight: 700 }}><EditableCell type="num" align="right" value={r.amount} display={() => money(r.amount)} onSave={(v) => patchExpense(r.id, { amount: numE(v) })} /></Td>
                <Td><ReconChip recon={r.recon} /></Td>
                <Td><TagSelect value={r.category} opts={catOpts.options} onChange={(v) => patchExpense(r.id, { category: v })} onAdd={catOpts.add} onRename={catOpts.rename} onRemove={catOpts.remove} /></Td>
                <Td muted><EditableCell value={r.reason} onSave={(v) => patchExpense(r.id, { reason: v.trim() || null })} /></Td>
                <Td style={{ color: '#9AA4B2' }}><EditableCell value={r.detail} onSave={(v) => patchExpense(r.id, { detail: v.trim() || null })} /></Td>
                <Td muted><EditableCell value={r.project} onSave={(v) => patchExpense(r.id, { project: v.trim() || null })} /></Td>
                <Td style={{ color: '#9AA4B2' }}><EditableCell value={r.paid_by} onSave={(v) => patchExpense(r.id, { paid_by: v.trim() || null })} /></Td>
              </tr>
            ); })}
            {!filtered.length && !nf && <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: '#9AA4B2' }}>Sin egresos.</td></tr>}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 800, fontSize: 11.5 }}>
              <td style={foot}>TOTAL · {filtered.length}</td>
              <td style={foot}>{money2(totals.eur, '€')}</td>
              <td style={{ ...foot, color: '#e11d48' }}>{money(totals.usd)}</td>
              <td colSpan={6} style={foot} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ height: 14, flexShrink: 0 }} />
    </div>
  );
}

function ReconChip({ recon }) {
  if (!recon || !recon.source) return <span style={{ color: '#cbd5e1' }} title="Sin salida encontrada en Mercury/Kraken">—</span>;
  const isMercury = recon.source === 'mercury';
  const label = isMercury ? 'Mercury' : 'Kraken';
  const mark = recon.confidence === 'baja' ? ' ?' : ' ✓';
  const [bg, fg] = isMercury ? ['#e0f2fe', '#0369a1'] : ['#d1fae5', '#047857'];
  const tip = `${label}: ${recon.who || '—'} · ${recon.dt || ''} · US$ ${Math.round(Number(recon.amount) || 0).toLocaleString('es-AR')}` + (recon.confidence === 'baja' ? ' — revisar (monto+fecha lejana)' : recon.confidence === 'media' ? ' (fecha cercana)' : '');
  return <span title={tip} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: bg, color: fg, border: recon.confidence === 'baja' ? '1px solid #fbbf24' : undefined, whiteSpace: 'nowrap' }}>{label}{mark}</span>;
}

const cellPad = { padding: '5px 8px' };
const Th = ({ children }) => <th style={{ position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E5EB', padding: '10px 14px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left' }}>{children}</th>;
const Td = ({ children, muted, style }) => <td style={{ padding: '0 6px', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9', color: muted ? '#475569' : undefined, ...style }}>{children}</td>;
const foot = { padding: '10px 14px', borderTop: '2px solid #CBD5E1', background: '#F1F5F9', textAlign: 'left' };
