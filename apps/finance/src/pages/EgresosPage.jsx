import { useEffect, useState, useMemo, useCallback } from 'react';
import { sbFetch } from '@korex/db';
import TagSelect from '../components/TagSelect.jsx';
import { Search, Msg } from '../components/bits.jsx';
import { useOptions } from '../lib/options.js';
import { money, money2, fdate, catChip, catColor } from '../lib/format.js';

// Egresos (diseño Claude Design): tabla con conciliación bancaria (Mercury / Kraken)
// y alta/edición/baja con el MISMO modal que Ingresos (no edición en la fila).
const numE = (x) => { const n = parseFloat(String(x).replace(',', '.')); return isFinite(n) ? n : null; };
const todayE = () => new Date().toISOString().slice(0, 10);

export default function EgresosPage() {
  const [rows, setRows] = useState(null);
  const [reconMap, setReconMap] = useState({});
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [shown, setShown] = useState(120);
  const [modal, setModal] = useState(null);   // alta/edición (null = cerrado)
  const [busy, setBusy] = useState(false);
  const catOpts = useOptions('categoria_egreso');

  const load = useCallback(() => {
    sbFetch('fin_expenses?select=id,expense_date,category,reason,detail,project,paid_by,amount,amount_eur&order=expense_date.desc.nullslast&limit=6000')
      .then((d) => setRows(Array.isArray(d) ? d : [])).catch((e) => setError(String(e)));
    sbFetch('fin_expense_recon?select=expense_id,source,ref_id,amount,dt,who,category,confidence&limit=6000')
      .then((d) => { const m = {}; (Array.isArray(d) ? d : []).forEach((r) => { m[r.expense_id] = r; }); setReconMap(m); }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => setModal({ mode: 'new', expense_date: todayE(), category: 'Herramientas', divisa: 'USD', bruto: '', amount: '', amount_eur: '', reason: '', detail: '', project: '', paid_by: '' });
  const openEdit = (r) => {
    const usd = Number(r.amount) || 0, eur = Number(r.amount_eur) || 0;
    const divisa = (usd || !eur) ? 'USD' : 'EUR';
    setModal({
      mode: 'edit', id: r.id, expense_date: r.expense_date || '', category: r.category || '',
      divisa, bruto: String(divisa === 'USD' ? (r.amount ?? '') : (r.amount_eur ?? '')),
      amount: r.amount == null ? '' : String(r.amount), amount_eur: r.amount_eur == null ? '' : String(r.amount_eur),
      reason: r.reason || '', detail: r.detail || '', project: r.project || '', paid_by: r.paid_by || '',
    });
  };

  const saveModal = async () => {
    const f = modal; const amt = numE(f.amount);
    if (amt == null) return;
    setBusy(true);
    try {
      const common = {
        expense_date: f.expense_date || null, month_date: f.expense_date ? f.expense_date.slice(0, 7) + '-01' : null,
        amount: amt, amount_eur: numE(f.amount_eur), category: f.category || null,
        reason: (f.reason || '').trim() || null, detail: (f.detail || '').trim() || null,
        project: (f.project || '').trim() || null, paid_by: (f.paid_by || '').trim() || null,
      };
      if (f.mode === 'edit') await sbFetch(`fin_expenses?id=eq.${f.id}`, { method: 'PATCH', body: JSON.stringify(common), throwOnError: true });
      else await sbFetch('fin_expenses', { method: 'POST', headers: { Prefer: 'return=minimal' }, throwOnError: true, body: JSON.stringify({ ...common, currency: 'USD', facturado: false }) });
      await sbFetch('rpc/fin_expense_recon_run', { method: 'POST', body: '{}' }).catch(() => {});
      setModal(null); setBusy(false); load();
    } catch { setBusy(false); }
  };
  const deleteModal = async () => {
    const f = modal; if (!f || f.mode !== 'edit' || !f.id || busy) return;
    setBusy(true);
    try {
      await sbFetch(`fin_expenses?id=eq.${f.id}`, { method: 'DELETE', throwOnError: true });
      await sbFetch('rpc/fin_expense_recon_run', { method: 'POST', body: '{}' }).catch(() => {});
      setRows((rs) => (rs || []).filter((r) => r.id !== f.id)); setModal(null); setBusy(false);
    } catch { setBusy(false); }
  };

  const data = useMemo(() => (rows ? rows.map((r) => ({ ...r, recon: reconMap[r.id] })) : null), [rows, reconMap]);
  const cats = useMemo(() => (data ? [...new Set(data.map((r) => r.category).filter(Boolean))].sort() : []), [data]);
  const filtered = useMemo(() => {
    if (!data) return [];
    const qq = q.trim().toLowerCase();
    return data.filter((r) => (!qq || [r.reason, r.detail, r.project, r.paid_by].some((x) => (x || '').toLowerCase().includes(qq))) && (!cat || r.category === cat));
  }, [data, q, cat]);
  useEffect(() => { setShown(120); }, [q, cat]);
  const visible = filtered.slice(0, shown);

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
        <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#fff', border: 0, borderRadius: 9, padding: '8px 13px', cursor: 'pointer', whiteSpace: 'nowrap', background: '#e11d48' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg> Nuevo egreso
        </button>
        <Search value={q} onChange={setQ} placeholder="Buscar motivo, detalle, proyecto o quién pagó…" />
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {[['', 'Todas'], ...cats.map((c) => [c, c])].map(([v, label]) => { const sel = cat === v; const [cbg, cfg] = catChip(v); return (
            <button key={v || 'all'} onClick={() => setCat(v)} style={{ border: `1px solid ${sel ? 'transparent' : '#E2E5EB'}`, background: sel ? (v ? cbg : '#0EA5A4') : '#fff', color: sel ? (v ? cfg : '#fff') : '#475569', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 20, cursor: 'pointer' }}>{label}</button>
          ); })}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#9AA4B2' }}>mostrando {Math.min(visible.length, filtered.length)}{filtered.length > visible.length ? ` de ${filtered.length}` : ''} · {data.length} total</span>
      </div>

      <style>{`.fin-eg tbody tr:hover td{background:#FFF7F8}`}</style>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, boxShadow: '0 1px 3px rgba(13,17,23,.04)' }}>
        <table className="fin-eg" style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12.5, whiteSpace: 'nowrap' }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748B' }}>
            {['Fecha', 'Egreso €', 'Egreso US$', 'Banco', 'Categoría', 'Motivo', 'Detalle', 'Proyecto', 'Pagó'].map((h) => <Th key={h}>{h}</Th>)}
          </tr></thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: 0, borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9', color: '#64748B' }}>
                  <div style={{ borderLeft: `3px solid ${catColor(r.category)}`, padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span>{fdate(r.expense_date)}</span>
                    <button onClick={() => openEdit(r)} title="Editar egreso" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: '#B6BFCC', padding: 0, display: 'flex' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    </button>
                  </div>
                </td>
                <Td muted style={{ textAlign: 'right' }}>{money2(r.amount_eur, '€')}</Td>
                <Td style={{ fontWeight: 700, textAlign: 'right' }}>{money(r.amount)}</Td>
                <Td><ReconChip recon={r.recon} /></Td>
                <Td>{r.category ? <Chip cat={r.category} /> : <span style={{ color: '#cbd5e1' }}>—</span>}</Td>
                <Td muted>{r.reason || <span style={{ color: '#cbd5e1' }}>—</span>}</Td>
                <Td style={{ color: '#9AA4B2' }}>{r.detail || '—'}</Td>
                <Td muted>{r.project || <span style={{ color: '#cbd5e1' }}>—</span>}</Td>
                <Td style={{ color: '#9AA4B2' }}>{r.paid_by || '—'}</Td>
              </tr>
            ))}
            {filtered.length > visible.length && (
              <tr><td colSpan={9} style={{ padding: '10px 14px', textAlign: 'center' }}>
                <button onClick={() => setShown((n) => n + 300)} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#0c8584', fontSize: 12.5, fontWeight: 600, padding: '7px 16px', borderRadius: 9, cursor: 'pointer' }}>Mostrar más · faltan {filtered.length - visible.length}</button>
              </td></tr>
            )}
            {!filtered.length && <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: '#9AA4B2' }}>Sin egresos.</td></tr>}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 800, fontSize: 11.5 }}>
              <td style={foot}>TOTAL · {filtered.length}</td>
              <td style={{ ...foot, textAlign: 'right' }}>{money2(totals.eur, '€')}</td>
              <td style={{ ...foot, color: '#e11d48', textAlign: 'right' }}>{money(totals.usd)}</td>
              <td colSpan={6} style={foot} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ height: 14, flexShrink: 0 }} />

      {modal && <EgresoModal form={modal} setForm={setModal} catOpts={catOpts} onSave={saveModal} onDelete={deleteModal} busy={busy} onClose={() => setModal(null)} />}
    </div>
  );
}

