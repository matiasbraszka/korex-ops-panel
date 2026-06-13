import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@korex/db';
import { useApp } from '../context/AppContext';
import { Landmark, CreditCard, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';

// Formatea un monto en su moneda (valor absoluto: las fallidas suelen venir en negativo).
function money(amount, currency = 'USD') {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—';
  return `${currency} ${Math.abs(Number(amount)).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function MercuryPage() {
  const { currentUser } = useApp();
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState({});        // card_id -> { name_on_card, last_four }
  const [failed, setFailed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [accRes, cardRes, txRes] = await Promise.all([
      supabase.from('mercury_accounts').select('*').order('name', { ascending: true }),
      supabase.from('mercury_cards').select('card_id, name_on_card, last_four'),
      supabase.from('mercury_transactions').select('*').eq('status', 'failed')
        .order('review_status', { ascending: true })   // pending antes que reviewed
        .order('tx_created_at', { ascending: false }),
    ]);
    setAccounts(accRes.data || []);
    const cardMap = {};
    (cardRes.data || []).forEach((c) => { cardMap[c.card_id] = c; });
    setCards(cardMap);
    setFailed(txRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Realtime: si entra una nueva transacción fallida (o cambia), refrescamos.
  useEffect(() => {
    const ch = supabase
      .channel('mercury_tx_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mercury_transactions' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const markReviewed = async (tx) => {
    setSavingId(tx.id);
    const { error } = await supabase
      .from('mercury_transactions')
      .update({ review_status: 'reviewed', reviewed_by: currentUser?.id || null, reviewed_at: new Date().toISOString() })
      .eq('id', tx.id);
    setSavingId(null);
    if (!error) {
      setFailed((prev) => prev.map((t) => (t.id === tx.id ? { ...t, review_status: 'reviewed' } : t)));
    }
  };

  const pending = failed.filter((t) => t.review_status !== 'reviewed');
  const reviewed = failed.filter((t) => t.review_status === 'reviewed');

  const accountById = (id) => accounts.find((a) => a.id === id);

  const TxCard = ({ tx }) => {
    const acc = accountById(tx.account_id);
    const card = tx.card_id ? cards[tx.card_id] : null;
    const isReviewed = tx.review_status === 'reviewed';
    const concepto = tx.counterparty_name || tx.merchant?.name || 'Pago sin detalle';
    return (
      <div className={`border rounded-xl p-4 ${isReviewed ? 'border-border bg-surface2/40 opacity-70' : 'border-red/30 bg-red/5'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-bold text-text truncate">{concepto}</span>
              <span className="text-[15px] font-bold text-red shrink-0">{money(tx.amount, tx.currency)}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text2">
              <span className="inline-flex items-center gap-1.5">
                <Landmark size={13} className="text-text3" />
                <span className="font-medium">{acc?.name || tx.account_id || '—'}</span>
                {acc?.current_balance != null && (
                  <span className="text-text3">· saldo {money(acc.current_balance, acc.currency)}</span>
                )}
              </span>
              {card && (
                <span className="inline-flex items-center gap-1.5">
                  <CreditCard size={13} className="text-text3" />
                  <span>{card.name_on_card}</span>
                  {card.last_four && <span className="font-mono text-text3">•• {card.last_four}</span>}
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
            <button
              onClick={() => markReviewed(tx)}
              disabled={savingId === tx.id}
              className="shrink-0 inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-blue text-white text-[12px] font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-60"
            >
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
    <div className="max-w-[920px] mx-auto">
      {/* Cabecera: fondos con saldo actual */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-bold tracking-wide text-text3 uppercase">Fondos</h2>
          <button onClick={load} title="Actualizar"
                  className="inline-flex items-center gap-1.5 text-[12px] text-text2 hover:text-text bg-transparent border-0 cursor-pointer">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
        {accounts.length === 0 ? (
          <div className="text-[13px] text-text3 border border-dashed border-border rounded-xl p-4">
            Todavía no hay fondos sincronizados. Cuando se conecte Mercury, acá vas a ver cada cuenta y su saldo.
          </div>
        ) : (
          <div className="grid grid-cols-2 max-md:grid-cols-1 gap-3">
            {accounts.map((a) => (
              <div key={a.id} className="border border-border rounded-xl p-4 bg-white">
                <div className="flex items-center gap-2 text-text2">
                  <Landmark size={15} className="text-text3" />
                  <span className="text-[13px] font-semibold truncate">{a.name || a.id}</span>
                </div>
                <div className="mt-1.5 text-[20px] font-bold text-text">{money(a.current_balance, a.currency)}</div>
                {a.available_balance != null && a.available_balance !== a.current_balance && (
                  <div className="text-[11.5px] text-text3 mt-0.5">Disponible {money(a.available_balance, a.currency)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bandeja: transacciones fallidas a revisar */}
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-red" />
        <h2 className="text-[13px] font-bold tracking-wide text-text3 uppercase">Transacciones fallidas a revisar</h2>
        {pending.length > 0 && (
          <span className="text-[11px] font-bold py-0.5 px-2 rounded-full bg-red text-white">{pending.length}</span>
        )}
      </div>

      {loading ? (
        <div className="text-text3 text-center py-12 text-sm">Cargando…</div>
      ) : pending.length === 0 && reviewed.length === 0 ? (
        <div className="text-[13px] text-text3 border border-dashed border-border rounded-xl p-6 text-center">
          No hay transacciones fallidas. 🎉
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {pending.map((tx) => <TxCard key={tx.id} tx={tx} />)}
          {reviewed.length > 0 && (
            <div className="mt-4 mb-1 text-[11.5px] font-semibold text-text3 uppercase tracking-wide">Ya revisadas</div>
          )}
          {reviewed.map((tx) => <TxCard key={tx.id} tx={tx} />)}
        </div>
      )}
    </div>
  );
}
