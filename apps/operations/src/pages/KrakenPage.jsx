import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@korex/db';
import { Bitcoin, ArrowDownLeft, RefreshCw, Wallet, TrendingUp, Receipt, ExternalLink, CheckCircle2, Clock } from 'lucide-react';

// Los saldos/movimientos de Korex en Kraken son stablecoins / USD → 1:1 USD.
const STABLE = /^(usdt|usdc|zusd|usd|usd\.hold|dai|usdg|pyusd|tusd)$/i;

function money(amount) {
  const n = Number(amount);
  if (amount === null || amount === undefined || Number.isNaN(n)) return '—';
  return `USD ${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDay(dayKey) {
  if (!dayKey) return 'Sin fecha';
  try { return new Date(`${dayKey}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return dayKey; }
}
function fmtTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
// Link al explorador de blockchain según la red.
function explorerUrl(method, txid) {
  if (!txid) return null;
  const m = (method || '').toLowerCase();
  if (m.includes('trc20') || m.includes('tron')) return `https://tronscan.org/#/transaction/${txid}`;
  if (m.includes('ethereum') || m.includes('erc20') || txid.startsWith('0x')) return `https://etherscan.io/tx/${txid}`;
  if (m.includes('solana') || m.includes('spl')) return `https://solscan.io/tx/${txid}`;
  if (m.includes('polygon')) return `https://polygonscan.com/tx/${txid}`;
  if (m.includes('bsc') || m.includes('bep20')) return `https://bscscan.com/tx/${txid}`;
  if (m.includes('arbitrum')) return `https://arbiscan.io/tx/${txid}`;
  return null;
}
const shortTx = (t) => (t && t.length > 16 ? `${t.slice(0, 8)}…${t.slice(-6)}` : t);

