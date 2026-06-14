import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@korex/db';
import {
  CreditCard, RefreshCw, TrendingUp, Undo2, ShieldAlert, Landmark, ArrowDownLeft,
  ChevronDown, ChevronRight, CheckCircle2, Clock, AlertTriangle, Mail, Phone, Banknote, Search, Tag,
} from 'lucide-react';

const STRIPE = '#635BFF';

// ---- formato ----
function fmtMoney(amount, currency) {
  const n = Number(amount);
  if (amount === null || amount === undefined || Number.isNaN(n)) return '—';
  const cur = (currency || 'usd').toUpperCase();
  try { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: cur }).format(n); }
  catch { return `${cur} ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
}
function usd(n) {
  const v = Number(n);
  if (n === null || n === undefined || Number.isNaN(v)) return '—';
  return `USD ${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDay(dayKey) {
  if (!dayKey) return 'Sin fecha';
  try { return new Date(`${dayKey}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return dayKey; }
}
function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return '—'; }
}
function fmtTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---- etiquetas de estado ----
const CHARGE_ST = {
  succeeded: { label: 'Cobrado', color: '#15803D', Icon: CheckCircle2 },
  pending:   { label: 'Pendiente', color: '#A16207', Icon: Clock },
  failed:    { label: 'Fallido', color: '#BE123C', Icon: AlertTriangle },
};
const PAYOUT_ST = {
  paid:       { label: 'Pagado', color: '#15803D' },
  in_transit: { label: 'En camino', color: '#2563EB' },
  pending:    { label: 'Pendiente', color: '#A16207' },
  canceled:   { label: 'Cancelado', color: '#BE123C' },
  failed:     { label: 'Falló', color: '#BE123C' },
};
const DISPUTE_ST = {
  needs_response:         { label: 'Necesita respuesta', color: '#BE123C' },
  warning_needs_response: { label: 'Necesita respuesta', color: '#BE123C' },
  under_review:           { label: 'En revisión', color: '#A16207' },
  warning_under_review:   { label: 'En revisión', color: '#A16207' },
  won:                    { label: 'Ganada', color: '#15803D' },
  lost:                   { label: 'Perdida', color: '#BE123C' },
  charge_refunded:        { label: 'Reembolsada', color: '#6B7280' },
  warning_closed:         { label: 'Cerrada', color: '#6B7280' },
};
const DISPUTE_OPEN = new Set(['needs_response', 'warning_needs_response', 'under_review', 'warning_under_review']);

// Categoría (CRM / Publicidad) con color.
function catMeta(cat) {
  const c = (cat || '').toLowerCase();
  if (c === 'crm') return { label: 'CRM', color: '#2563EB', bg: '#EFF6FF' };
  if (c === 'publicidad' || c === 'ads' || c === 'meta') return { label: 'Publicidad', color: '#9333EA', bg: '#F5F3FF' };
  if (c) return { label: cat, color: '#6B7280', bg: '#F3F4F6' };
  return null;
}
function CatChip({ cat }) {
  const m = catMeta(cat);
  if (!m) return null;
  return <span className="text-[10px] font-bold px-1.5 py-px rounded-full inline-flex items-center gap-1" style={{ background: m.bg, color: m.color }}><Tag size={9} /> {m.label}</span>;
}

function Pill({ label, color, Icon }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold" style={{ color }}>
      {Icon && <Icon size={11} />} {label}
    </span>
  );
}

export default function StripePage() {
  const [charges, setCharges] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pagos');
  const [openPayout, setOpenPayout] = useState(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [ch, re, du, po, it] = await Promise.all([
      supabase.from('stripe_charges').select('*').order('created_at', { ascending: false }).limit(2000),
      supabase.from('stripe_refunds').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('stripe_disputes').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('stripe_payouts_x').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('stripe_payout_items').select('*'),
    ]);
    setCharges(ch.data || []);
    setRefunds(re.data || []);
    setDisputes(du.data || []);
    setPayouts(po.data || []);
    setItems(it.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // ---- métricas de cabecera ----
  const cobradoNeto = useMemo(
    () => charges.filter((c) => c.status === 'succeeded').reduce((s, c) => s + (Number(c.net_usd) || 0), 0),
    [charges],
  );
  const nPagosOk = useMemo(() => charges.filter((c) => c.status === 'succeeded').length, [charges]);
  const disputasAbiertas = useMemo(() => disputes.filter((d) => DISPUTE_OPEN.has(d.status)), [disputes]);
  const proximoPayout = useMemo(() => {
    const pend = payouts.filter((p) => p.status === 'pending' || p.status === 'in_transit')
      .sort((a, b) => (a.arrival_date || '').localeCompare(b.arrival_date || ''));
    if (pend.length) return { p: pend[0], future: true };
    const paid = payouts.filter((p) => p.status === 'paid');
    return paid.length ? { p: paid[0], future: false } : null;
  }, [payouts]);

  const itemsByPayout = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      if (!m.has(it.payout_id)) m.set(it.payout_id, []);
      m.get(it.payout_id).push(it);
    }
    return m;
  }, [items]);

  const chargeById = useMemo(() => {
    const m = new Map();
    for (const c of charges) m.set(c.id, c);
    return m;
  }, [charges]);

  // búsqueda por nombre / email / teléfono / producto
  const filteredCharges = useMemo(() => {
    const term = norm(q.trim());
    if (!term) return charges;
    return charges.filter((c) =>
      norm(c.customer_name).includes(term) ||
      norm(c.customer_email).includes(term) ||
      norm(c.customer_phone).includes(term) ||
      norm(c.product_name).includes(term));
  }, [charges, q]);

  const byDay = (list, field = 'created_at') => {
    const map = new Map();
    for (const t of list) {
      const day = t[field] ? t[field].slice(0, 10) : 'sin-fecha';
      if (!map.has(day)) map.set(day, { day, items: [] });
      map.get(day).items.push(t);
    }
    return [...map.values()].sort((a, b) => b.day.localeCompare(a.day));
  };

  const TABS = [
    { id: 'pagos', label: 'Pagos', count: charges.length },
    { id: 'reembolsos', label: 'Reembolsos y disputas', count: refunds.length + disputes.length },
    { id: 'payouts', label: 'Payouts a Mercury', count: payouts.length },
  ];

  return (
    <div className="max-w-[920px] mx-auto">
      {/* Cabecera */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-blue-bg2 to-white p-5 mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-8 flex-wrap">
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5"><TrendingUp size={14} /> Cobrado neto</div>
            <div className="text-[30px] font-extrabold mt-1 leading-none" style={{ color: '#15803D' }}>{usd(cobradoNeto)}</div>
            <div className="text-[12px] text-text3 mt-1.5">{nPagosOk} pagos · neto en USD</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5"><Undo2 size={14} /> Reembolsos</div>
            <div className="text-[30px] font-extrabold mt-1 leading-none" style={{ color: '#A16207' }}>{refunds.length}</div>
            <div className="text-[12px] text-text3 mt-1.5">histórico</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5"><ShieldAlert size={14} /> Disputas abiertas</div>
            <div className="text-[30px] font-extrabold mt-1 leading-none" style={{ color: disputasAbiertas.length ? '#BE123C' : 'var(--color-text)' }}>{disputasAbiertas.length}</div>
            <div className="text-[12px] text-text3 mt-1.5">{disputes.length} en total</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5"><Landmark size={14} /> Próximo payout</div>
            {proximoPayout ? (
              <>
                <div className="text-[30px] font-extrabold text-text mt-1 leading-none">{usd(proximoPayout.p.amount)}</div>
                <div className="text-[12px] text-text3 mt-1.5">{proximoPayout.future ? 'llega' : 'llegó'} el {fmtDate(proximoPayout.p.arrival_date)}</div>
              </>
            ) : (
              <><div className="text-[30px] font-extrabold text-text3 mt-1 leading-none">—</div><div className="text-[12px] text-text3 mt-1.5">sin payouts</div></>
            )}
          </div>
        </div>
        <button onClick={load} title="Actualizar" className="inline-flex items-center gap-1.5 text-[12px] text-text2 hover:text-text bg-white border border-border rounded-lg px-3 py-2 cursor-pointer">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="relative px-4 py-2.5 text-[13px] font-semibold cursor-pointer bg-transparent border-0 -mb-px"
            style={{ color: tab === t.id ? 'var(--color-text)' : 'var(--color-text3)', borderBottom: tab === t.id ? `2px solid ${STRIPE}` : '2px solid transparent' }}>
            {t.label}
            {t.count > 0 && <span className="ml-1.5 text-[10.5px] font-bold px-1.5 py-px rounded-full bg-surface2 text-text3">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading && charges.length === 0 && payouts.length === 0 ? (
        <div className="text-text3 text-center py-16 text-sm">Cargando…</div>
      ) : tab === 'pagos' ? (
        <>
          <SearchBar q={q} setQ={setQ} placeholder="Buscar por nombre, email, teléfono o producto…" />
          {q && <div className="text-[11.5px] text-text3 mb-2">{filteredCharges.length} resultado{filteredCharges.length === 1 ? '' : 's'}</div>}
          <PagosTab groups={byDay(filteredCharges)} />
        </>
      ) : tab === 'reembolsos' ? (
        <ReembolsosTab refunds={refunds} disputes={disputes} chargeById={chargeById} />
      ) : (
        <PayoutsTab groups={byDay(payouts, 'arrival_date')} itemsByPayout={itemsByPayout} open={openPayout} setOpen={setOpenPayout} />
      )}
    </div>
  );
}

function SearchBar({ q, setQ, placeholder }) {
  return (
    <div className="relative mb-3">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2.5 text-[13px] rounded-xl border border-border bg-white outline-none focus:border-blue" />
    </div>
  );
}

// ---------- Pagos ----------
function PagosTab({ groups }) {
  if (!groups.length) return <Empty text="No hay pagos que coincidan." />;
  return (
    <div className="flex flex-col gap-3">
      {groups.map((d) => (
        <div key={d.day} className="border border-border rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-2 bg-surface2/60 border-b border-border">
            <span className="text-[12px] font-bold text-text capitalize">{fmtDay(d.day)}</span>
          </div>
          <div>
            {d.items.map((c) => {
              const st = CHARGE_ST[c.status] || { label: c.status || '—', color: '#6B7280', Icon: Clock };
              return (
                <div key={c.id} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-surface2">
                  <CreditCard size={16} className="shrink-0 mt-0.5" style={{ color: STRIPE }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-bold text-text">{fmtMoney(c.amount, c.currency)}</span>
                      {c.net_usd != null && c.currency && c.currency.toLowerCase() !== 'usd' && (
                        <span className="text-[11px] text-text3">≈ {usd(c.net_usd)} neto</span>
                      )}
                      <CatChip cat={c.category || c.category_auto} />
                      {c.disputed && <span className="text-[10px] font-bold px-1.5 py-px rounded-full" style={{ background: '#FEE2E2', color: '#BE123C' }}>en disputa</span>}
                      {c.refunded && <span className="text-[10px] font-bold px-1.5 py-px rounded-full" style={{ background: '#FEF3C7', color: '#A16207' }}>reembolsado</span>}
                    </div>
                    <div className="mt-0.5 text-[13px] text-text2 font-medium truncate">{c.customer_name || c.customer_email || 'Sin nombre'}</div>
                    {c.product_name && <div className="text-[11.5px] text-text3 truncate">{c.product_name}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text2">
                      <Pill {...st} />
                      {c.customer_email && c.customer_name && <span className="inline-flex items-center gap-1 text-text3"><Mail size={11} /> {c.customer_email}</span>}
                      {c.customer_phone && <span className="inline-flex items-center gap-1 text-text3"><Phone size={11} /> {c.customer_phone}</span>}
                      <span className="text-text3">{fmtTime(c.created_at)}</span>
                      {c.risk_level && c.risk_level !== 'normal' && <span className="text-[10.5px] font-semibold" style={{ color: '#A16207' }}>riesgo {c.risk_level}</span>}
                      {c.status === 'failed' && c.failure_message && <span className="text-[11px]" style={{ color: '#BE123C' }}>{c.failure_message}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Reembolsos y disputas ----------
function ReembolsosTab({ refunds, disputes, chargeById }) {
  if (!refunds.length && !disputes.length) return <Empty text="No hay reembolsos ni disputas. 🎉" />;
  return (
    <div className="flex flex-col gap-6">
      {disputes.length > 0 && (
        <section>
          <h3 className="text-[13px] font-bold text-text mb-2 flex items-center gap-1.5"><ShieldAlert size={15} style={{ color: '#BE123C' }} /> Disputas / contracargos</h3>
          <div className="border border-border rounded-xl bg-white overflow-hidden">
            {disputes.map((d) => {
              const st = DISPUTE_ST[d.status] || { label: d.status || '—', color: '#6B7280' };
              const ch = chargeById.get(d.charge_id);
              const open = DISPUTE_OPEN.has(d.status);
              return (
                <div key={d.id} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-surface2">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5" style={{ color: open ? '#BE123C' : '#9CA3AF' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-bold text-text">{fmtMoney(d.amount, d.currency)}</span>
                      <Pill label={st.label} color={st.color} />
                    </div>
                    <div className="mt-0.5 text-[13px] text-text2 truncate">{ch?.customer_name || ch?.customer_email || 'Cliente desconocido'}{d.reason ? ` · ${d.reason}` : ''}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text3">
                      <span>{fmtDate(d.created_at)}</span>
                      {open && d.evidence_due_by && (
                        <span className="font-semibold" style={{ color: '#BE123C' }}>⏰ Responder antes del {fmtDate(d.evidence_due_by)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {refunds.length > 0 && (
        <section>
          <h3 className="text-[13px] font-bold text-text mb-2 flex items-center gap-1.5"><Undo2 size={15} style={{ color: '#A16207' }} /> Reembolsos</h3>
          <div className="border border-border rounded-xl bg-white overflow-hidden">
            {refunds.map((r) => {
              const ok = r.status === 'succeeded';
              const ch = chargeById.get(r.charge_id);
              return (
                <div key={r.id} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-surface2">
                  <Undo2 size={16} className="shrink-0 mt-0.5" style={{ color: '#A16207' }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-bold" style={{ color: '#A16207' }}>−{fmtMoney(r.amount, r.currency)}</span>
                      <Pill label={ok ? 'Procesado' : (r.status || '—')} color={ok ? '#15803D' : '#A16207'} Icon={ok ? CheckCircle2 : Clock} />
                    </div>
                    {(ch?.customer_name || ch?.customer_email) && <div className="mt-0.5 text-[13px] text-text2 truncate">{ch.customer_name || ch.customer_email}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text3">
                      <span>{fmtDate(r.created_at)}</span>
                      {r.reason && <span>motivo: {r.reason}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------- Payouts a Mercury (agrupados por día, como Pagos) ----------
function PayoutsTab({ groups, itemsByPayout, open, setOpen }) {
  if (!groups.length) return <Empty text="Todavía no hay payouts." />;
  return (
    <div className="flex flex-col gap-3">
      {groups.map((d) => (
        <div key={d.day} className="border border-border rounded-xl bg-white overflow-hidden">
          <div className="px-4 py-2 bg-surface2/60 border-b border-border">
            <span className="text-[12px] font-bold text-text capitalize">{fmtDay(d.day)}</span>
          </div>
          <div>
            {d.items.map((p) => {
              const st = PAYOUT_ST[p.status] || { label: p.status || '—', color: '#6B7280' };
              const future = p.status === 'pending' || p.status === 'in_transit';
              const its = (itemsByPayout.get(p.id) || []).slice().sort((a, b) => (b.net_usd || 0) - (a.net_usd || 0));
              const isOpen = open === p.id;
              const arrived = p.mercury_arrived_at;
              return (
                <div key={p.id}>
                  <button onClick={() => setOpen(isOpen ? null : p.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface2 cursor-pointer bg-transparent border-0 border-b border-border last:border-0">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: future ? '#EFF6FF' : '#F0FDF4', color: st.color }}>
                      <Landmark size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] font-bold text-text">{usd(p.amount)}</span>
                        <Pill label={st.label} color={st.color} />
                        {arrived ? (
                          <span className="text-[10px] font-bold px-1.5 py-px rounded-full inline-flex items-center gap-1" style={{ background: '#F0FDF4', color: '#15803D' }}>
                            <CheckCircle2 size={9} /> Llegó a Mercury
                          </span>
                        ) : future ? (
                          <span className="text-[10px] font-bold px-1.5 py-px rounded-full inline-flex items-center gap-1" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                            En camino a Mercury
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-text3">
                        {arrived ? `Llegó a Mercury el ${fmtDate(arrived)}` : future ? `Llega ~${fmtDate(p.arrival_date)}` : `Disponible el ${fmtDate(p.arrival_date)}`}
                        {' · '}{its.length} {its.length === 1 ? 'pago' : 'pagos'}
                      </div>
                    </div>
                    {isOpen ? <ChevronDown size={16} className="text-text3 shrink-0" /> : <ChevronRight size={16} className="text-text3 shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="border-b border-border bg-surface2/30">
                      {its.length === 0 ? (
                        <div className="px-4 py-3 text-[12px] text-text3">Sin detalle de pagos todavía (se completa en la próxima sincronización).</div>
                      ) : (
                        its.map((it) => {
                          const isCharge = it.reporting_category === 'charge' || it.type === 'charge';
                          const label = isCharge ? (it.customer_name || it.customer_email || 'Pago')
                            : it.reporting_category === 'refund' ? 'Reembolso'
                            : it.reporting_category === 'dispute' ? 'Disputa'
                            : it.reporting_category === 'fee' ? 'Comisión'
                            : (it.reporting_category || it.type || 'Ajuste');
                          return (
                            <div key={it.balance_tx_id} className="flex items-start gap-3 px-4 py-2.5 border-b border-border last:border-0">
                              <ArrowDownLeft size={14} className="shrink-0 mt-0.5" style={{ color: isCharge ? '#15803D' : '#9CA3AF' }} />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[13px] font-medium text-text truncate">{label}</span>
                                  <CatChip cat={it.category || it.category_auto} />
                                </div>
                                {isCharge && it.customer_email && <div className="text-[11px] text-text3 truncate inline-flex items-center gap-1"><Mail size={10} /> {it.customer_email}</div>}
                                {it.product_name && <div className="text-[11px] text-text3 truncate">{it.product_name}</div>}
                                <div className="text-[11px] text-text3">
                                  {isCharge && it.charge_amount != null ? fmtMoney(it.charge_amount, it.charge_currency) : (it.reporting_category || '')}
                                  {it.fee_usd ? ` · comisión ${usd(it.fee_usd)}` : ''}
                                </div>
                              </div>
                              <span className="text-[13px] font-bold shrink-0" style={{ color: (it.net_usd || 0) < 0 ? '#BE123C' : '#15803D' }}>
                                {(it.net_usd || 0) < 0 ? '−' : ''}{usd(it.net_usd)}
                              </span>
                            </div>
                          );
                        })
                      )}
                      <div className="px-4 py-2 flex items-center justify-between bg-white">
                        <span className="text-[11.5px] text-text3 inline-flex items-center gap-1"><Banknote size={12} /> Total enviado a Mercury</span>
                        <span className="text-[13.5px] font-extrabold text-text">{usd(p.amount)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }) {
  return <div className="text-[13px] text-text3 border border-dashed border-border rounded-xl p-6 text-center">{text}</div>;
}
