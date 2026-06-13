import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@korex/db';
import { useApp } from '../context/AppContext';
import { Landmark, CreditCard, AlertTriangle, CheckCircle2, RefreshCw, Users, Wallet, PiggyBank, Megaphone } from 'lucide-react';

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

  const load = useCallback(async () => {
    setLoading(true);
    const [accRes, cardRes, txRes, metaRes] = await Promise.all([
      supabase.from('mercury_accounts').select('*'),
      supabase.from('mercury_cards').select('card_id, account_id, name_on_card, last_four'),
      supabase.from('mercury_transactions').select('*').eq('status', 'failed')
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

  const fundName = (a) => (a?.nickname || a?.name || a?.id || '—');
  const accountById = (id) => accounts.find((a) => a.id === id);

  const grandTotal = useMemo(
    () => accounts.reduce((s, a) => s + (Number(a.current_balance) || 0), 0),
    [accounts],
  );

  // Agrupar fondos: Korex/Internos primero, después cada cliente ordenado por saldo.
  // La clave se normaliza (minúsculas + espacios) para que un mismo cliente con
  // distinta tipografía en el apodo (ej. "Vozmediano" vs "VozMediano") no se parta.
  const groups = useMemo(() => {
    const map = new Map();
    for (const a of accounts) {
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
  }, [accounts, metaByAccount]);

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
            <div className="text-[12px] text-text3 mt-1.5">{accounts.length} fondos · {Object.values(cards).flat().length} tarjetas</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5">
              <Megaphone size={14} /> Invertido en Meta
            </div>
            <div className="text-[30px] font-extrabold mt-1 leading-none" style={{ color: '#4F5BD5' }}>{money(totalMeta)}</div>
            <div className="text-[12px] text-text3 mt-1.5">gasto en anuncios procesado</div>
          </div>
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