export default function KrakenPage() {
  const [balances, setBalances] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pagos');

  const load = useCallback(async () => {
    setLoading(true);
    const [balRes, trRes] = await Promise.all([
      supabase.from('kraken_balances').select('*').order('amount', { ascending: false }),
      supabase.from('kraken_transfers').select('*').order('time', { ascending: false }).limit(1000),
    ]);
    setBalances(balRes.data || []);
    setTransfers(trRes.data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Pagos recibidos = SOLO depósitos en USDT (no ZUSD de Mercury, no polvo).
  const pagos = useMemo(
    () => transfers.filter((t) => t.direction === 'in' && /usdt/i.test(t.asset || '')),
    [transfers],
  );
  // Comisiones de Kraken = fees (sobre todo de retiros).
  const comisiones = useMemo(
    () => transfers.filter((t) => Number(t.fee) > 0).sort((a, b) => (b.time || '').localeCompare(a.time || '')),
    [transfers],
  );

  const saldo = useMemo(
    () => balances.reduce((s, b) => s + (STABLE.test((b.asset || '').trim()) ? Number(b.amount) || 0 : 0), 0),
    [balances],
  );
  const totalRecibido = useMemo(() => pagos.reduce((s, t) => s + (Number(t.amount) || 0), 0), [pagos]);
  const totalComisiones = useMemo(() => comisiones.reduce((s, t) => s + (Number(t.fee) || 0), 0), [comisiones]);

  // Agrupar una lista por día.
  const byDay = (list, dateKey = 'time') => {
    const map = new Map();
    for (const t of list) {
      const day = t[dateKey] ? t[dateKey].slice(0, 10) : 'sin-fecha';
      if (!map.has(day)) map.set(day, { day, items: [] });
      map.get(day).items.push(t);
    }
    const arr = [...map.values()];
    arr.sort((a, b) => b.day.localeCompare(a.day));
    return arr;
  };

  const StatusPill = ({ status }) => {
    const ok = /success/i.test(status || '');
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: ok ? '#15803D' : '#A16207' }}>
        {ok ? <CheckCircle2 size={11} /> : <Clock size={11} />} {status || '—'}
      </span>
    );
  };

  return (
    <div className="max-w-[920px] mx-auto">
      {/* Cabecera */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-blue-bg2 to-white p-5 mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-8 flex-wrap">
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5"><Wallet size={14} /> Saldo en Kraken</div>
            <div className="text-[30px] font-extrabold text-text mt-1 leading-none">{money(saldo)}</div>
            <div className="text-[12px] text-text3 mt-1.5">{balances.filter((b) => Number(b.amount) > 0).length} activos</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5"><TrendingUp size={14} /> Pagos recibidos (USDT)</div>
            <div className="text-[30px] font-extrabold mt-1 leading-none" style={{ color: '#15803D' }}>{money(totalRecibido)}</div>
            <div className="text-[12px] text-text3 mt-1.5">{pagos.length} pagos · histórico</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold text-text3 uppercase tracking-wide flex items-center gap-1.5"><Receipt size={14} /> Comisiones Kraken</div>
            <div className="text-[30px] font-extrabold mt-1 leading-none" style={{ color: '#BE123C' }}>{money(totalComisiones)}</div>
            <div className="text-[12px] text-text3 mt-1.5">{comisiones.length} cobros de fee</div>
          </div>
        </div>
        <button onClick={load} title="Actualizar" className="inline-flex items-center gap-1.5 text-[12px] text-text2 hover:text-text bg-white border border-border rounded-lg px-3 py-2 cursor-pointer">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {[{ id: 'pagos', label: 'Pagos recibidos', count: pagos.length }, { id: 'comisiones', label: 'Comisiones', count: comisiones.length }].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="relative px-4 py-2.5 text-[13px] font-semibold cursor-pointer bg-transparent border-0 -mb-px"
            style={{ color: tab === t.id ? 'var(--color-text)' : 'var(--color-text3)', borderBottom: tab === t.id ? '2px solid var(--color-blue)' : '2px solid transparent' }}>
            {t.label}
            {t.count > 0 && <span className="ml-1.5 text-[10.5px] font-bold px-1.5 py-px rounded-full bg-surface2 text-text3">{t.count}</span>}
          </button>
        ))}
      </div>

      {loading && transfers.length === 0 ? (
        <div className="text-text3 text-center py-16 text-sm">Cargando…</div>
      ) : tab === 'pagos' ? (
        pagos.length === 0 ? (
          <div className="text-[13px] text-text3 border border-dashed border-border rounded-xl p-6 text-center">Todavía no hay pagos en USDT.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {byDay(pagos).map((d) => (
              <div key={d.day} className="border border-border rounded-xl bg-white overflow-hidden">
                <div className="px-4 py-2 bg-surface2/60 border-b border-border">
                  <span className="text-[12px] font-bold text-text capitalize">{fmtDay(d.day)}</span>
                </div>
                <div>
                  {d.items.map((t) => {
                    const link = explorerUrl(t.method, t.txid);
                    return (
                      <div key={t.refid} className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-surface2">
                        <ArrowDownLeft size={16} className="shrink-0 mt-0.5" style={{ color: '#15803D' }} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[15px] font-bold" style={{ color: '#15803D' }}>+{Number(t.amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t.asset}</span>
                            <span className="text-[11px] text-text3">≈ {money(t.amount)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text2">
                            {t.method && <span className="inline-flex items-center gap-1"><Bitcoin size={11} className="text-text3" /> {t.method}</span>}
                            <span className="text-text3">{fmtTime(t.time)}</span>
                            <StatusPill status={t.status} />
                          </div>
                          {t.txid && (
                            <div className="mt-1 text-[11px] text-text3">
                              <span className="font-medium">Tx:</span>{' '}
                              {link ? (
                                <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue inline-flex items-center gap-1 font-mono">
                                  {shortTx(t.txid)} <ExternalLink size={10} />
                                </a>
                              ) : (
                                <span className="font-mono">{shortTx(t.txid)}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        comisiones.length === 0 ? (
          <div className="text-[13px] text-text3 border border-dashed border-border rounded-xl p-6 text-center">No hay comisiones registradas.</div>
        ) : (
          <div className="border border-border rounded-xl bg-white overflow-hidden">
            {comisiones.map((t) => (
              <div key={t.refid} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0 hover:bg-surface2">
                <Receipt size={15} className="text-text3 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-text">Comisión de {t.direction === 'out' ? 'retiro' : 'movimiento'}{t.asset ? ` · ${t.asset}` : ''}</div>
                  <div className="text-[11px] text-text3">{t.method ? `${t.method} · ` : ''}{fmtDay((t.time || '').slice(0, 10))} {fmtTime(t.time)}</div>
                </div>
                <span className="text-[13.5px] font-bold shrink-0" style={{ color: '#BE123C' }}>−{Number(t.fee).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {t.asset}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
