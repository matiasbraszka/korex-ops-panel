import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@korex/db';
import { Bitcoin, ArrowDownLeft, ArrowUpRight, RefreshCw, Wallet, TrendingUp, TrendingDown } from 'lucide-react';

// Los saldos de Korex en Kraken son stablecoins / USD → conversión 1:1.
const STABLE = /^(usdt|usdc|zusd|usd|usd\.hold|usd\.f|dai|usdg|pyusd|tusd|busd)$/i;
const isUsd = (asset) => STABLE.test((asset || '').trim());

function money(amount, sign = false) {
  const n = Number(amount);
  if (amount === null || amount === undefined || Number.isNaN(n)) return '—';
  const s = `USD ${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return sign ? `${n < 0 ? '−' : '+'}${s}` : s;
}
function assetLabel(asset) {
  const a = (asset || '').trim();
  if (/^zusd$/i.test(a)) return 'USD';
  if (/^usd\.hold$/i.test(a)) return 'USD (retenido)';
  return a;
}
function fmtDay(dayKey) {
  if (!dayKey) return 'Sin fecha';
  try { return new Date(`${dayKey}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }); }
  catch { return dayKey; }
}
function fmtTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

// type de Kraken → etiqueta + grupo de filtro + dirección.
const TYPE_META = {
  deposit:    { label: 'Depósito',                grupo: 'depositos',    dir: 'in' },
  withdrawal: { label: 'Retiro',                  grupo: 'retiros',      dir: 'out' },
  receive:    { label: 'Conversión (recibido)',   grupo: 'conversiones', dir: 'in',  muted: true },
  spend:      { label: 'Conversión (gastado)',    grupo: 'conversiones', dir: 'out', muted: true },
  trade:      { label: 'Operación',               grupo: 'conversiones', dir: 'neutral', muted: true },
  transfer:   { label: 'Transferencia',           grupo: 'otros',        dir: 'neutral' },
  staking:    { label: 'Staking (rewards)',       grupo: 'staking',      dir: 'in',  muted: true },
};
const typeMeta = (t) => TYPE_META[t] || { label: t || 'Movimiento', grupo: 'otros', dir: 'neutral' };

const FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'depositos', label: 'Depósitos' },
  { id: 'retiros', label: 'Retiros' },
  { id: 'conversiones', label: 'Conversiones' },
  { id: 'staking', label: 'Staking' },
];

