import { useMemo, useState } from 'react';
import { sbFetch } from '@korex/db';
import { money2, ROLE_LABEL } from '../lib/format.js';

// Modal de reembolso (total o parcial) de un ingreso. Llama a rpc/fin_apply_refund:
// crea la ficha del reembolso + un egreso "Reembolsos" + (opcional) revierte las comisiones
// en proporción al monto devuelto. No toca el ingreso original.
const METHODS = ['Mercury (Transferencia) - Empresa', 'Stripe (Tarjeta) - Empresa', 'USDT', 'Tarjeta - Cliente', 'Otro'];
const todayStr = () => new Date().toISOString().slice(0, 10);
const num = (x) => { const n = parseFloat(String(x).replace(',', '.')); return isFinite(n) ? n : null; };
const COMM_ORDER = ['cliente', 'conector', 'afiliado', 'consultor', 'marketing'];

export default function RefundModal({ income, onClose, onDone }) {
  const net = Number(income.net_usd) || 0;
  const already = Number(income.refunded) || 0;
  const remaining = Math.max(0, Math.round((net - already) * 100) / 100);

  const [amount, setAmount] = useState(String(remaining));
  const [date, setDate] = useState(todayStr());
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState(METHODS[0]);
  const [reverse, setReverse] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const amt = num(amount);
  const ok = amt != null && amt > 0 && amt <= remaining + 0.005 && net > 0;
  const fraction = ok ? amt / net : 0;

  // Comisiones que se revertirían (proporcional), por rol.
  const reversal = useMemo(() => {
    const comm = income.comm || {};
    const rows = COMM_ORDER.map((k) => ({ k, v: Math.round((comm[k] || 0) * fraction * 100) / 100 })).filter((x) => Math.abs(x.v) > 0.005);
    const total = rows.reduce((a, b) => a + b.v, 0);
    return { rows, total: Math.round(total * 100) / 100 };
  }, [income, fraction]);

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setErr('');
    try {
      await sbFetch('rpc/fin_apply_refund', {
        method: 'POST', throwOnError: true,
        body: JSON.stringify({
          p_income_id: income.id, p_amount: amt, p_date: date || todayStr(),
          p_reason: reason.trim() || null, p_method: method || null, p_reverse_commissions: reverse,
        }),
      });
      onDone();
    } catch (e) { setErr(String(e?.message || e)); setBusy(false); }
  };

  const lab = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 };
  const inp = { width: '100%', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,23,.4)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 500, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(13,17,23,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EEF1F5' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#be123c' }}>↩ Reembolsar ingreso</div>
            <div style={{ fontSize: 12, color: '#9AA4B2', marginTop: 2 }}>{income.client_name_sheet || '—'} · neto US$ {Math.round(net).toLocaleString('es-AR')}{already > 0 ? ` · ya reembolsado US$ ${Math.round(already).toLocaleString('es-AR')}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ border: 0, background: '#F1F5F9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#64748B', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={lab}>Monto a reembolsar US$ <span style={{ color: '#e11d48' }}>*</span></label>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inp, border: '1px solid #FBC9CF', background: '#FFF5F6' }} />
            <div style={{ fontSize: 10.5, color: '#9AA4B2', marginTop: 3 }}>máximo US$ {remaining.toLocaleString('es-AR')} (neto restante){remaining < net ? ' · sería reembolso total' : ''}</div>
          </div>
          <div><label style={lab}>Fecha</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Motivo</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="¿Por qué se reembolsa?" style={inp} /></div>
          <div style={{ gridColumn: '1 / -1' }}><label style={lab}>¿Por dónde sale el dinero?</label><select value={method} onChange={(e) => setMethod(e.target.value)} style={inp}>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#334155', cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} style={{ accentColor: '#be123c', width: 15, height: 15 }} />
              Revertir comisiones de este ingreso
            </label>
            <div style={{ fontSize: 10.5, color: '#9AA4B2', marginTop: 3, marginLeft: 24 }}>Destildá si el conector/marketing conserva su comisión aunque se devuelva la plata.</div>
          </div>
        </div>

        {/* preview */}
        <div style={{ margin: '0 22px 4px', padding: '12px 14px', background: '#FBFCFE', border: '1px solid #EEF1F5', borderRadius: 10, fontSize: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: reverse && reversal.rows.length ? 8 : 0 }}>
            <span style={{ color: '#64748B' }}>Egreso "Reembolsos"</span>
            <b style={{ color: '#b91c1c' }}>− {money2(amt || 0)}</b>
          </div>
          {reverse && reversal.rows.length > 0 && (
            <>
              <div style={{ color: '#64748B', marginBottom: 5 }}>Comisiones que se revierten <span style={{ color: '#9AA4B2' }}>(vuelven como deuda si ya estaban pagadas)</span>:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {reversal.rows.map((r) => (
                  <span key={r.k} style={{ fontSize: 11, background: '#EEF0FF', color: '#4338ca', borderRadius: 6, padding: '2px 8px' }}>{ROLE_LABEL[r.k] || r.k}: − {money2(r.v)}</span>
                ))}
                <span style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>Total − {money2(reversal.total)}</span>
              </div>
            </>
          )}
          {reverse && reversal.rows.length === 0 && <div style={{ color: '#9AA4B2' }}>Este ingreso no tiene comisiones a revertir.</div>}
        </div>

        {err && <div style={{ margin: '6px 22px 0', fontSize: 11.5, color: '#e11d48' }}>{err}</div>}

        <div style={{ padding: '14px 22px', borderTop: '1px solid #EEF1F5', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          <button onClick={onClose} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 9, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={submit} disabled={!ok || busy} style={{ border: 0, background: '#be123c', color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9, cursor: 'pointer', opacity: (!ok || busy) ? 0.6 : 1 }}>{busy ? 'Procesando…' : 'Confirmar reembolso'}</button>
        </div>
      </div>
    </div>
  );
}
