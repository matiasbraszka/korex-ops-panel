import { useEffect, useState, useMemo, useCallback } from 'react';
import { sbFetch } from '@korex/db';
import PersonDrawer from '../components/PersonDrawer.jsx';
import Combo from '../components/Combo.jsx';
import { Search, AddButton, Msg } from '../components/bits.jsx';
import { useDirectoryResolver } from '../lib/directory.js';
import { money2, fdate, roleChip } from '../lib/format.js';

// Pagos (diseño Claude Design): libro de movimientos del fondo de comisiones
// (lo que realmente se pagó/entró), por persona/rol/cliente/concepto. Alta/edición/
// borrado por modal; persona y cliente se eligen de la Base de datos (sin texto libre).
const numP = (x) => { const n = parseFloat(String(x).replace(',', '.')); return isFinite(n) ? n : null; };
const todayP = () => new Date().toISOString().slice(0, 10);
const roleLabel = (t) => (t === 'Usuario' ? 'Afiliado' : (t || '—'));
const PT_OPTS = ['Cliente', 'Conector', 'Consultor', 'Marketing', 'Usuario'];

export default function PagosPage() {
  const [rows, setRows] = useState(null);
  const [roster, setRoster] = useState([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [openId, setOpenId] = useState(null);
  const [hover, setHover] = useState(null);
  const [editing, setEditing] = useState(null); // 'new' | row | null
  const resolve = useDirectoryResolver();

  const load = useCallback(() => {
    sbFetch('fin_payouts?select=id,paid_on,category,person_type,person_name,client_name,concept,amount&order=paid_on.desc.nullslast&limit=6000')
      .then((d) => setRows(Array.isArray(d) ? d : [])).catch((e) => setError(String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    sbFetch('fin_directory?select=nombre,tipo,roles&order=nombre.asc&limit=3000')
      .then((d) => setRoster(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const qq = q.trim().toLowerCase();
    return rows.filter((r) => (!qq || [r.person_name, r.client_name, r.concept].some((x) => (x || '').toLowerCase().includes(qq))) && (!cat || r.category === cat));
  }, [rows, q, cat]);

  const sum = useMemo(() => {
    const s = { egreso: 0, ingreso: 0, byRol: {} };
    filtered.forEach((r) => { const a = Number(r.amount) || 0; if (r.category === 'egreso') { s.egreso += a; s.byRol[r.person_type] = (s.byRol[r.person_type] || 0) + a; } else if (r.category === 'ingreso') s.ingreso += a; });
    return s;
  }, [filtered]);

  if (error) return <Msg>Error cargando pagos: {error}</Msg>;
  if (!rows) return <Msg>Cargando pagos…</Msg>;

  const catChips = [['', 'Todos'], ['egreso', 'Egresos'], ['ingreso', 'Ingresos']];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '16px 22px 0' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ background: '#FEF2F2', border: '1px solid #FBC9C9', borderRadius: 12, padding: '11px 16px', minWidth: 160 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#dc2626' }}>Total pagado (egresos)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626', marginTop: 3 }}>{money2(sum.egreso)}</div>
        </div>
        <div style={{ background: '#F0FDF4', border: '1px solid #B6E8C5', borderRadius: 12, padding: '11px 16px', minWidth: 160 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#16a34a' }}>Ingresos al fondo</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a', marginTop: 3 }}>{money2(sum.ingreso)}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 12, padding: '11px 16px', flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8A93A2', marginBottom: 7 }}>Egresos por rol</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {Object.entries(sum.byRol).sort((a, b) => b[1] - a[1]).map(([k, v]) => { const [bg, fg] = roleChip(k); return (
              <span key={k} style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: bg, color: fg }}>{roleLabel(k)}: <b>{money2(v)}</b></span>
            ); })}
            {!Object.keys(sum.byRol).length && <span style={{ fontSize: 12, color: '#9AA4B2' }}>—</span>}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 11, flexShrink: 0 }}>
        <AddButton active={false} label="Nuevo movimiento" onClick={() => setEditing('new')} />
        <Search value={q} onChange={setQ} placeholder="Buscar persona, cliente o concepto…" />
        <div style={{ display: 'flex', gap: 5 }}>
          {catChips.map(([v, label]) => { const sel = cat === v; const base = v === 'egreso' ? '#e11d48' : v === 'ingreso' ? '#16a34a' : '#0EA5A4'; return (
            <button key={v || 'all'} onClick={() => setCat(v)} style={{ border: `1px solid ${sel ? base : '#E2E5EB'}`, background: sel ? base : '#fff', color: sel ? '#fff' : '#475569', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 20, cursor: 'pointer' }}>{label}</button>
          ); })}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#9AA4B2' }}>{filtered.length} de {rows.length} movimientos</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, boxShadow: '0 1px 3px rgba(13,17,23,.04)' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12.5, whiteSpace: 'nowrap' }}>
          <thead><tr style={{ textAlign: 'left', color: '#64748B' }}>
            {['Fecha', 'Cliente', 'Persona (cobra)', 'Rol', 'Concepto', 'Movimiento', 'Monto', ''].map((h, i) => <Th key={i}>{h}</Th>)}
          </tr></thead>
          <tbody>
            {filtered.map((r) => { const [rbg, rfg] = roleChip(r.person_type); const hov = hover === r.id; return (
              <tr key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} onClick={() => setEditing(r)} style={{ background: hov ? '#F6FBFB' : '#fff', cursor: 'pointer' }}>
                <Td muted>{fdate(r.paid_on)}</Td>
                <Td muted><Clickable name={r.client_name} id={resolve(r.client_name)} onOpen={setOpenId} /></Td>
                <Td style={{ fontWeight: 600 }}><Clickable name={r.person_name} id={resolve(r.person_name)} onOpen={setOpenId} dashed /></Td>
                <Td><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: rbg, color: rfg }}>{roleLabel(r.person_type)}</span></Td>
                <Td muted>{r.concept || '—'}</Td>
                <Td><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: r.category === 'egreso' ? '#fee2e2' : '#dcfce7', color: r.category === 'egreso' ? '#dc2626' : '#15803d' }}>{r.category === 'egreso' ? 'Egreso' : 'Ingreso'}</span></Td>
                <Td style={{ fontWeight: 700, color: r.category === 'egreso' ? '#dc2626' : '#15803d' }}>{money2(r.amount)}</Td>
                <Td style={{ textAlign: 'right' }}>
                  <button onClick={(e) => { e.stopPropagation(); setEditing(r); }} title="Editar" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: hov ? '#0EA5A4' : '#C4CCD6', padding: 0, display: 'inline-flex' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                  </button>
                </Td>
              </tr>
            ); })}
            {!filtered.length && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#9AA4B2' }}>Sin movimientos.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ height: 14, flexShrink: 0 }} />

      {editing && <PagoModal payout={editing === 'new' ? null : editing} roster={roster} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {openId && <PersonDrawer personId={openId} onClose={() => setOpenId(null)} onOpenPerson={setOpenId} />}
    </div>
  );
}

