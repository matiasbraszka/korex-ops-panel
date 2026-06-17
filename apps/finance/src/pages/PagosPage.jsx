import { useEffect, useState, useMemo, useCallback } from 'react';
import { sbFetch } from '@korex/db';
import PersonDrawer from '../components/PersonDrawer.jsx';
import { Search, AddButton, Msg } from '../components/bits.jsx';
import { useDirectoryResolver } from '../lib/directory.js';
import { money2, fdate, roleChip } from '../lib/format.js';

// Pagos (diseño Claude Design): libro de movimientos del fondo de comisiones
// (lo que realmente se pagó/entró), por persona/rol/cliente/concepto. Alta inline.
const numP = (x) => { const n = parseFloat(String(x).replace(',', '.')); return isFinite(n) ? n : null; };
const todayP = () => new Date().toISOString().slice(0, 10);
const roleLabel = (t) => (t === 'Usuario' ? 'Afiliado' : (t || '—'));
const inp = { width: '100%', border: '1px solid #99E6E3', borderRadius: 6, padding: '5px 6px', fontSize: 11, outline: 'none', background: '#fff' };

export default function PagosPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [openId, setOpenId] = useState(null);
  const [hover, setHover] = useState(null);
  const [nf, setNf] = useState(null);
  const [editId, setEditId] = useState(null);   // id del pago en edición
  const [ef, setEf] = useState(null);            // form de edición
  const [confirmId, setConfirmId] = useState(null); // id con confirmación de borrado
  const [busy, setBusy] = useState(false);
  const setF = (k, v) => setNf((s) => ({ ...s, [k]: v }));
  const setEF = (k, v) => setEf((s) => ({ ...s, [k]: v }));
  const resolve = useDirectoryResolver();

  const load = useCallback(() => {
    sbFetch('fin_payouts?select=id,paid_on,category,person_type,person_name,client_name,concept,amount&order=paid_on.desc.nullslast&limit=6000')
      .then((d) => setRows(Array.isArray(d) ? d : [])).catch((e) => setError(String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  const startAdd = () => { setEditId(null); setEf(null); setConfirmId(null); setNf({ paid_on: todayP(), category: 'egreso', person_type: 'Conector', person_name: '', client_name: '', concept: 'Liquidez', amount: '' }); };
  const body = (f) => JSON.stringify({ paid_on: f.paid_on || null, category: f.category, person_type: f.person_type, person_name: f.person_name.trim(), client_name: f.client_name.trim() || null, concept: f.concept.trim() || null, amount: numP(f.amount), currency: 'US$' });
  const saveNew = async () => {
    if (!nf.person_name.trim() || !nf.amount) return;
    setBusy(true);
    try {
      await sbFetch('fin_payouts', { method: 'POST', headers: { Prefer: 'return=minimal' }, throwOnError: true, body: body(nf) });
      setNf(null); setBusy(false); load();
    } catch { setBusy(false); }
  };
  const startEdit = (r) => { setNf(null); setConfirmId(null); setEditId(r.id); setEf({ paid_on: r.paid_on || '', category: r.category || 'egreso', person_type: r.person_type || 'Conector', person_name: r.person_name || '', client_name: r.client_name || '', concept: r.concept || '', amount: r.amount != null ? String(r.amount) : '' }); };
  const saveEdit = async () => {
    if (!ef.person_name.trim() || !ef.amount) return;
    setBusy(true);
    try {
      await sbFetch(`fin_payouts?id=eq.${editId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, throwOnError: true, body: body(ef) });
      setEditId(null); setEf(null); setBusy(false); load();
    } catch { setBusy(false); }
  };
  const delRow = async (id) => {
    setBusy(true);
    try { await sbFetch(`fin_payouts?id=eq.${id}`, { method: 'DELETE', throwOnError: true }); setConfirmId(null); setEditId(null); setEf(null); setBusy(false); load(); }
    catch { setBusy(false); }
  };

  const clientes = useMemo(() => (rows ? [...new Set(rows.map((r) => r.client_name).filter(Boolean))].sort() : []), [rows]);
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
        <AddButton active={!!nf} label={nf ? 'Cancelar' : 'Nuevo movimiento'} onClick={() => (nf ? setNf(null) : startAdd())} />
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
            {nf && (
              <tr style={{ background: '#F0FDFA' }}>
                <FormCells f={nf} on={setF} clientes={clientes} />
                <td style={cellPad}><Acts onSave={saveNew} onCancel={() => setNf(null)} busy={busy} disabled={!nf.person_name.trim() || !nf.amount} /></td>
              </tr>
            )}
            {filtered.map((r) => {
              if (editId === r.id) return (
                <tr key={r.id} style={{ background: '#FFFBEB' }}>
                  <FormCells f={ef} on={setEF} clientes={clientes} />
                  <td style={cellPad}><Acts onSave={saveEdit} onCancel={() => { setEditId(null); setEf(null); }} onDelete={() => delRow(r.id)} busy={busy} disabled={!ef.person_name.trim() || !ef.amount} /></td>
                </tr>
              );
              const [rbg, rfg] = roleChip(r.person_type); const hov = hover === r.id;
              return (
                <tr key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} style={{ background: hov ? '#F6FBFB' : '#fff' }}>
                  <Td muted>{fdate(r.paid_on)}</Td>
                  <Td muted><Clickable name={r.client_name} id={resolve(r.client_name)} onOpen={setOpenId} /></Td>
                  <Td style={{ fontWeight: 600 }}><Clickable name={r.person_name} id={resolve(r.person_name)} onOpen={setOpenId} dashed /></Td>
                  <Td><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: rbg, color: rfg }}>{roleLabel(r.person_type)}</span></Td>
                  <Td muted>{r.concept || '—'}</Td>
                  <Td><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: r.category === 'egreso' ? '#fee2e2' : '#dcfce7', color: r.category === 'egreso' ? '#dc2626' : '#15803d' }}>{r.category === 'egreso' ? 'Egreso' : 'Ingreso'}</span></Td>
                  <Td style={{ fontWeight: 700, color: r.category === 'egreso' ? '#dc2626' : '#15803d' }}>{money2(r.amount)}</Td>
                  <Td style={{ whiteSpace: 'nowrap' }}>
                    {confirmId === r.id ? (
                      <span style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: 11, color: '#be123c' }}>¿Borrar?</span>
                        <button onClick={() => delRow(r.id)} disabled={busy} style={{ border: 0, background: '#e11d48', color: '#fff', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Sí</button>
                        <button onClick={() => setConfirmId(null)} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>No</button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', opacity: hov ? 1 : 0.3 }}>
                        <button onClick={() => startEdit(r)} title="Editar" style={iconBtn}><PencilIcon /></button>
                        <button onClick={() => setConfirmId(r.id)} title="Borrar" style={{ ...iconBtn, color: '#e11d48' }}><TrashIcon /></button>
                      </span>
                    )}
                  </Td>
                </tr>
              );
            })}
            {!filtered.length && !nf && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#9AA4B2' }}>Sin movimientos.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ height: 14, flexShrink: 0 }} />

      {openId && <PersonDrawer personId={openId} onClose={() => setOpenId(null)} onOpenPerson={setOpenId} />}
    </div>
  );
}

const cellPad = { padding: '5px 8px' };
const iconBtn = { border: 0, background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'inline-flex' };
const PencilIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
const TrashIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>;
function Acts({ onSave, onCancel, onDelete, busy, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
      <button onClick={onSave} disabled={busy || disabled} title="Guardar" style={{ border: 0, background: '#16a34a', color: '#fff', borderRadius: 6, width: 22, height: 22, cursor: 'pointer', fontWeight: 700, opacity: (busy || disabled) ? 0.4 : 1 }}>✓</button>
      <button onClick={onCancel} title="Cancelar" style={{ border: 0, background: '#e2e8f0', color: '#64748B', borderRadius: 6, width: 22, height: 22, cursor: 'pointer', fontWeight: 700 }}>✕</button>
      {onDelete && <button onClick={onDelete} disabled={busy} title="Borrar" style={{ border: 0, background: '#fee2e2', color: '#dc2626', borderRadius: 6, width: 24, height: 22, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><TrashIcon /></button>}
    </div>
  );
}
function FormCells({ f, on, clientes }) {
  return (
    <>
      <td style={cellPad}><input type="date" value={f.paid_on} onChange={(e) => on('paid_on', e.target.value)} style={inp} /></td>
      <td style={cellPad}><input list="pgo-cli" value={f.client_name} onChange={(e) => on('client_name', e.target.value)} placeholder="cliente" style={inp} /><datalist id="pgo-cli">{clientes.map((c) => <option key={c} value={c} />)}</datalist></td>
      <td style={cellPad}><input value={f.person_name} onChange={(e) => on('person_name', e.target.value)} placeholder="persona *" style={inp} /></td>
      <td style={cellPad}><select value={f.person_type} onChange={(e) => on('person_type', e.target.value)} style={inp}>{['Cliente', 'Conector', 'Consultor', 'Marketing', 'Usuario'].map((rk) => <option key={rk} value={rk}>{roleLabel(rk)}</option>)}</select></td>
      <td style={cellPad}><input list="pgo-con" value={f.concept} onChange={(e) => on('concept', e.target.value)} style={inp} /><datalist id="pgo-con"><option value="Liquidez" /><option value="Afiliados" /><option value="Publicidad" /></datalist></td>
      <td style={cellPad}><select value={f.category} onChange={(e) => on('category', e.target.value)} style={inp}><option value="egreso">Egreso</option><option value="ingreso">Ingreso</option></select></td>
      <td style={cellPad}><input inputMode="decimal" value={f.amount} onChange={(e) => on('amount', e.target.value)} placeholder="monto *" style={inp} /></td>
    </>
  );
}
const Th = ({ children }) => <th style={{ position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E5EB', padding: '10px 14px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: 'left' }}>{children}</th>;
const Td = ({ children, muted, style }) => <td style={{ padding: '9px 14px', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9', color: muted ? '#475569' : undefined, ...style }}>{children}</td>;
function Clickable({ name, id, onOpen, dashed }) {
  if (!name) return <span style={{ color: '#9AA4B2' }}>—</span>;
  if (!id) return <span>{name}</span>;
  return <span onClick={() => onOpen(id)} style={{ cursor: 'pointer', borderBottom: dashed ? '1px dashed #C4CCD6' : undefined }}>{name}</span>;
}