/* ---------- modal de alta/edición/baja (mismo patrón que Ingresos) ---------- */
function EgresoModal({ form, setForm, catOpts, onSave, onDelete, busy, onClose }) {
  const [rate, setRate] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const isEdit = form.mode === 'edit';
  const RATE = rate || 1.08;
  const r2 = (n) => Math.round(n * 100) / 100;

  useEffect(() => {
    let alive = true;
    fetch('https://api.frankfurter.app/latest?from=EUR&to=USD').then((r) => r.json()).then((d) => { if (alive && d?.rates?.USD) setRate(d.rates.USD); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const recompute = (s, rt) => {
    const b = numE(s.bruto);
    let usd = '', eur = '';
    if (b != null) { if (s.divisa === 'USD') { usd = b; eur = r2(b / rt); } else { eur = b; usd = r2(b * rt); } }
    return { ...s, amount: usd === '' ? '' : String(usd), amount_eur: eur === '' ? '' : String(eur) };
  };
  const setBruto = (v) => setForm((s) => recompute({ ...s, bruto: v }, RATE));
  const setDivisa = (d) => setForm((s) => recompute({ ...s, divisa: d }, RATE));
  useEffect(() => { if (rate && !isEdit && form.bruto) setForm((s) => recompute(s, rate)); }, [rate]); // eslint-disable-line
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));

  const otherCur = form.divisa === 'USD' ? (form.amount_eur ? `≈ € ${form.amount_eur}` : '') : (form.amount ? `≈ US$ ${form.amount}` : '');
  const ok = numE(form.amount) != null;
  const lab = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 };
  const inp = { width: '100%', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,23,.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(13,17,23,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EEF1F5' }}>
          <div><div style={{ fontSize: 16, fontWeight: 800 }}>{isEdit ? 'Editar egreso' : 'Nuevo egreso'}</div><div style={{ fontSize: 12, color: '#9AA4B2', marginTop: 2 }}>Monto, categoría y detalle · la conciliación con el banco se recalcula al guardar</div></div>
          <button onClick={onClose} style={{ border: 0, background: '#F1F5F9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#64748B', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><label style={lab}>Fecha</label><input type="date" value={form.expense_date} onChange={(e) => set('expense_date', e.target.value)} style={inp} /></div>
          <div><label style={lab}>Categoría</label><TagSelect value={form.category} opts={catOpts.options} onChange={(v) => set('category', v)} onAdd={catOpts.add} onRename={catOpts.rename} onRemove={catOpts.remove} /></div>
          <div>
            <label style={lab}>Divisa</label>
            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 3 }}>
              {['USD', 'EUR'].map((c) => (
                <button key={c} type="button" onClick={() => setDivisa(c)} style={{ flex: 1, border: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: form.divisa === c ? 700 : 500, padding: '7px 0', borderRadius: 6, background: form.divisa === c ? '#fff' : 'transparent', color: form.divisa === c ? '#0c8584' : '#64748B', boxShadow: form.divisa === c ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{c}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={lab}>Monto <span style={{ color: '#e11d48' }}>*</span></label>
            <input inputMode="decimal" value={form.bruto} onChange={(e) => setBruto(e.target.value)} placeholder="0" style={inp} />
            {otherCur && <div style={{ fontSize: 10.5, color: '#9AA4B2', marginTop: 3 }}>{otherCur} <span style={{ color: '#cbd5e1' }}>· cotización {RATE.toFixed(3)}</span></div>}
          </div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Motivo</label><input value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="ej. Retiro, Sueldo, Suscripción…" style={inp} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Detalle</label><input value={form.detail} onChange={(e) => set('detail', e.target.value)} placeholder="(opcional)" style={inp} /></div>
          <div><label style={lab}>Proyecto / cliente</label><input value={form.project} onChange={(e) => set('project', e.target.value)} placeholder="(opcional)" style={inp} /></div>
          <div><label style={lab}>Pagó</label><input value={form.paid_by} onChange={(e) => set('paid_by', e.target.value)} placeholder="(opcional)" style={inp} /></div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #EEF1F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 30 }}>
            {isEdit && (confirmDel
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#be123c' }}>¿Borrar egreso?
                  <button onClick={onDelete} disabled={busy} style={{ border: 0, background: '#e11d48', color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 11px', borderRadius: 8, cursor: 'pointer' }}>Sí, borrar</button>
                  <button onClick={() => setConfirmDel(false)} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 8, cursor: 'pointer' }}>No</button>
                </span>
              : <button onClick={() => setConfirmDel(true)} style={{ border: '1px solid #FBC9CF', background: '#fff', color: '#be123c', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 9, cursor: 'pointer' }}>Eliminar</button>
            )}
            {!confirmDel && <span style={{ fontSize: 11.5, color: ok ? '#16a34a' : '#e11d48' }}>{ok ? 'Listo para guardar' : 'El monto es obligatorio'}</span>}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 9, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={onSave} disabled={!ok || busy} style={{ border: 0, background: '#e11d48', color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9, cursor: 'pointer', opacity: (!ok || busy) ? 0.6 : 1 }}>{busy ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Guardar egreso')}</button>
          </div>
        </div>
      </div>
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
const Chip = ({ cat }) => { const [bg, fg] = catChip(cat); return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: bg, color: fg }}>{cat}</span>; };
const Th = ({ children }) => <th style={{ position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E5EB', padding: '10px 14px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left' }}>{children}</th>;
const Td = ({ children, muted, style }) => <td style={{ padding: '9px 14px', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9', color: muted ? '#475569' : undefined, ...style }}>{children}</td>;
const foot = { padding: '10px 14px', borderTop: '2px solid #CBD5E1', background: '#F1F5F9', textAlign: 'left' };