/* ---------- alta / edición / baja de un movimiento ---------- */
function PagoModal({ payout, roster, onClose, onSaved }) {
  const isNew = !payout;
  const [f, setF] = useState(() => ({
    paid_on: payout?.paid_on || todayP(),
    category: payout?.category || 'egreso',
    person_type: payout?.person_type || 'Conector',
    person_name: payout?.person_name || '',
    client_name: payout?.client_name || '',
    concept: payout?.concept || 'Liquidez',
    amount: payout?.amount != null ? String(payout.amount) : '',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const uniqSorted = (arr) => [...new Set(arr.filter(Boolean).map((s) => String(s).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const clientOpts = useMemo(() => uniqSorted(roster.filter((p) => p.tipo === 'Cliente' || (p.roles || []).includes('Cliente')).map((p) => p.nombre)), [roster]);
  const personOpts = useMemo(() => uniqSorted(roster.map((p) => p.nombre)), [roster]);

  // Al elegir la persona, sugiere su rol principal de la Base de datos (editable).
  const pickPerson = (name) => {
    const p = roster.find((x) => (x.nombre || '').trim().toLowerCase() === String(name || '').trim().toLowerCase());
    setF((s) => ({ ...s, person_name: name || '', person_type: (p && PT_OPTS.includes(p.tipo)) ? p.tipo : s.person_type }));
  };

  const body = () => JSON.stringify({ paid_on: f.paid_on || null, category: f.category, person_type: f.person_type, person_name: (f.person_name || '').trim(), client_name: (f.client_name || '').trim() || null, concept: (f.concept || '').trim() || null, amount: numP(f.amount), currency: 'US$' });
  const save = async () => {
    if (!(f.person_name || '').trim() || !f.amount) { setErr('Faltan la persona y el monto.'); return; }
    setBusy(true); setErr('');
    try {
      if (isNew) await sbFetch('fin_payouts', { method: 'POST', headers: { Prefer: 'return=minimal' }, throwOnError: true, body: body() });
      else await sbFetch(`fin_payouts?id=eq.${payout.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, throwOnError: true, body: body() });
      onSaved?.();
    } catch (e) { setErr(String(e)); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setErr('');
    try { await sbFetch(`fin_payouts?id=eq.${payout.id}`, { method: 'DELETE', throwOnError: true }); onSaved?.(); }
    catch (e) { setErr(String(e)); setBusy(false); }
  };

  const lab = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 };
  const inp = { width: '100%', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,23,.4)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(13,17,23,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EEF1F5' }}>
          <div><div style={{ fontSize: 16, fontWeight: 800 }}>{isNew ? 'Nuevo movimiento' : 'Editar movimiento'}</div><div style={{ fontSize: 12, color: '#9AA4B2', marginTop: 2 }}>Pago/ingreso del fondo de comisiones</div></div>
          <button onClick={onClose} style={{ border: 0, background: '#F1F5F9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#64748B', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><label style={lab}>Fecha</label><input type="date" value={f.paid_on} onChange={(e) => set('paid_on', e.target.value)} style={inp} /></div>
          <div><label style={lab}>Movimiento</label><select value={f.category} onChange={(e) => set('category', e.target.value)} style={inp}><option value="egreso">Egreso (pago)</option><option value="ingreso">Ingreso al fondo</option></select></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Cliente <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· de la Base de datos</span></label><Combo value={f.client_name} onChange={(v) => set('client_name', v)} options={clientOpts} placeholder="elegir cliente…" empty="No está en la base. Agregalo primero." /></div>
          <div><label style={lab}>Persona que cobra <span style={{ color: '#e11d48' }}>*</span></label><Combo value={f.person_name} onChange={pickPerson} options={personOpts} placeholder="elegir persona…" empty="No está en la base. Agregalo primero." /></div>
          <div><label style={lab}>Rol</label><select value={f.person_type} onChange={(e) => set('person_type', e.target.value)} style={inp}>{PT_OPTS.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}</select></div>
          <div><label style={lab}>Concepto</label><input list="pgo-con" value={f.concept} onChange={(e) => set('concept', e.target.value)} style={inp} /><datalist id="pgo-con"><option value="Liquidez" /><option value="Afiliados" /><option value="Publicidad" /></datalist></div>
          <div><label style={lab}>Monto US$ <span style={{ color: '#e11d48' }}>*</span></label><input inputMode="decimal" value={f.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" style={inp} /></div>
          {err && <div style={{ gridColumn: '1 / -1', color: '#dc2626', fontSize: 12 }}>Error: {err}</div>}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid #EEF1F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div>
            {!isNew && (confirmDel
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#be123c' }}>¿Borrar este movimiento?
                  <button onClick={remove} disabled={busy} style={{ border: 0, background: '#e11d48', color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 11px', borderRadius: 8, cursor: 'pointer' }}>Sí, borrar</button>
                  <button onClick={() => setConfirmDel(false)} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 8, cursor: 'pointer' }}>No</button>
                </span>
              : <button onClick={() => setConfirmDel(true)} style={{ border: '1px solid #FBC9CF', background: '#fff', color: '#be123c', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 9, cursor: 'pointer' }}>Eliminar</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 9, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={save} disabled={busy || !(f.person_name || '').trim() || !f.amount} style={{ border: 0, background: '#0EA5A4', color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9, cursor: 'pointer', opacity: (busy || !(f.person_name || '').trim() || !f.amount) ? 0.6 : 1 }}>{busy ? 'Guardando…' : (isNew ? 'Crear' : 'Guardar')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const Th = ({ children }) => <th style={{ position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E5EB', padding: '10px 14px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left' }}>{children}</th>;
const Td = ({ children, muted, style }) => <td style={{ padding: '9px 14px', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9', color: muted ? '#475569' : undefined, ...style }}>{children}</td>;
function Clickable({ name, id, onOpen, dashed }) {
  if (!name) return <span style={{ color: '#9AA4B2' }}>—</span>;
  if (!id) return <span>{name}</span>;
  return <span onClick={(e) => { e.stopPropagation(); onOpen(id); }} style={{ cursor: 'pointer', borderBottom: dashed ? '1px dashed #C4CCD6' : undefined }}>{name}</span>;
}
