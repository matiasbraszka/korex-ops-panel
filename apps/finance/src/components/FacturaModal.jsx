import { useEffect, useState } from 'react';
import { sbFetch, supabase } from '@korex/db';
import { facConcepto, facFormaPago, facHtmlFactura, facImprimir, facPad4, facMiles, facFechaStr } from '../lib/factura.js';

// Genera la factura de un ingreso dentro del sistema (reemplaza el popup del Sheet):
// trae los datos fiscales del Directorio, arma el N° continuo, muestra el preview,
// imprime el PDF (Guardar como PDF) y registra la factura en `invoices` + marca Facturado.
const todayISO = () => new Date().toISOString().slice(0, 10);
const uuid = () => (crypto?.randomUUID ? crypto.randomUUID() : 'inv-' + Date.now() + '-' + Math.round(Math.random() * 1e6));

export default function FacturaModal({ income, onClose, onDone }) {
  const [bill, setBill] = useState(null);          // datos fiscales del Directorio
  const [num, setNum] = useState('');              // número de factura (editable)
  const [moneda, setMoneda] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [sent, setSent] = useState(null);   // resultado del envío por email: {ok,sent_to,test_mode} | {error}
  const [archived, setArchived] = useState(null); // archivado en Drive: {url,carpeta} | {error}
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // 1) Datos fiscales: por el id de Directorio del pagador; si no, por nombre.
        let dir = null;
        if (income.payer_dir_id) {
          const r = await sbFetch(`fin_directory?id=eq.${income.payer_dir_id}&select=nombre,email,telefono,dir_facturacion,id_fiscal,facturar_a,empresa&limit=1`);
          dir = Array.isArray(r) ? r[0] : null;
        }
        if (!dir && income.payer_name) {
          const enc = encodeURIComponent(income.payer_name.trim());
          const r = await sbFetch(`fin_directory?nombre=ilike.${enc}&select=nombre,email,telefono,dir_facturacion,id_fiscal,facturar_a,empresa&limit=1`).catch(() => null);
          dir = Array.isArray(r) ? r[0] : null;
        }
        const esEmpresa = String(dir?.facturar_a || '').trim().toLowerCase() === 'empresa';
        if (alive) setBill({
          nombreFactura: (esEmpresa ? dir?.empresa : dir?.nombre) || income.payer_name || income.client_name_sheet || '',
          idFiscal: dir?.id_fiscal || '',
          direccion: dir?.dir_facturacion || '',
          email: dir?.email || '',
        });
        // 2) Próximo número: máximo numérico de invoices + 1 (continuo y global).
        const inv = await sbFetch('invoices?select=number&limit=10000').catch(() => []);
        const max = (Array.isArray(inv) ? inv : []).reduce((mx, r) => {
          const n = parseInt(String(r.number || '').replace(/[^\d]/g, ''), 10);
          return isFinite(n) && n > mx ? n : mx;
        }, 0);
        if (alive) setNum(String(max + 1));
      } catch (e) {
        if (alive) setErr(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [income]);

  if (!income) return null;
  // Concepto según el tipo del ingreso (col H del Sheet = income_type), igual que el Apps Script.
  const tipo = (income.income_type || income.effective_type || '').toUpperCase();
  const concepto = facConcepto(tipo);
  const formaPago = facFormaPago(income.payment_method);
  const monto = moneda === 'EUR' ? (Number(income.amount_eur) || 0) : (Number(income.amount_usd) || 0);
  const sym = moneda === 'EUR' ? '€' : 'US$';
  const numeroFmt = facPad4(num);
  const faltan = bill ? [
    !bill.nombreFactura && 'Nombre / empresa',
    !bill.idFiscal && 'ID fiscal o DNI',
    !bill.direccion && 'Dirección',
  ].filter(Boolean) : [];

  const docData = () => ({
    nombreFactura: bill.nombreFactura, idFiscal: bill.idFiscal, direccion: bill.direccion,
    numeroFmt, fecha: new Date(), concepto, monto, moneda, formaPago,
  });

  const imprimir = () => { if (!bill) return; facImprimir(facHtmlFactura(docData())); };

  const guardar = async (sendEmail) => {
    if (!bill || !monto || !num) return;
    setBusy(true); setErr(''); setSent(null); setArchived(null);
    try {
      // 1) Registrar la factura y marcar el ingreso como facturado.
      const invId = uuid();
      await sbFetch('invoices', {
        method: 'POST', headers: { Prefer: 'return=minimal' }, throwOnError: true,
        body: JSON.stringify({
          id: invId, number: numeroFmt, client_id: income.client_id || null,
          income_id: income.id, // ← link factura → ingreso (trazabilidad 1:1)
          issue_date: todayISO(), amount: monto, currency: moneda, concept: concepto,
          status: 'emitida', payment_method: income.payment_method || null, kind: 'ingreso',
        }),
      });
      // Link ingreso → factura (queda vinculado aunque falle el archivado en Drive).
      await sbFetch(`fin_incomes?id=eq.${income.id}`, { method: 'PATCH', body: JSON.stringify({ facturado: true, invoice_id: invId }), throwOnError: true });
      onDone?.(income.id, numeroFmt);
      const html = facHtmlFactura(docData());
      // 2) Archivar el PDF en Drive PRIMERO: devuelve el link y el PDF (base64) para adjuntarlo al email.
      let pdfB64 = null;
      try {
        const { data, error } = await supabase.functions.invoke('archivar-factura', {
          body: { html, numero: num, nombreFactura: bill.nombreFactura, fecha: todayISO() },
        });
        if (error) setArchived({ error: error.message || String(error) });
        else if (data?.ok) {
          setArchived({ url: data.url, carpeta: data.carpeta });
          pdfB64 = data.pdf_base64 || null;
          try { await sbFetch(`invoices?id=eq.${invId}`, { method: 'PATCH', body: JSON.stringify({ pdf_url: data.url }) }); } catch { /* noop */ }
        } else setArchived({ error: data?.error || 'No se pudo archivar en Drive' });
      } catch (e) {
        setArchived({ error: String(e) });
      }
      // 3) Enviar por email (opcional): mensaje formal simple + factura como PDF adjunto.
      // Si no se pudo generar el PDF (pdfB64 null), cae al HTML inline para que el email salga igual.
      if (sendEmail && bill.email) {
        try {
          const { data, error } = await supabase.functions.invoke('enviar-factura', {
            body: { to: bill.email, numeroFmt, nombreFactura: bill.nombreFactura, pdf_base64: pdfB64, html },
          });
          if (error) setSent({ error: error.message || String(error) });
          else if (data?.ok) setSent({ ok: true, sent_to: data.sent_to, test_mode: data.test_mode });
          else setSent({ error: data?.error || 'No se pudo enviar el email' });
        } catch (e) {
          setSent({ error: String(e) });
        }
      }
      setDone(true);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const lab = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 };
  const inp = { width: '100%', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,23,.4)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 600, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(13,17,23,.3)' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EEF1F5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: '#EAF1FE', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>
            </span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Generar factura</div>
              <div style={{ fontSize: 12, color: '#9AA4B2', marginTop: 1 }}>{income.payer_name || income.client_name_sheet} · {facFechaStr(income.income_date)}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 0, background: '#F1F5F9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#64748B', fontSize: 16 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9AA4B2', fontSize: 13 }}>Cargando datos fiscales…</div>
        ) : done ? (
          <div style={{ padding: '30px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Factura N° {numeroFmt} registrada</div>
            <div style={{ fontSize: 12.5, color: '#6B7585', marginTop: 5, lineHeight: 1.5 }}>El ingreso quedó marcado como <b>facturado</b> y la factura se guardó en el sistema.</div>
            {sent?.ok && (
              <div style={{ margin: '14px auto 0', maxWidth: 420, background: sent.test_mode ? '#FFFBEB' : '#F0FDF4', border: `1px solid ${sent.test_mode ? '#FDE68A' : '#BBF7D0'}`, borderRadius: 10, padding: '10px 12px', fontSize: 12, color: sent.test_mode ? '#b45309' : '#15803d', lineHeight: 1.5 }}>
                {sent.test_mode
                  ? <>✉ <b>Modo prueba:</b> el email se envió a <b>{sent.sent_to}</b> (no al cliente). Para enviar a clientes reales, verificá el dominio en Resend y poné <code>test_mode: false</code>.</>
                  : <>✉ Factura <b>enviada por email</b> a <b>{sent.sent_to}</b>.</>}
              </div>
            )}
            {sent?.error && (
              <div style={{ margin: '14px auto 0', maxWidth: 420, background: '#FFF1F2', border: '1px solid #FBC9CF', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#be123c', lineHeight: 1.5 }}>
                No se pudo enviar el email: {sent.error}.<br />La factura quedó registrada igual — descargá el PDF y envialo manualmente.
              </div>
            )}
            {archived?.url && (
              <div style={{ margin: '10px auto 0', maxWidth: 420, background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#0369a1', lineHeight: 1.5 }}>
                🗂 Archivada en Drive{archived.carpeta ? <> en <b>{archived.carpeta}</b></> : ''}. <a href={archived.url} target="_blank" rel="noreferrer" style={{ color: '#0369a1', fontWeight: 700 }}>Ver PDF en Drive</a>
              </div>
            )}
            {archived?.error && (
              <div style={{ margin: '10px auto 0', maxWidth: 420, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#b45309', lineHeight: 1.5 }}>
                No se pudo archivar en Drive: {archived.error}.<br />La factura quedó registrada igual — descargá el PDF y guardalo a mano.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
              <button onClick={imprimir} style={{ border: '1px solid #1d4ed8', background: '#fff', color: '#1d4ed8', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 9, cursor: 'pointer' }}>Descargar PDF</button>
              <button onClick={onClose} style={{ border: 0, background: '#0EA5A4', color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9, cursor: 'pointer' }}>Listo</button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={lab}>N° de factura</label>
                <input value={num} onChange={(e) => setNum(e.target.value.replace(/[^\d]/g, ''))} style={{ ...inp, fontWeight: 700 }} />
                <div style={{ fontSize: 10.5, color: '#9AA4B2', marginTop: 4 }}>Se mostrará como <b>{numeroFmt}</b>. En el primer uso, ponelo igual al que sigue del último de Drive.</div>
              </div>
              <div>
                <label style={lab}>Moneda · importe</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 8, padding: 3 }}>
                    {['USD', 'EUR'].map((m) => (
                      <button key={m} onClick={() => setMoneda(m)} disabled={m === 'EUR' && !Number(income.amount_eur)} style={{ border: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: moneda === m ? 700 : 500, padding: '6px 12px', borderRadius: 6, background: moneda === m ? '#fff' : 'transparent', color: moneda === m ? '#1d4ed8' : '#64748B', opacity: (m === 'EUR' && !Number(income.amount_eur)) ? 0.4 : 1, boxShadow: moneda === m ? '0 1px 2px rgba(0,0,0,.08)' : 'none' }}>{m}</button>
                    ))}
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 15, fontWeight: 800, color: monto ? '#1d4ed8' : '#cbd5e1' }}>{sym} {facMiles(monto)}</div>
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lab}>Facturado a</label>
                <input value={bill.nombreFactura} onChange={(e) => setBill((b) => ({ ...b, nombreFactura: e.target.value }))} placeholder="Nombre o empresa" style={inp} />
              </div>
              <div>
                <label style={lab}>ID fiscal o DNI</label>
                <input value={bill.idFiscal} onChange={(e) => setBill((b) => ({ ...b, idFiscal: e.target.value }))} placeholder="—" style={inp} />
              </div>
              <div>
                <label style={lab}>E-mail</label>
                <input value={bill.email} onChange={(e) => setBill((b) => ({ ...b, email: e.target.value }))} placeholder="—" style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lab}>Dirección de facturación</label>
                <input value={bill.direccion} onChange={(e) => setBill((b) => ({ ...b, direccion: e.target.value }))} placeholder="—" style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1', background: '#F8FAFC', border: '1px solid #EEF1F5', borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#9AA4B2', fontWeight: 600 }}>Concepto <span style={{ color: '#cbd5e1' }}>· según tipo {tipo || '—'}</span></div>
                <div style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.4 }}>{concepto}</div>
                <div style={{ fontSize: 11, color: '#9AA4B2', fontWeight: 600, marginTop: 8 }}>Forma de pago</div>
                <div style={{ fontSize: 12.5, marginTop: 2 }}>{formaPago}</div>
              </div>
              {faltan.length > 0 && (
                <div style={{ gridColumn: '1 / -1', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 9, padding: '9px 12px', fontSize: 12, color: '#b45309' }}>
                  Faltan datos fiscales: <b>{faltan.join(', ')}</b>. Completalos arriba antes de generar (quedan solo en esta factura; conviene cargarlos también en el Directorio).
                </div>
              )}
              {income.collected_by === 'Cliente' && (
                <div style={{ gridColumn: '1 / -1', background: '#FFF1F2', border: '1px solid #FBC9CF', borderRadius: 9, padding: '9px 12px', fontSize: 12, color: '#be123c' }}>
                  Ojo: este ingreso lo cobró el <b>cliente</b>, no Korex. En el Sheet estas ventas no las factura Korex.
                </div>
              )}
              {err && <div style={{ gridColumn: '1 / -1', color: '#dc2626', fontSize: 12 }}>Error: {err}</div>}
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid #EEF1F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={imprimir} disabled={!monto} style={{ border: '1px solid #1d4ed8', background: '#fff', color: '#1d4ed8', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 9, cursor: 'pointer', opacity: monto ? 1 : 0.5 }}>Ver / Descargar PDF</button>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 9, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={() => guardar(false)} disabled={!monto || !num || busy || !bill.nombreFactura} style={{ border: '1px solid #CBD5E1', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 9, cursor: 'pointer', opacity: (!monto || !num || busy || !bill.nombreFactura) ? 0.6 : 1 }}>{busy ? '…' : 'Solo registrar'}</button>
                <button onClick={() => guardar(true)} disabled={!monto || !num || busy || !bill.nombreFactura || !bill.email} title={!bill.email ? 'Cargá un e-mail para enviar' : 'Registra, marca facturado y envía por email'} style={{ border: 0, background: '#0EA5A4', color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 9, cursor: 'pointer', opacity: (!monto || !num || busy || !bill.nombreFactura || !bill.email) ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="m22 6-10 7L2 6" /></svg>
                  {busy ? 'Enviando…' : 'Generar y enviar'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
