import { useEffect, useState, useMemo, useCallback } from 'react';
import { sbFetch } from '@korex/db';
import Combo from '../components/Combo.jsx';

// Seguimiento de pagos en cuotas (reemplaza el que vivía en el Sheet): por cada cliente
// que paga en cuotas muestra cuánto pagó, cuánto le queda, cuándo es la próxima cuota y
// su estado. Las ventas a cuotas se cargan solas desde el onboarding (crear-venta) y se
// pueden agregar/editar a mano. El cron pago-reminders avisa por Slack 3 días antes.

const todayStr = () => new Date().toISOString().slice(0, 10);
const CURS = ['USD', 'EUR', 'ARS', 'MXN'];
const CUR_SYM = { USD: 'US$', EUR: '€', ARS: '$', MXN: 'MX$' };
const PAY_OPTS = ['Stripe', 'Transferencia', 'Mercury', 'USDT', 'PayPal', 'Efectivo', 'Otro'];
const fmt = (n, cur = 'USD') => (CUR_SYM[cur] || '$') + ' ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const num = (x) => { const n = parseFloat(String(x).replace(',', '.')); return isFinite(n) ? n : null; };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function fdate(iso) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
function addMonthsIso(iso, months) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return iso;
  let y = Number(m[1]); let mo = Number(m[2]) - 1 + months; const d = Number(m[3]);
  y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  const p = (x) => String(x).padStart(2, '0');
  return `${y}-${p(mo + 1)}-${p(day)}`;
}
function daysUntil(iso) {
  if (!iso) return null;
  const a = new Date(todayStr() + 'T00:00:00Z').getTime();
  const b = new Date(iso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}
// Semáforo de la próxima cuota.
function dueChip(iso) {
  const d = daysUntil(iso);
  if (d == null) return { bg: '#F1F5F9', fg: '#94A3B8', label: 'sin fecha' };
  if (d < 0) return { bg: '#FEF2F2', fg: '#DC2626', label: `vencida (${-d}d)` };
  if (d === 0) return { bg: '#FFF7ED', fg: '#C2410C', label: 'vence hoy' };
  if (d <= 3) return { bg: '#FEFCE8', fg: '#CA8A04', label: `en ${d}d` };
  return { bg: '#F0FDFA', fg: '#0c8584', label: `en ${d}d` };
}

export default function SeguimientoPagosPage() {
  const [plans, setPlans] = useState(null);
  const [cuotasByPlan, setCuotasByPlan] = useState({});
  const [roster, setRoster] = useState([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [soloActivos, setSoloActivos] = useState(true);
  const [open, setOpen] = useState({});       // plan_id -> abierto
  const [modal, setModal] = useState(null);    // form de alta/edición de plan
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    sbFetch('fin_payment_plans_view?select=*&order=status.asc,next_due_date.asc.nullslast,created_at.desc')
      .then((d) => setPlans(Array.isArray(d) ? d : []))
      .catch((e) => setError(String(e)));
    sbFetch('fin_payment_cuotas?select=*&order=n.asc')
      .then((d) => {
        const m = {};
        (Array.isArray(d) ? d : []).forEach((c) => { (m[c.plan_id] = m[c.plan_id] || []).push(c); });
        setCuotasByPlan(m);
      }).catch(() => {});
    sbFetch('fin_directory?select=nombre,tipo,roles&order=nombre.asc&limit=2000')
      .then((d) => setRoster(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const clientOpts = useMemo(() => {
    const s = new Set();
    roster.forEach((p) => { if (p.nombre && (p.tipo === 'Cliente' || (Array.isArray(p.roles) && p.roles.includes('Cliente')))) s.add(p.nombre); });
    return [...s].sort();
  }, [roster]);
  const personOpts = useMemo(() => [...new Set(roster.map((p) => p.nombre).filter(Boolean))].sort(), [roster]);

  // Actualiza el estado del plan según sus cuotas (completado si no queda ninguna pendiente).
  const syncPlanStatus = async (planId) => {
    const cs = cuotasByPlan[planId] || [];
    const pend = cs.filter((c) => c.status !== 'pagada').length;
    const plan = (plans || []).find((p) => p.id === planId);
    if (!plan || plan.status === 'cancelado') return;
    const next = pend === 0 ? 'completado' : 'activo';
    if (next !== plan.status) {
      await sbFetch(`fin_payment_plans?id=eq.${planId}`, { method: 'PATCH', body: JSON.stringify({ status: next }) }).catch(() => {});
    }
  };

  const toggleCuota = async (cuota) => {
    const pagada = cuota.status === 'pagada';
    const body = pagada ? { status: 'pendiente', paid_date: null } : { status: 'pagada', paid_date: todayStr() };
    // optimista
    setCuotasByPlan((m) => ({ ...m, [cuota.plan_id]: (m[cuota.plan_id] || []).map((c) => (c.id === cuota.id ? { ...c, ...body } : c)) }));
    try {
      await sbFetch(`fin_payment_cuotas?id=eq.${cuota.id}`, { method: 'PATCH', body: JSON.stringify(body), throwOnError: true });
      await syncPlanStatus(cuota.plan_id);
    } finally { load(); }
  };

  const patchCuota = async (cuota, body) => {
    setCuotasByPlan((m) => ({ ...m, [cuota.plan_id]: (m[cuota.plan_id] || []).map((c) => (c.id === cuota.id ? { ...c, ...body } : c)) }));
    try { await sbFetch(`fin_payment_cuotas?id=eq.${cuota.id}`, { method: 'PATCH', body: JSON.stringify(body), throwOnError: true }); } catch { load(); }
  };

  const addCuota = async (plan) => {
    const cs = cuotasByPlan[plan.id] || [];
    const lastDue = cs.length ? cs[cs.length - 1].due_date : (plan.start_date || todayStr());
    const body = { plan_id: plan.id, n: cs.length + 1, due_date: addMonthsIso(lastDue, 1), amount: 0, status: 'pendiente' };
    await sbFetch('fin_payment_cuotas', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) }).catch(() => {});
    load();
  };

  const delCuota = async (cuota) => {
    await sbFetch(`fin_payment_cuotas?id=eq.${cuota.id}`, { method: 'DELETE' }).catch(() => {});
    load();
  };

  const delPlan = async (planId) => {
    await sbFetch(`fin_payment_cuotas?plan_id=eq.${planId}`, { method: 'DELETE' }).catch(() => {});
    await sbFetch(`fin_payment_plans?id=eq.${planId}`, { method: 'DELETE' }).catch(() => {});
    setModal(null); load();
  };

  const filtered = useMemo(() => {
    if (!plans) return [];
    const qq = q.trim().toLowerCase();
    return plans.filter((p) =>
      (!soloActivos || p.status === 'activo') &&
      (!qq || (p.client_name || '').toLowerCase().includes(qq) || (p.person_name || '').toLowerCase().includes(qq)));
  }, [plans, q, soloActivos]);

  const totals = useMemo(() => {
    const t = { restante: 0, cobrado: 0, activos: 0, proximas: 0 };
    (plans || []).forEach((p) => {
      if (p.status === 'activo') {
        t.activos += 1;
        t.restante += Number(p.remaining_amount) || 0;
        const d = daysUntil(p.next_due_date);
        if (d != null && d <= 7) t.proximas += 1;
      }
      t.cobrado += Number(p.paid_amount) || 0;
    });
    return t;
  }, [plans]);

  if (error) return <Msg>Error cargando seguimiento de pagos: {error}</Msg>;
  if (!plans) return <Msg>Cargando seguimiento de pagos…</Msg>;

  const summary = [
    { label: 'Por cobrar (activos)', value: fmt(totals.restante), accent: '#e11d48', color: '#be123c' },
    { label: 'Cobrado acumulado', value: fmt(totals.cobrado), accent: '#16a34a', color: '#15803d' },
    { label: 'Planes activos', value: String(totals.activos), accent: '#0EA5A4', color: '#0c8584' },
    { label: 'Cuotas próximas (7d)', value: String(totals.proximas), accent: '#f59e0b', color: '#b45309' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '16px 22px 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 12, flexShrink: 0 }}>
        {summary.map((s) => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #E2E5EB', borderLeft: `3px solid ${s.accent}`, borderRadius: 11, padding: '10px 13px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#8A93A2' }}>{s.label}</div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', marginTop: 3, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
        <button onClick={() => setModal(newPlanForm())} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#fff', border: 0, borderRadius: 9, padding: '8px 13px', cursor: 'pointer', background: '#16a34a' }}>
          <Plus /> Nuevo plan de pagos
        </button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente o persona…" style={{ border: '1px solid #E2E5EB', borderRadius: 9, padding: '8px 11px', fontSize: 13, outline: 'none', width: 260 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} /> Solo activos
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#9AA4B2' }}>{filtered.length} plan{filtered.length === 1 ? '' : 'es'}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, boxShadow: '0 1px 3px rgba(13,17,23,.04)' }}>
        {filtered.length === 0 ? (
          <div style={{ color: '#9AA4B2', textAlign: 'center', padding: '70px 0', fontSize: 13 }}>
            No hay planes de pago en cuotas. Las ventas a cuotas se cargan solas desde el onboarding, o creá uno con <b>Nuevo plan de pagos</b>.
          </div>
        ) : (
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12.5 }}>
            <thead>
              <tr>
                {['Cliente', 'Total', 'Cobrado', 'Restante', 'Cuotas', 'Próxima cuota', 'Método', ''].map((h, i) => (
                  <th key={i} style={{ position: 'sticky', top: 0, zIndex: 2, background: '#F8FAFC', borderBottom: '1px solid #E2E5EB', textAlign: i >= 1 && i <= 4 ? 'right' : 'left', padding: '9px 12px', fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const cs = cuotasByPlan[p.id] || [];
                const isOpen = !!open[p.id];
                const chip = dueChip(p.next_due_date);
                const stChip = p.status === 'completado' ? { bg: '#ECFDF5', fg: '#16A34A', label: 'Completado' }
                  : p.status === 'cancelado' ? { bg: '#FEF2F2', fg: '#EF4444', label: 'Cancelado' }
                  : { bg: '#EFF6FF', fg: '#2563EB', label: 'Activo' };
                return (
                  <FragmentRow key={p.id}>
                    <tr style={{ cursor: 'pointer', background: isOpen ? '#F6FBFB' : '#fff' }} onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Caret open={isOpen} />
                          <div>
                            <div style={{ fontWeight: 700, color: '#1A1D26' }}>{p.client_name}</div>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: stChip.bg, color: stChip.fg }}>{stChip.label}</span>
                          </div>
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(p.total_amount, p.currency)}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#15803d' }}>{fmt(p.paid_amount, p.currency)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: (Number(p.remaining_amount) || 0) > 0 ? '#be123c' : '#15803d' }}>{fmt(p.remaining_amount, p.currency)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{p.cuotas_pagadas}/{p.cuotas_count}</td>
                      <td style={td}>
                        {p.next_due_date ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <span>{fdate(p.next_due_date)}</span>
                            {p.next_amount != null && <span style={{ color: '#64748B' }}>· {fmt(p.next_amount, p.currency)}</span>}
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: chip.bg, color: chip.fg }}>{chip.label}</span>
                          </span>
                        ) : <span style={{ color: '#cbd5e1' }}>— sin pendientes</span>}
                      </td>
                      <td style={{ ...td, color: '#475569' }}>{p.payment_method || '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setModal(editPlanForm(p))} title="Editar plan" style={iconBtn}><PencilIcon /></button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0, background: '#FAFCFD', borderBottom: '1px solid #EEF1F5' }}>
                          <div style={{ padding: '10px 16px 14px 38px' }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                              <thead>
                                <tr>
                                  {['#', 'Vence', 'Monto', 'Estado', 'Pagada el', ''].map((h, i) => (
                                    <th key={i} style={{ textAlign: i === 2 ? 'right' : 'left', padding: '4px 8px', fontWeight: 600, color: '#9AA4B2', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {cs.map((c) => {
                                  const pagada = c.status === 'pagada';
                                  const ch = pagada ? { bg: '#ECFDF5', fg: '#16A34A', label: 'Pagada' } : dueChip(c.due_date);
                                  return (
                                    <tr key={c.id}>
                                      <td style={ctd}>{c.n}</td>
                                      <td style={ctd}>
                                        <input type="date" defaultValue={c.due_date || ''} onBlur={(e) => { if (e.target.value !== (c.due_date || '')) patchCuota(c, { due_date: e.target.value || null }); }} style={miniInp} />
                                      </td>
                                      <td style={{ ...ctd, textAlign: 'right' }}>
                                        <input defaultValue={c.amount ?? ''} onBlur={(e) => { const v = num(e.target.value); if (v != null && v !== Number(c.amount)) patchCuota(c, { amount: r2(v) }); }} style={{ ...miniInp, width: 90, textAlign: 'right' }} />
                                      </td>
                                      <td style={ctd}><span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: ch.bg, color: ch.fg }}>{ch.label}</span></td>
                                      <td style={{ ...ctd, color: '#64748B' }}>{pagada ? fdate(c.paid_date) : '—'}</td>
                                      <td style={{ ...ctd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <button onClick={() => toggleCuota(c)} style={{ ...miniBtn, color: pagada ? '#b45309' : '#16a34a', borderColor: pagada ? '#FDE68A' : '#BBF7D0' }}>{pagada ? 'Marcar pendiente' : 'Marcar pagada'}</button>
                                        <button onClick={() => delCuota(c)} title="Borrar cuota" style={{ ...miniBtn, color: '#be123c', borderColor: '#FBC9CF', marginLeft: 6 }}>✕</button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            <div style={{ display: 'flex', gap: 10, marginTop: 8, alignItems: 'center' }}>
                              <button onClick={() => addCuota(p)} style={{ ...miniBtn, color: '#0c8584', borderColor: '#99E6E3' }}>+ Agregar cuota</button>
                              {p.notes && <span style={{ fontSize: 11.5, color: '#6B7585' }}>📝 {p.notes}</span>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div style={{ height: 14, flexShrink: 0 }} />

      {modal && <PlanModal form={modal} setForm={setModal} clientOpts={clientOpts} personOpts={personOpts} busy={busy} setBusy={setBusy} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} onDelete={delPlan} />}
    </div>
  );
}

/* ---------- alta / edición de plan ---------- */
function newPlanForm() {
  return { mode: 'new', client_name: '', person_name: '', currency: 'USD', total_amount: '', payment_method: 'Transferencia', start_date: todayStr(), notes: '', n_cuotas: '3', cobrado_inicial: '', primera_cuota: addMonthsIso(todayStr(), 1) };
}
function editPlanForm(p) {
  return { mode: 'edit', id: p.id, client_name: p.client_name || '', person_name: p.person_name || '', currency: p.currency || 'USD', total_amount: p.total_amount ?? '', payment_method: p.payment_method || '', start_date: p.start_date || todayStr(), notes: p.notes || '', status: p.status };
}

function PlanModal({ form, setForm, clientOpts, personOpts, busy, setBusy, onClose, onSaved, onDelete }) {
  const isEdit = form.mode === 'edit';
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const total = num(form.total_amount);
  const ok = (form.client_name || '').trim() && total != null && total > 0;

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const planBody = {
        client_name: form.client_name.trim(),
        person_name: (form.person_name || '').trim() || form.client_name.trim(),
        currency: form.currency,
        total_amount: r2(total),
        payment_method: form.payment_method || null,
        start_date: form.start_date || null,
        notes: (form.notes || '').trim() || null,
      };
      if (isEdit) {
        await sbFetch(`fin_payment_plans?id=eq.${form.id}`, { method: 'PATCH', body: JSON.stringify({ ...planBody, status: form.status }), throwOnError: true });
      } else {
        // Crear plan + generar el cronograma de cuotas.
        const [plan] = await sbFetch('fin_payment_plans', { method: 'POST', headers: { Prefer: 'return=representation' }, throwOnError: true, body: JSON.stringify({ ...planBody, status: 'activo', source: 'manual' }) });
        const N = Math.max(1, Math.round(num(form.n_cuotas) || 1));
        const paid0 = num(form.cobrado_inicial) || 0;
        const cuotas = [];
        if (paid0 > 0) {
          cuotas.push({ plan_id: plan.id, n: 1, due_date: form.start_date || todayStr(), amount: r2(paid0), status: 'pagada', paid_date: form.start_date || todayStr() });
          const k = Math.max(1, N - 1);
          const per = r2(Math.max(0, total - paid0) / k);
          let due = form.primera_cuota || addMonthsIso(form.start_date || todayStr(), 1);
          for (let i = 0; i < k; i++) { cuotas.push({ plan_id: plan.id, n: i + 2, due_date: due, amount: per, status: 'pendiente' }); due = addMonthsIso(due, 1); }
        } else {
          const per = r2(total / N);
          let due = form.primera_cuota || form.start_date || todayStr();
          for (let i = 0; i < N; i++) { cuotas.push({ plan_id: plan.id, n: i + 1, due_date: due, amount: per, status: 'pendiente' }); due = addMonthsIso(due, 1); }
        }
        await sbFetch('fin_payment_cuotas', { method: 'POST', headers: { Prefer: 'return=minimal' }, throwOnError: true, body: JSON.stringify(cuotas) });
      }
      onSaved();
    } catch { /* noop */ } finally { setBusy(false); }
  };

  const lab = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 };
  const inp = { width: '100%', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,23,.4)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(13,17,23,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EEF1F5' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{isEdit ? 'Editar plan de pagos' : 'Nuevo plan de pagos'}</div>
            <div style={{ fontSize: 12, color: '#9AA4B2', marginTop: 2 }}>{isEdit ? 'Las cuotas se editan en la fila desplegada.' : 'Generamos el cronograma de cuotas; lo ajustás después si hace falta.'}</div>
          </div>
          <button onClick={onClose} style={{ border: 0, background: '#F1F5F9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#64748B', fontSize: 16 }}>✕</button>
        </div>
        <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lab}>Cliente <span style={{ color: '#e11d48' }}>*</span> <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· de la Base de datos</span></label>
            <Combo value={form.client_name} onChange={(v) => set('client_name', v || '')} options={clientOpts} placeholder="elegí el cliente…" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lab}>Quién paga <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· opcional (por defecto = cliente)</span></label>
            <Combo value={form.person_name} onChange={(v) => set('person_name', v || '')} options={personOpts} placeholder="(igual que el cliente)" />
          </div>
          <div>
            <label style={lab}>Valor total <span style={{ color: '#e11d48' }}>*</span></label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={form.currency} onChange={(e) => set('currency', e.target.value)} style={{ ...inp, width: 78 }}>{CURS.map((c) => <option key={c} value={c}>{CUR_SYM[c]}</option>)}</select>
              <input inputMode="decimal" value={form.total_amount} onChange={(e) => set('total_amount', e.target.value)} placeholder="0" style={inp} />
            </div>
          </div>
          <div>
            <label style={lab}>Método de pago</label>
            <select value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)} style={inp}>
              <option value="">—</option>
              {PAY_OPTS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {!isEdit && (
            <>
              <div>
                <label style={lab}>Cantidad de cuotas</label>
                <input inputMode="numeric" value={form.n_cuotas} onChange={(e) => set('n_cuotas', e.target.value)} placeholder="3" style={inp} />
              </div>
              <div>
                <label style={lab}>Ya cobrado (1ª cuota) <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· opcional</span></label>
                <input inputMode="decimal" value={form.cobrado_inicial} onChange={(e) => set('cobrado_inicial', e.target.value)} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lab}>Fecha de inicio</label>
                <input type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lab}>1ª cuota a cobrar</label>
                <input type="date" value={form.primera_cuota} onChange={(e) => set('primera_cuota', e.target.value)} style={inp} />
              </div>
            </>
          )}
          {isEdit && (
            <div>
              <label style={lab}>Estado</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} style={inp}>
                <option value="activo">Activo</option>
                <option value="completado">Completado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lab}>Notas</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Detalle del acuerdo de cuotas…" style={{ ...inp, minHeight: 56, resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #EEF1F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ minHeight: 30, display: 'flex', alignItems: 'center', gap: 8 }}>
            {isEdit && (confirmDel
              ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#be123c' }}>¿Borrar plan y cuotas?
                  <button onClick={() => onDelete(form.id)} style={{ border: 0, background: '#e11d48', color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 11px', borderRadius: 8, cursor: 'pointer' }}>Sí, borrar</button>
                  <button onClick={() => setConfirmDel(false)} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 8, cursor: 'pointer' }}>No</button>
                </span>
              : <button onClick={() => setConfirmDel(true)} style={{ border: '1px solid #FBC9CF', background: '#fff', color: '#be123c', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 9, cursor: 'pointer' }}>Eliminar</button>)}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 9, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={save} disabled={!ok || busy} style={{ border: 0, background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9, cursor: 'pointer', opacity: (!ok || busy) ? 0.6 : 1 }}>{busy ? 'Guardando…' : (isEdit ? 'Guardar' : 'Crear plan')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- bits ---------- */
const td = { padding: '10px 12px', borderBottom: '1px solid #EEF1F5', verticalAlign: 'middle' };
const ctd = { padding: '4px 8px', borderBottom: '1px solid #F4F6F9' };
const miniInp = { border: '1px solid #E2E5EB', borderRadius: 6, padding: '4px 7px', fontSize: 12, outline: 'none', background: '#fff' };
const miniBtn = { border: '1px solid #E2E5EB', background: '#fff', borderRadius: 7, padding: '4px 9px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' };
const iconBtn = { border: 0, background: 'transparent', cursor: 'pointer', color: '#B6BFCC', padding: 4, display: 'inline-flex' };
const Plus = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg>;
const PencilIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
const Caret = ({ open }) => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}><path d="m9 18 6-6-6-6" /></svg>;
const Msg = ({ children }) => <div style={{ color: '#9AA4B2', textAlign: 'center', padding: '80px 0' }}>{children}</div>;
function FragmentRow({ children }) { return <>{children}</>; }
