import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@korex/db';
import { useApp } from '../context/AppContext';
import { Landmark, CreditCard, AlertTriangle, CheckCircle2, RefreshCw, Users, Wallet, PiggyBank, Megaphone, ArrowDownCircle } from 'lucide-react';

// ── Formato ──────────────────────────────────────────────────────────────────
function money(amount, currency = 'USD') {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—';
  return `${currency} ${Math.abs(Number(amount)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

// ── Clasificación del fondo a partir del apodo (nickname) de Mercury ──────────
// Los apodos traen "<Cliente> <Categoría>" (ej. "Sergio Cánovas Publicidad") o son
// fondos propios de Korex (Cuenta Principal, Reserva, A distribuir, etc.).
const INTERNAL_RE = /korex|reserva|distribuir|fondos? general|otras comisiones|prueba|mat[ií]as braszka/i;
function internalLabel(nn) {
  if (/principal/i.test(nn)) return 'Principal';
  if (/reserva/i.test(nn)) return 'Reserva';
  if (/distribuir|general/i.test(nn)) return 'A distribuir';
  if (/otras comisiones/i.test(nn)) return 'Otras comisiones';
  if (/prueba/i.test(nn)) return 'Prueba';
  if (/mat[ií]as braszka/i.test(nn)) return 'Cuenta Matías';
  return 'Interno';
}
function classify(rawName) {
  const nn = (rawName || '').trim();
  if (!nn) return { group: 'Sin nombre', internal: true, category: 'Interno' };
  if (INTERNAL_RE.test(nn)) return { group: 'Korex / Internos', internal: true, category: internalLabel(nn) };
  let category = 'General';
  if (/public/i.test(nn)) category = 'Publicidad';
  else if (/comisi/i.test(nn)) category = 'Comisiones';
  const client = nn.replace(/\s*(publicidad|comisiones)\s*$/i, '').trim() || nn;
  return { group: client, internal: false, category };
}
const CAT_STYLE = {
  Publicidad:        { bg: '#EEF2FF', color: '#4F5BD5' },
  Comisiones:        { bg: '#ECFDF5', color: '#15803D' },
  General:           { bg: '#F1F5F9', color: '#475569' },
  Principal:         { bg: '#F5F3FF', color: '#7C3AED' },
  Reserva:           { bg: '#FFF7ED', color: '#C2410C' },
  'A distribuir':    { bg: '#FEFCE8', color: '#A16207' },
  'Otras comisiones':{ bg: '#ECFDF5', color: '#15803D' },
  Prueba:            { bg: '#F1F5F9', color: '#64748B' },
  'Cuenta Matías':   { bg: '#F5F3FF', color: '#7C3AED' },
  Interno:           { bg: '#F1F5F9', color: '#64748B' },
};

// Colores por categoría de egreso.
const EGRESO_STYLE = {
  'Publicidad (Meta)':               { bg: '#EEF2FF', color: '#4F5BD5' },
  'Software':                        { bg: '#ECFEFF', color: '#0E7490' },
  'Pagos / transferencias externas': { bg: '#FEF3C7', color: '#B45309' },
  'Transferencias internas':         { bg: '#F1F5F9', color: '#64748B' },
  'Pago tarjeta de crédito':         { bg: '#F5F3FF', color: '#7C3AED' },
  'Comisiones y fees':               { bg: '#FFE4E6', color: '#BE123C' },
  'Otros gastos con tarjeta':        { bg: '#ECFDF5', color: '#15803D' },
  'Otros':                           { bg: '#F1F5F9', color: '#475569' },
};
const egStyle = (c) => EGRESO_STYLE[c] || EGRESO_STYLE['Otros'];

// Categorías disponibles para reclasificar manualmente un egreso.
const EGRESO_CATEGORIES = [
  'Publicidad (Meta)', 'Software', 'Pagos / transferencias externas',
  'Transferencias internas', 'Otros gastos con tarjeta', 'Comisiones y fees', 'Otros',
];

// "2026-06-09" → "lun 9 jun"
function fmtDay(dayKey) {
  if (!dayKey) return 'Sin fecha';
  try {
    return new Date(`${dayKey}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return dayKey; }
}

// Período → rango {from, to} en ISO para filtrar egresos. null = sin límite.
function rangeOf(period, from, to) {
  const now = new Date();
  if (period === 'mes') return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: null };
  if (period === '30d') return { from: new Date(now.getTime() - 30 * 86400000).toISOString(), to: null };
  if (period === 'custom') return {
    from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
    to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
  };
  return { from: null, to: null }; // todo
}