export default function KrakenPage() {
  const [balances, setBalances] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('todos');

  const load = useCallback(async () => {
    setLoading(true);
    const [balRes, ledRes] = await Promise.all([
      supabase.from('kraken_balances').select('*').order('amount', { ascending: false }),
      supabase.from('kraken_ledger').select('id, time, type, asset, amount, fee').order('time', { ascending: false }).limit(2000),
    ]);
    setBalances(balRes.data || []);
    setLedger(ledRes.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Valor USD de un movimiento (stablecoin = 1:1; otros sin precio → null).
  const usdOf = (e) => (isUsd(e.asset) ? Number(e.amount) || 0 : null);

  const totals = useMemo(() => {
    const saldo = balances.reduce((s, b) => s + (isUsd(b.asset) ? Number(b.amount) || 0 : 0), 0);
    let ingresos = 0, egresos = 0;
    for (const e of ledger) {
      if (e.type === 'deposit') ingresos += Number(e.amount) || 0;
      if (e.type === 'withdrawal') egresos += Math.abs(Number(e.amount) || 0);
    }
    return { saldo, ingresos, egresos };
  }, [balances, ledger]);

  const visible = useMemo(() => {
    if (filter === 'todos') return ledger;
    return ledger.filter((e) => typeMeta(e.type).grupo === filter);
  }, [ledger, filter]);

  // Agrupado por día (más reciente primero).
  const byDay = useMemo(() => {
    const map = new Map();
    for (const e of visible) {
      const day = e.time ? e.time.slice(0, 10) : 'sin-fecha';
      if (!map.has(day)) map.set(day, { day, items: [] });
      map.get(day).items.push(e);
    }
    const arr = [...map.values()];
    arr.forEach((g) => g.items.sort((a, b) => (b.time || '').localeCompare(a.time || '')));
    arr.sort((a, b) => b.day.localeCompare(a.day));
    return arr;
  }, [visible]);

  return (
    <div className="max-w-[920px] mx-auto">
      {/* Cabecera */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-blue-bg2 to-white p-5 mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-8 flex-wrap">
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5">
              <Wallet size={14} /> Saldo en Kraken
            </div>
            <div className="text-[30px] font-extrabold text-text mt-1 leading-none">{money(totals.saldo)}</div>
            <div className="text-[12px] text-text3 mt-1.5">{balances.filter((b) => Number(b.amount) > 0).length} activos</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5">
              <TrendingUp size={14} /> Ingresos (depósitos)
            </div>
            <div className="text-[30px] font-extrabold mt-1 leading-none" style={{ color: '#15803D' }}>{money(totals.ingresos)}</div>
            <div className="text-[12px] text-text3 mt-1.5">total histórico</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5">
              <TrendingDown size={14} /> Egresos (retiros)
            </div>
            <div className="text-[30px] font-extrabold mt-1 leading-none" style={{ color: '#BE123C' }}>{money(totals.egresos)}</div>
            <div className="text-[12px] text-text3 mt-1.5">total histórico</div>
          </div>
        </div>
        <button onClick={load} title="Actualizar"
          className="inline-flex items-center gap-1.5 text-[12px] text-text2 hover:text-text bg-white border border-border rounded-lg px-3 py-2 cursor-pointer">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Saldos por activo */}
      {balances.filter((b) => Number(b.amount) > 0).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-5">
          {balances.filter((b) => Number(b.amount) > 0).map((b) => (
            <span key={b.asset} className="inline-flex items-center gap-1.5 border border-border rounded-lg px-3 py-1.5 bg-white">
              <Bitcoin size={13} className="text-text3" />
              <span className="text-[12.5px] font-semibold text-text">{assetLabel(b.asset)}</span>
              <span className="text-[12.5px] text-text2">{Number(b.amount).toLocaleString('es-AR', { maximumFractionDigits: 4 })}</span>
              {isUsd(b.asset) && <span className="text-[11px] text-text3">≈ {money(b.amount)}</span>}
            </span>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border cursor-pointer"
            style={{
              background: filter === f.id ? 'var(--color-blue)' : '#fff',
              color: filter === f.id ? '#fff' : 'var(--color-text2)',
              borderColor: filter === f.id ? 'var(--color-blue)' : 'var(--color-border)',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Movimientos agrupados por día */}
      {loading && ledger.length === 0 ? (
        <div className="text-text3 text-center py-16 text-sm">Cargando…</div>
      ) : visible.length === 0 ? (
        <div className="text-[13px] text-text3 border border-dashed border-border rounded-xl p-6 text-center">No hay movimientos.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {byDay.map((d) => (
            <div key={d.day} className="border border-border rounded-xl bg-white overflow-hidden">
              <div className="px-4 py-2 bg-surface2/60 border-b border-border">
                <span className="text-[12px] font-bold text-text capitalize">{fmtDay(d.day)}</span>
              </div>
              <div>
                {d.items.map((e) => {
                  const m = typeMeta(e.type);
                  const usd = usdOf(e);
                  const Icon = m.dir === 'in' ? ArrowDownLeft : m.dir === 'out' ? ArrowUpRight : Bitcoin;
                  const color = m.muted ? '#64748B' : m.dir === 'in' ? '#15803D' : m.dir === 'out' ? '#BE123C' : '#475569';
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-surface2">
                      <Icon size={15} className="shrink-0" style={{ color }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-text">{m.label}</div>
                        <div className="text-[11px] text-text3">{assetLabel(e.asset)} · {fmtTime(e.time)}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[13.5px] font-bold" style={{ color }}>
                          {usd !== null
                            ? money(usd, true)
                            : `${Number(e.amount) < 0 ? '−' : '+'}${Math.abs(Number(e.amount)).toLocaleString('es-AR', { maximumFractionDigits: 6 })} ${assetLabel(e.asset)}`}
                        </div>
                        {Number(e.fee) > 0 && <div className="text-[10.5px] text-text3">fee {money(e.fee)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
