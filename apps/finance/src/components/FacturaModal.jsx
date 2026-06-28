import { useEffect, useState } from 'react';
import { sbFetch, supabase } from '@korex/db';
import { facConcepto, facFormaPago, facHtmlFactura, facImprimir, facPad4, facMiles, facFechaStr, refCodigo } from '../lib/factura.js';

// Genera la factura de un ingreso dentro del sistema.
// REGLA (2026-06-27): la factura se registra SOLO si se logra archivar en Drive.
// Si Drive falla, NO se consume número ni se guarda: se ofrece pegar el link manual
// (cuando la factura se sube a Drive a mano) y recién ahí se registra con ese link.
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
  const [manualMode, setManualMode] = useState(false); // Drive falló → pedir link manual
  const [manualLink, setManualLink] = useState('');
  const [wantEmail, setWantEmail] = useState(false);   // si el intento original era "Generar y enviar"
  const [siblings, setSiblings] = useState([]);        // otros ingresos sin facturar del MISMO pagador
  const [sel, setSel] = useState({});                  // {incomeId: true} incluidos en esta factura
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
        // 3) Selección inicial + otros ingresos sin facturar del mismo pagador (para factura masiva).
        if (alive) setSel({ [income.id]: true });
        if (income.payer_name && income.collected_by !== 'Cliente') {
          const encp = encodeURIComponent(income.payer_name.trim());
          const sib = await sbFetch(`fin_incomes?payer_name=eq.${encp}&facturado=eq.false&collected_by=neq.Cliente&id=neq.${income.id}&select=id,income_date,income_type,effective_type,amount_eur,amount_usd,payment_method,ref_seq&order=income_date.asc&limit=100`).catch(() => []);
          if (alive) setSiblings(Array.isArray(sib) ? sib : []);
        }
      } catch (e) {
        if (alive) setErr(String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [income]);

  if (!income) return null;
  // Helpers por ingreso (concepto según tipo, igual que el Apps Script).
  const tipoDe = (inc) => (inc.income_type || inc.effective_type || '').toUpperCase();
  const montoDe = (inc) => (moneda === 'EUR' ? (Number(inc.amount_eur) || 0) : (Number(inc.amount_usd) || 0));
  const tipo = tipoDe(income);
  const formaPago = facFormaPago(income.payment_method);
  const sym = moneda === 'EUR' ? '€' : 'US$';
  const numeroFmt = facPad4(num);
  // Ingresos incluidos en la factura: el actual + los del mismo pagador que se tilden (masiva).
  const allIncomes = [income, ...siblings];
  const selectedIncomes = allIncomes.filter((inc) => sel[inc.id]);
  const esMasiva = selectedIncomes.length > 1;
  const total = selectedIncomes.reduce((s, inc) => s + montoDe(inc), 0);
  const items = selectedIncomes.map((inc) => ({
    codigo: refCodigo(inc.income_type, inc.ref_seq),
    concepto: facConcepto(tipoDe(inc)),
    fecha: inc.income_date,
    monto: montoDe(inc),
  }));
  const faltan = bill ? [
    !bill.nombreFactura && 'Nombre / empresa',
    !bill.idFiscal && 'ID fiscal o DNI',
    !bill.direccion && 'Dirección',
  ].filter(Boolean) : [];

  const docData = () => ({
    nombreFactura: bill.nombreFactura, idFiscal: bill.idFiscal, direccion: bill.direccion,
    numeroFmt, fecha: new Date(), moneda, formaPago, items,
  });

  const imprimir = () => { if (!bill) return; facImprimir(facHtmlFactura(docData())); };

  // Registra la factura en la base, marca el ingreso como facturado y (opcional) manda el email.
  // pdfUrl = link de Drive (automático o manual). pdfB64 = PDF para adjuntar al email (si lo hay).
  const persistInvoice = async ({ pdfUrl, pdfB64, sendEmail }) => {
    const invId = uuid();
    const ids = selectedIncomes.map((inc) => inc.id);
    await sbFetch('invoices', {
      method: 'POST', headers: { Prefer: 'return=minimal' }, throwOnError: true,
      body: JSON.stringify({
        id: invId, number: numeroFmt, client_id: income.client_id || null,
        income_id: income.id, issue_date: todayISO(), amount: total, currency: moneda,
        concept: esMasiva ? `Factura masiva — ${ids.length} ingresos` : facConcepto(tipo),
        status: 'emitida', payment_method: income.payment_method || null,
        kind: 'ingreso', is_bulk: esMasiva, pdf_url: pdfUrl || null, // ← el link queda guardado de entrada
      }),
    });
    // Vincula TODOS los ingresos incluidos a la misma factura (N ingresos → 1 factura).
    await sbFetch(`fin_incomes?id=in.(${ids.join(',')})`, { method: 'PATCH', body: JSON.stringify({ facturado: true, invoice_id: invId }), throwOnError: true });
    ids.forEach((id) => onDone?.(id, numeroFmt));
    if (sendEmail && bill.email) {
      try {
        const { data, error } = await supabase.functions.invoke('enviar-factura', {
          body: { to: bill.email, numeroFmt, nombreFactura: bill.nombreFactura, pdf_base64: pdfB64 || null, html: facHtmlFactura(docData()) },
        });
        if (error) setSent({ error: error.message || String(error) });
        else if (data?.ok) setSent({ ok: true, sent_to: data.sent_to, test_mode: data.test_mode });
        else setSent({ error: data?.error || 'No se pudo enviar el email' });
      } catch (e) {
        setSent({ error: String(e) });
      }
    }
    setDone(true);
  };

  // Flujo principal: Drive PRIMERO. Solo si archiva, se registra la factura.
  const guardar = async (sendEmail) => {
    if (!bill || !total || !num) return;
    setBusy(true); setErr(''); setSent(null); setArchived(null); setManualMode(false);
    setWantEmail(sendEmail);
    try {
      const html = facHtmlFactura(docData());
      let arch;
      try {
        const { data, error } = await supabase.functions.invoke('archivar-factura', {
          body: { html, numero: num, nombreFactura: bill.nombreFactura, fecha: todayISO() },
        });
        if (error) arch = { ok: false, error: error.message || String(error) };
        else if (data?.ok) arch = { ok: true, url: data.url, carpeta: data.carpeta, pdf_base64: data.pdf_base64 || null };
        else arch = { ok: false, error: data?.error || 'No se pudo archivar en Drive' };
      } catch (e) {
        arch = { ok: false, error: String(e) };
      }

      if (!arch.ok) {
        // No registramos nada: el número NO se consume. Pasamos a modo manual (pegar link).
        setArchived({ error: arch.error });
        setManualMode(true);
        return;
      }
      setArchived({ url: arch.url, carpeta: arch.carpeta });
      await persistInvoice({ pdfUrl: arch.url, pdfB64: arch.pdf_base64, sendEmail });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  // Drive falló y la subiste a mano: registrar la factura con el link pegado.
  const guardarConLinkManual = async () => {
    const link = manualLink.trim();
    if (!link || !bill || !total || !num) return;
    setBusy(true); setErr('');
    try {
      setArchived({ url: link, carpeta: null, manual: true });
      await persistInvoice({ pdfUrl: link, pdfB64: null, sendEmail: wantEmail });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const lab = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 };
  const inp = { width: '100%', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' };
  const btnOutline = { border: '1px solid #1d4ed8', background: '#fff', color: '#1d4ed8', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 9, cursor: 'pointer' };
  const btnPrimary = { border: 0, background: '#0EA5A4', color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 9, cursor: 'pointer' };

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
            <div style={{ fontSize: 12.5, color: '#6B7585', marginTop: 5, lineHeight: 1.5 }}>{esMasiva ? <>Los <b>{selectedIncomes.length} ingresos</b> quedaron marcados como facturados y la factura se guardó en el sistema.</> : <>El ingreso quedó marcado como <b>facturado</b> y la factura se guardó en el sistema.</>}</div>
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
                🗂 {archived.manual ? 'Link de Drive guardado' : <>Archivada en Drive{archived.carpeta ? <> en <b>{archived.carpeta}</b></> : ''}</>}. <a href={archived.url} target="_blank" rel="noreferrer" style={{ color: '#0369a1', fontWeight: 700 }}>Ver PDF en Drive</a>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
              <button onClick={imprimir} style={btnOutline}>Descargar PDF</button>
              <button onClick={onClose} style={btnPrimary}>Listo</button>
            </div>
          </div>
        ) : manualMode ? (
          <div style={{ padding: '22px' }}>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px', fontSize: 12.5, color: '#b45309', lineHeight: 1.5 }}>
              <b>No se pudo archivar en Drive automáticamente.</b><br />
              {archived?.error}<br />
              La factura <b>todavía no se registró</b> (no se consumió el N° {numeroFmt}).
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color: '#334155', lineHeight: 1.5 }}>
              Descargá el PDF, subilo a Drive a mano y pegá acá el link para registrar la factura con ese enlace:
            </div>
            <input value={manualLink} onChange={(e) => setManualLink(e.target.value)} placeholder="https://drive.google.com/file/d/…" style={{ ...inp, marginTop: 8 }} />
            {err && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 10 }}>Error: {err}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={imprimir} style={{ ...btnOutline }}>Descargar PDF</button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => guardar(wantEmail)} disabled={busy} style={{ border: '1px solid #CBD5E1', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 9, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '…' : 'Reintentar Drive'}</button>
                <button onClick={guardarConLinkManual} disabled={busy || !manualLink.trim()} style={{ ...btnPrimary, opacity: (busy || !manualLink.trim()) ? 0.6 : 1 }}>{busy ? 'Guardando…' : 'Guardar con este link'}</button>
              </div>
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
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 15, fontWeight: 800, color: total ? '#1d4ed8' : '#cbd5e1' }}>{sym} {facMiles(total)}</div>
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
                <div style={{ fontSize: 11, color: '#9AA4B2', fontWeight: 600, marginBottom: 4 }}>
                  {siblings.length > 0
                    ? <>Ingresos a facturar <span style={{ color: '#6366f1' }}>· este pagador tiene {siblings.length} más sin facturar — tildá los que quieras incluir</span></>
                    : <>Concepto <span style={{ color: '#cbd5e1' }}>· según tipo {tipo || '—'}</span></>}
                </div>
                {allIncomes.map((inc) => {
                  const on = !!sel[inc.id];
                  const isCurrent = inc.id === income.id;
                  return (
                    <label key={inc.id} title={isCurrent ? 'Ingreso actual (siempre incluido)' : ''} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: isCurrent ? 'default' : 'pointer', fontSize: 12, opacity: (on || isCurrent) ? 1 : 0.6 }}>
                      <input type="checkbox" checked={on} disabled={isCurrent} onChange={(e) => setSel((m) => ({ ...m, [inc.id]: e.target.checked }))} />
                      <span style={{ fontWeight: 700, color: '#1d4ed8', minWidth: 52 }}>{refCodigo(inc.income_type, inc.ref_seq) || '—'}</span>
                      <span style={{ flex: 1, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{facConcepto(tipoDe(inc))}</span>
                      <span style={{ color: '#9AA4B2', whiteSpace: 'nowrap' }}>{facFechaStr(inc.income_date)}</span>
                      <span style={{ fontWeight: 700, minWidth: 72, textAlign: 'right' }}>{sym} {facMiles(montoDe(inc))}</span>
                    </label>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E2E5EB', marginTop: 6, paddingTop: 7, fontSize: 12, flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ color: '#9AA4B2' }}>Forma de pago: <b style={{ color: '#475569' }}>{formaPago}</b></span>
                  <span style={{ fontWeight: 800, color: '#1d4ed8' }}>Total: {sym} {facMiles(total)}{esMasiva ? ` · ${selectedIncomes.length} ingresos` : ''}</span>
                </div>
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
              <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#9AA4B2', lineHeight: 1.5 }}>
                La factura se registra <b>solo si se archiva en Drive</b>. Si Drive falla, vas a poder subirla a mano y pegar el link.
              </div>
              {err && <div style={{ gridColumn: '1 / -1', color: '#dc2626', fontSize: 12 }}>Error: {err}</div>}
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid #EEF1F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={imprimir} disabled={!total} style={{ border: '1px solid #1d4ed8', background: '#fff', color: '#1d4ed8', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 9, cursor: 'pointer', opacity: total ? 1 : 0.5 }}>Ver / Descargar PDF</button>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button onClick={onClose} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 9, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={() => guardar(false)} disabled={!total || !num || busy || !bill.nombreFactura} style={{ border: '1px solid #CBD5E1', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 9, cursor: 'pointer', opacity: (!total || !num || busy || !bill.nombreFactura) ? 0.6 : 1 }}>{busy ? '…' : 'Solo registrar'}</button>
                <button onClick={() => guardar(true)} disabled={!total || !num || busy || !bill.nombreFactura || !bill.email} title={!bill.email ? 'Cargá un e-mail para enviar' : 'Archiva en Drive, registra, marca facturado y envía por email'} style={{ border: 0, background: '#0EA5A4', color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 9, cursor: 'pointer', opacity: (!total || !num || busy || !bill.nombreFactura || !bill.email) ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z" /><path d="m22 6-10 7L2 6" /></svg>
                  {busy ? 'Procesando…' : 'Generar y enviar'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