export default function MercuryPage() {
  const { currentUser } = useApp();
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState({});        // account_id -> [{ last_four, name_on_card }]
  const [failed, setFailed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [tab, setTab] = useState('fondos');
  const [hideZero, setHideZero] = useState(true);
  const [metaByAccount, setMetaByAccount] = useState({}); // account_id -> gasto Meta (anuncios)
  // Egresos (gastos categorizados)
  const [egresos, setEgresos] = useState([]);
  const [egPeriod, setEgPeriod] = useState('mes');     // mes | 30d | todo | custom
  const [egFrom, setEgFrom] = useState('');            // fecha desde (custom, YYYY-MM-DD)
  const [egTo, setEgTo] = useState('');                // fecha hasta (custom, YYYY-MM-DD)
  const [egCat, setEgCat] = useState(null);            // categoría seleccionada (filtro)
  const [egLoading, setEgLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [accRes, cardRes, txRes, metaRes] = await Promise.all([
      supabase.from('mercury_accounts').select('*'),
      supabase.from('mercury_cards').select('card_id, account_id, name_on_card, last_four'),
      // Pagos fallidos: sólo los de este mes (el resto del histórico no hace falta).
      supabase.from('mercury_transactions').select('*').eq('status', 'failed')
        .gte('tx_created_at', monthStart)
        .order('review_status', { ascending: true })
        .order('tx_created_at', { ascending: false }),
      supabase.rpc('korex_mercury_meta_spend'),   // gasto Meta exitoso por fondo
    ]);
    setAccounts(accRes.data || []);
    const cardMap = {};
    (cardRes.data || []).forEach((c) => { (cardMap[c.account_id] ||= []).push(c); });
    setCards(cardMap);
    setFailed(txRes.data || []);
    const meta = {};
    (metaRes.data || []).forEach((m) => { meta[m.account_id] = Number(m.meta_spend) || 0; });
    setMetaByAccount(meta);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const ch = supabase.channel('mercury_tx_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mercury_transactions' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // Carga de egresos (vista mercury_egresos) según el rango elegido.
  const loadEgresos = useCallback(async (range) => {
    setEgLoading(true);
    let q = supabase.from('mercury_egresos')
      .select('id, fund_label, category, counterparty_name, amount, currency, tx_created_at, kind')
      .order('tx_created_at', { ascending: false })
      .limit(2000);
    if (range.from) q = q.gte('tx_created_at', range.from);
    if (range.to) q = q.lte('tx_created_at', range.to);
    const { data } = await q;
    setEgresos(data || []);
    setEgLoading(false);
  }, []);

  // Cargar egresos al entrar a la pestaña o cambiar el período/rango.
  useEffect(() => {
    if (tab !== 'egresos') return;
    loadEgresos(rangeOf(egPeriod, egFrom, egTo));
  }, [tab, egPeriod, egFrom, egTo, loadEgresos]);

  // Resumen por categoría + totales del período.
  const egSummary = useMemo(() => {
    const map = new Map();
    let total = 0, real = 0;
    for (const e of egresos) {
      const amt = Number(e.amount) || 0;
      if (!map.has(e.category)) map.set(e.category, { category: e.category, total: 0, count: 0 });
      const c = map.get(e.category);
      c.total += amt; c.count += 1;
      total += amt;
      if (e.category !== 'Transferencias internas') real += amt; // gasto que sale de Korex
    }
    const cats = [...map.values()].sort((a, b) => b.total - a.total);
    return { cats, total, real };
  }, [egresos]);

  const egVisible = useMemo(
    () => (egCat ? egresos.filter((e) => e.category === egCat) : egresos),
    [egresos, egCat],
  );

  // Egresos visibles agrupados por DÍA (día más reciente primero; dentro de cada
  // día, del gasto más caro al más barato).
  const egByDay = useMemo(() => {
    const map = new Map();
    for (const e of egVisible) {
      const day = e.tx_created_at ? e.tx_created_at.slice(0, 10) : 'sin-fecha';
      if (!map.has(day)) map.set(day, { day, items: [], total: 0 });
      const g = map.get(day);
      g.items.push(e); g.total += Number(e.amount) || 0;
    }
    const arr = [...map.values()];
    arr.forEach((g) => g.items.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0)));
    arr.sort((a, b) => b.day.localeCompare(a.day));
    return arr;
  }, [egVisible]);

  // Mini-resumen de la categoría seleccionada: contrapartes ordenadas por gasto desc.
  const catBreakdown = useMemo(() => {
    if (!egCat) return [];
    const map = new Map();
    for (const e of egVisible) {
      const k = e.counterparty_name || '—';
      map.set(k, (map.get(k) || 0) + (Number(e.amount) || 0));
    }
    return [...map.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  }, [egVisible, egCat]);

  // Reclasificar manualmente un egreso (override). '__auto__' vuelve a la regla.
  const setOverride = async (e, cat) => {
    const value = cat === '__auto__' ? null : cat;
    await supabase.from('mercury_transactions').update({ category_override: value }).eq('id', e.id);
    loadEgresos(rangeOf(egPeriod, egFrom, egTo));
  };

  const fundName = (a) => (a?.nickname || a?.name || a?.id || '—');
  const accountById = (id) => accounts.find((a) => a.id === id);

  // La cuenta de crédito no es efectivo (es deuda): se excluye del saldo total y
  // de los fondos, pero sus cargos sí cuentan en Egresos.
  const cashAccounts = useMemo(() => accounts.filter((a) => a.kind !== 'credit'), [accounts]);
  const creditAcc = useMemo(() => accounts.find((a) => a.kind === 'credit'), [accounts]);

  const grandTotal = useMemo(
    () => cashAccounts.reduce((s, a) => s + (Number(a.current_balance) || 0), 0),
    [cashAccounts],
  );

  // Agrupar fondos: Korex/Internos primero, después cada cliente ordenado por saldo.
  // La clave se normaliza (minúsculas + espacios) para que un mismo cliente con
  // distinta tipografía en el apodo (ej. "Vozmediano" vs "VozMediano") no se parta.
  const groups = useMemo(() => {
    const map = new Map();
    for (const a of cashAccounts) {
      const c = classify(a.nickname || a.name);
      const key = c.group.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!map.has(key)) map.set(key, { name: c.group, internal: c.internal, funds: [], total: 0, meta: 0 });
      const g = map.get(key);
      g.funds.push({ ...a, _category: c.category, _meta: metaByAccount[a.id] || 0 });
      g.total += Number(a.current_balance) || 0;
      g.meta += metaByAccount[a.id] || 0;
    }
    const arr = [...map.values()];
    arr.forEach((g) => g.funds.sort((x, y) => (Number(y.current_balance) || 0) - (Number(x.current_balance) || 0)));
    arr.sort((a, b) => (a.internal === b.internal ? b.total - a.total : (a.internal ? -1 : 1)));
    return arr;
  }, [cashAccounts, metaByAccount]);

  const totalMeta = useMemo(
    () => Object.values(metaByAccount).reduce((s, v) => s + (Number(v) || 0), 0),
    [metaByAccount],
  );

  const pending = failed.filter((t) => t.review_status !== 'reviewed');
  const reviewed = failed.filter((t) => t.review_status === 'reviewed');

  const markReviewed = async (tx) => {
    setSavingId(tx.id);
    const { error } = await supabase.from('mercury_transactions')
      .update({ review_status: 'reviewed', reviewed_by: currentUser?.id || null, reviewed_at: new Date().toISOString() })
      .eq('id', tx.id);
    setSavingId(null);
    if (!error) setFailed((p) => p.map((t) => (t.id === tx.id ? { ...t, review_status: 'reviewed' } : t)));
  };

  // ── Render de un fondo ──
  const FundRow = ({ f }) => {
    const cs = CAT_STYLE[f._category] || CAT_STYLE.General;
    const fcards = cards[f.id] || [];
    const zero = !(Number(f.current_balance) > 0);
    return (
      <div className={`flex items-center gap-3 py-2.5 px-3 rounded-lg ${zero ? 'opacity-60' : ''} hover:bg-surface2`}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold text-text truncate">{fundName(f)}</span>
            <span className="text-[10px] font-bold px-1.5 py-px rounded-full" style={{ background: cs.bg, color: cs.color }}>
              {f._category}
            </span>
            {f.kind === 'savings' && (
              <span className="text-[10px] font-semibold px-1.5 py-px rounded-full bg-surface2 text-text3 inline-flex items-center gap-1">
                <PiggyBank size={11} /> Ahorro
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            {fcards.map((c) => (
              <span key={c.card_id} className="text-[10.5px] text-text3 inline-flex items-center gap-1">
                <CreditCard size={11} /> {c.name_on_card ? `${c.name_on_card} ` : ''}•• {c.last_four || '????'}
              </span>
            ))}
            {f._meta > 0 && (
              <span className="text-[10.5px] font-semibold inline-flex items-center gap-1" style={{ color: '#4F5BD5' }}>
                <Megaphone size={11} /> Invertido en Meta: {money(f._meta, f.currency)}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[14px] font-bold text-text">{money(f.current_balance, f.currency)}</div>
          {f.available_balance != null && Number(f.available_balance) !== Number(f.current_balance) && (
            <div className="text-[10.5px] text-text3">Disp. {money(f.available_balance, f.currency)}</div>
          )}
        </div>
      </div>
    );
  };

  // ── Render de una transacción fallida ──
  const TxCard = ({ tx }) => {
    const acc = accountById(tx.account_id);
    const card = (cards[tx.account_id] || []).find((c) => c.card_id === tx.card_id);
    const isReviewed = tx.review_status === 'reviewed';
    const concepto = tx.counterparty_name || tx.merchant?.name || 'Pago sin detalle';
    return (
      <div className={`border rounded-xl p-4 ${isReviewed ? 'border-border bg-surface2/40 opacity-70' : 'border-red/30 bg-red/5'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[15px] font-bold text-text truncate">{concepto}</span>
              <span className="text-[15px] font-bold text-red shrink-0">{money(tx.amount, tx.currency)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text2">
              <span className="inline-flex items-center gap-1.5">
                <Landmark size={13} className="text-text3" />
                <span className="font-medium">{acc ? fundName(acc) : (tx.account_id || '—')}</span>
                {acc?.current_balance != null && <span className="text-text3">· saldo {money(acc.current_balance, acc.currency)}</span>}
              </span>
              {card && (
                <span className="inline-flex items-center gap-1.5">
                  <CreditCard size={13} className="text-text3" />
                  <span>{card.name_on_card}</span>
                  <span className="font-mono text-text3">•• {card.last_four}</span>
                </span>
              )}
              {tx.tx_created_at && <span className="text-text3">{fmtDate(tx.tx_created_at)}</span>}
            </div>
            <div className="mt-2 text-[12.5px]">
              <span className="text-text3">Motivo: </span>
              <span className="font-medium text-text">{tx.reason_for_failure || 'sin detalle'}</span>
            </div>
          </div>
          {!isReviewed ? (
            <button onClick={() => markReviewed(tx)} disabled={savingId === tx.id}
              className="shrink-0 inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue text-white text-[12px] font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-60">
              <CheckCircle2 size={14} /> {savingId === tx.id ? 'Guardando…' : 'Marcar revisada'}
            </button>
          ) : (
            <span className="shrink-0 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-green-600">
              <CheckCircle2 size={14} /> Revisada
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[960px] mx-auto">
      {/* Cabecera: saldo total + inversión en Meta */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-blue-bg2 to-white p-5 mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-8 flex-wrap">
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5">
              <Wallet size={14} /> Saldo total en Mercury
            </div>
            <div className="text-[30px] font-extrabold text-text mt-1 leading-none">{money(grandTotal)}</div>
            <div className="text-[12px] text-text3 mt-1.5">{cashAccounts.length} fondos · {Object.values(cards).flat().length} tarjetas</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5">
              <Megaphone size={14} /> Invertido en Meta
            </div>
            <div className="text-[30px] font-extrabold mt-1 leading-none" style={{ color: '#4F5BD5' }}>{money(totalMeta)}</div>
            <div className="text-[12px] text-text3 mt-1.5">gasto en anuncios procesado</div>
          </div>
          {creditAcc && (
            <div>
              <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5">
                <CreditCard size={14} /> Tarjeta de crédito
              </div>
              <div className="text-[30px] font-extrabold mt-1 leading-none" style={{ color: '#BE123C' }}>
                {money(creditAcc.current_balance, creditAcc.currency)}
              </div>
              <div className="text-[12px] text-text3 mt-1.5">deuda actual</div>
            </div>
          )}
        </div>
        <button onClick={load} title="Actualizar"
          className="inline-flex items-center gap-1.5 text-[12px] text-text2 hover:text-text bg-white border border-border rounded-lg px-3 py-2 cursor-pointer">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Tabs: Fondos / Pagos fallidos */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {[
          { id: 'fondos', label: 'Fondos', count: accounts.length },
          { id: 'egresos', label: 'Egresos', count: 0 },
          { id: 'fallidos', label: 'Pagos fallidos', count: pending.length, alert: pending.length > 0 },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="relative px-4 py-2.5 text-[13px] font-semibold cursor-pointer bg-transparent border-0 -mb-px"
            style={{ color: tab === t.id ? 'var(--color-text)' : 'var(--color-text3)', borderBottom: tab === t.id ? '2px solid var(--color-blue)' : '2px solid transparent' }}>
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 text-[10.5px] font-bold px-1.5 py-px rounded-full"
                style={{ background: t.alert ? 'var(--color-red)' : 'var(--color-surface2)', color: t.alert ? '#fff' : 'var(--color-text3)' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && accounts.length === 0 ? (
        <div className="text-text3 text-center py-16 text-sm">Cargando…</div>
      ) : tab === 'fondos' ? (
        <div>
          <div className="flex justify-end mb-2">
            <label className="text-[12px] text-text3 inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />
              Ocultar fondos en $0
            </label>
          </div>
          <div className="flex flex-col gap-3">
            {groups.map((g) => {
              // Mostrar el fondo si tiene saldo > 0 o historial de inversión en Meta.
              const funds = hideZero ? g.funds.filter((f) => Number(f.current_balance) > 0 || (f._meta || 0) > 0) : g.funds;
              if (funds.length === 0) return null;
              const Icon = g.internal ? Landmark : Users;
              return (
                <div key={g.name} className="border border-border rounded-xl bg-white overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-surface2/60 border-b border-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon size={15} className="text-text3 shrink-0" />
                      <span className="text-[13px] font-bold text-text truncate">{g.name}</span>
                      <span className="text-[11px] text-text3">· {funds.length} fondo{funds.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {g.meta > 0 && (
                        <span className="text-[11px] font-semibold inline-flex items-center gap-1" style={{ color: '#4F5BD5' }} title="Invertido en Meta (anuncios)">
                          <Megaphone size={12} /> {money(g.meta)}
                        </span>
                      )}
                      <span className="text-[13px] font-bold text-text">{money(g.total)}</span>
                    </div>
                  </div>
                  <div className="p-1.5">
                    {funds.map((f) => <FundRow key={f.id} f={f} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : tab === 'egresos' ? (
        <div>
          {/* Selector de período */}
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="inline-flex rounded-lg border border-border overflow-hidden flex-wrap">
              {[{ id: 'mes', label: 'Este mes' }, { id: '30d', label: 'Últimos 30 días' }, { id: 'todo', label: 'Todo' }, { id: 'custom', label: 'Personalizado' }].map((p) => (
                <button key={p.id} onClick={() => { setEgPeriod(p.id); setEgCat(null); }}
                  className="text-[12px] font-semibold px-3 py-1.5 cursor-pointer border-0"
                  style={{ background: egPeriod === p.id ? 'var(--color-blue)' : '#fff', color: egPeriod === p.id ? '#fff' : 'var(--color-text2)' }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="text-right">
              <div className="text-[12px] text-text3">Gasto real (sin transferencias internas)</div>
              <div className="text-[20px] font-extrabold text-text leading-tight">{money(egSummary.real)}</div>
            </div>
          </div>

          {/* Rango de fechas personalizado */}
          {egPeriod === 'custom' && (
            <div className="flex items-center gap-2 mb-3 text-[12px] text-text2">
              <span>Desde</span>
              <input type="date" value={egFrom} onChange={(e) => { setEgFrom(e.target.value); setEgCat(null); }}
                className="border border-border rounded-lg px-2 py-1 text-[12px]" />
              <span>hasta</span>
              <input type="date" value={egTo} onChange={(e) => { setEgTo(e.target.value); setEgCat(null); }}
                className="border border-border rounded-lg px-2 py-1 text-[12px]" />
            </div>
          )}

          {egLoading ? (
            <div className="text-text3 text-center py-12 text-sm">Cargando egresos…</div>
          ) : egresos.length === 0 ? (
            <div className="text-[13px] text-text3 border border-dashed border-border rounded-xl p-6 text-center">
              No hay egresos en este período.
            </div>
          ) : (
            <>
              {/* Resumen por categoría (clickeable para filtrar) */}
              <div className="grid grid-cols-3 max-md:grid-cols-2 gap-2 mb-4">
                {egSummary.cats.map((c) => {
                  const st = egStyle(c.category);
                  const on = egCat === c.category;
                  return (
                    <button key={c.category} onClick={() => setEgCat(on ? null : c.category)}
                      className="text-left rounded-xl border p-3 cursor-pointer transition-all"
                      style={{ borderColor: on ? st.color : 'var(--color-border)', background: on ? st.bg : '#fff' }}>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: st.color }} />
                        <span className="text-[11.5px] font-semibold truncate" style={{ color: st.color }}>{c.category}</span>
                      </div>
                      <div className="text-[16px] font-bold text-text mt-1">{money(c.total)}</div>
                      <div className="text-[10.5px] text-text3">{c.count} mov.</div>
                    </button>
                  );
                })}
              </div>

              {/* Mini-resumen de la categoría seleccionada (del más caro al más barato) */}
              {egCat && catBreakdown.length > 0 && (
                <div className="rounded-xl border border-border bg-surface2/40 p-3 mb-3">
                  <div className="text-[11px] font-bold text-text3 uppercase tracking-wide mb-2">
                    Resumen de {egCat} · del más caro al más barato
                  </div>
                  <div className="flex flex-col gap-1">
                    {catBreakdown.slice(0, 12).map((b) => (
                      <div key={b.name} className="flex items-center justify-between gap-3 text-[12.5px]">
                        <span className="text-text2 truncate">{b.name}</span>
                        <span className="font-semibold text-text shrink-0">{money(b.total)}</span>
                      </div>
                    ))}
                    {catBreakdown.length > 12 && (
                      <div className="text-[11px] text-text3">y {catBreakdown.length - 12} más…</div>
                    )}
                  </div>
                </div>
              )}

              {/* Listado agrupado por DÍA */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-bold text-text3 uppercase tracking-wide">
                  {egCat ? `Egresos · ${egCat}` : 'Todos los egresos'} ({egVisible.length})
                </span>
                {egCat && (
                  <button onClick={() => setEgCat(null)} className="text-[12px] text-blue bg-transparent border-0 cursor-pointer">Ver todos</button>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {egByDay.map((d) => (
                  <div key={d.day} className="border border-border rounded-xl bg-white overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-surface2/60 border-b border-border">
                      <span className="text-[12px] font-bold text-text capitalize">{fmtDay(d.day)}</span>
                      <span className="text-[12px] font-bold text-text3">{money(d.total)} · {d.items.length} mov.</span>
                    </div>
                    <div>
                      {d.items.map((e) => {
                        const st = egStyle(e.category);
                        return (
                          <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-surface2">
                            <ArrowDownCircle size={15} className="text-text3 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-[13px] font-semibold text-text truncate">{e.counterparty_name || 'Movimiento'}</div>
                              <div className="text-[11px] text-text3 truncate">{e.fund_label || '—'}</div>
                            </div>
                            {/* Selector para reclasificar (override manual) */}
                            <select value={e.category} onChange={(ev) => setOverride(e, ev.target.value)} title="Reclasificar categoría"
                              className="text-[10.5px] font-semibold rounded-full border-0 px-1.5 py-0.5 cursor-pointer outline-none"
                              style={{ background: st.bg, color: st.color }}>
                              {EGRESO_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              <option value="__auto__">↺ Automático</option>
                            </select>
                            <span className="text-[13.5px] font-bold text-text shrink-0 w-[100px] text-right">{money(e.amount, e.currency)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div>
          {pending.length === 0 && reviewed.length === 0 ? (
            <div className="text-[13px] text-text3 border border-dashed border-border rounded-xl p-6 text-center">
              No hay transacciones fallidas. 🎉
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {pending.length > 0 && (
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={15} className="text-red" />
                  <span className="text-[12px] font-bold text-text3 uppercase tracking-wide">Pendientes de revisar ({pending.length})</span>
                </div>
              )}
              {pending.map((tx) => <TxCard key={tx.id} tx={tx} />)}
              {reviewed.length > 0 && (
                <div className="mt-4 mb-1 text-[11.5px] font-semibold text-text3 uppercase tracking-wide">Ya revisadas</div>
              )}
              {reviewed.map((tx) => <TxCard key={tx.id} tx={tx} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
