import { useEffect, useState } from 'react';
import { sbFetch } from '@korex/db';
import { money2, fdate, ini, avatarColor, roleChip, typeBg, typeFg } from '../lib/format.js';

// Drawer 360° de una persona (diseño Claude Design): junta sus datos del Directorio
// con lo que pagó, lo que cobró en comisiones y a quién trajo.
const isSigned = (s) => /^(true|si|sí|x|1)$/i.test(String(s || '').trim());

export default function PersonDrawer({ personId, onClose, onOpenPerson }) {
  const [p, setP] = useState(null);
  const [pagos, setPagos] = useState(null);
  const [com, setCom] = useState(null);
  const [referidos, setReferidos] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!personId) return;
    setP(null); setPagos(null); setCom(null); setReferidos(null); setErr('');
    sbFetch(`fin_directory_unique?id=eq.${personId}&select=id,nombre,tipo,duracion,cli,ref,norm_name,email,telefono,empresa,dir_facturacion,id_fiscal,facturar_a,contrato_enviado,contrato_firmado,ingreso_date&limit=1`)
      .then((d) => setP(Array.isArray(d) && d[0] ? d[0] : {})).catch((e) => setErr(String(e)));
    sbFetch(`fin_incomes_enriched?payer_dir_id=eq.${personId}&select=id,income_date,client_name_sheet,income_type,effective_type,net_usd&order=income_date.desc.nullslast`)
      .then((d) => setPagos(Array.isArray(d) ? d : [])).catch(() => setPagos([]));
    sbFetch(`fin_payouts_enriched?person_dir_id=eq.${personId}&select=id,paid_on,amount,currency,fund,concept,client_name&order=paid_on.desc.nullslast`)
      .then((d) => setCom(Array.isArray(d) ? d : [])).catch(() => setCom([]));
  }, [personId]);

  useEffect(() => {
    if (!p?.norm_name) { if (p) setReferidos([]); return; }
    sbFetch(`fin_directory_unique?norm_ref=eq.${encodeURIComponent(p.norm_name)}&select=id,nombre,tipo,cli,ingreso_date&order=ingreso_date.desc.nullslast`)
      .then((d) => setReferidos(Array.isArray(d) ? d : [])).catch(() => setReferidos([]));
  }, [p?.norm_name]);

  const totalPagado = (pagos || []).reduce((a, r) => a + (Number(r.net_usd) || 0), 0);
  const totalCobrado = (com || []).reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const [bg, fg] = avatarColor(p?.nombre);
  const [rbg, rfg] = roleChip(p?.tipo);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,23,.35)', zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '92vw', height: '100%', background: '#fff', boxShadow: '-8px 0 30px rgba(13,17,23,.18)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 22px', borderBottom: '1px solid #EEF1F5', display: 'flex', alignItems: 'flex-start', gap: 13, background: `linear-gradient(180deg, ${bg}, #fff)` }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, flexShrink: 0 }}>{ini(p?.nombre)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.01em' }}>{p?.nombre || 'Cargando…'}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
              {p?.tipo && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: rbg, color: rfg }}>{p.tipo}</span>}
              <span style={{ fontSize: 11.5, color: '#9AA4B2' }}>{p?.cli || ''}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 0, background: '#F1F5F9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#64748B', fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>

        {err && <div style={{ margin: 16, color: '#dc2626', fontSize: 13 }}>Error: {err}</div>}

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9, marginBottom: 20 }}>
            <StatCard bg="#F0FDFA" bd="#CCF2F1" lc="#0c8584" label="Pagó (neto)" value={money2(totalPagado)} sub={`${pagos?.length ?? '—'} pagos`} />
            <StatCard bg="#F0FDF4" bd="#C5EAD0" lc="#15803d" label="Cobró comis." value={money2(totalCobrado)} sub={`${com?.length ?? '—'} pagos`} />
            <StatCard bg="#F0F9FF" bd="#BAE6FD" lc="#0369a1" label="Trajo" value={referidos == null ? '—' : String(referidos.length)} sub="personas" />
          </div>

          <SectionTitle>Datos</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 20 }}>
            {p?.email && <IconRow icon="mail"><a href={`mailto:${p.email}`} style={{ color: '#2563eb', fontWeight: 500, wordBreak: 'break-all', textDecoration: 'none' }}>{p.email}</a></IconRow>}
            {p?.telefono && <IconRow icon="phone"><span style={{ fontWeight: 500 }}>{p.telefono}</span></IconRow>}
            {p?.empresa && <Row k="Empresa" v={p.empresa} />}
            {p?.facturar_a && <Row k="Facturar a" v={p.facturar_a} />}
            {p?.id_fiscal && <Row k="ID fiscal" v={p.id_fiscal} />}
            {p?.dir_facturacion && <Row k="Dirección" v={p.dir_facturacion} />}
            {p?.duracion && <Row k="Duración" v={p.duracion} />}
            {p?.ref && <Row k="Referente" v={p.ref} />}
            <Row k="Ingreso" v={fdate(p?.ingreso_date)} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, paddingTop: 6, borderTop: '1px solid #F1F5F9' }}>
              <FileIcon color={isSigned(p?.contrato_firmado) ? '#16a34a' : isSigned(p?.contrato_enviado) ? '#d97706' : '#9AA4B2'} />
              <span style={{ fontWeight: 600, color: isSigned(p?.contrato_firmado) ? '#16a34a' : isSigned(p?.contrato_enviado) ? '#d97706' : '#9AA4B2' }}>
                {isSigned(p?.contrato_firmado) ? 'Contrato firmado' : isSigned(p?.contrato_enviado) ? 'Contrato enviado, sin firmar' : 'Sin contrato registrado'}
              </span>
            </div>
          </div>

          <SectionTitle>Pagos realizados{pagos ? ` (${pagos.length})` : ''}</SectionTitle>
          {pagos == null ? <Loading /> : pagos.length === 0 ? <Empty>No figura como pagador en Ingresos.</Empty> : (
            <MiniTable head={['Fecha', 'Cliente', 'Tipo', 'Neto US$']}>
              {pagos.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid #F4F6F9' }}>
                  <Cell>{fdate(r.income_date)}</Cell>
                  <Cell muted>{r.client_name_sheet || '—'}</Cell>
                  <Cell><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: typeBg(r.effective_type || r.income_type), color: typeFg(r.effective_type || r.income_type) }}>{r.effective_type || r.income_type || '—'}</span></Cell>
                  <Cell right bold>{money2(r.net_usd)}</Cell>
                </tr>
              ))}
            </MiniTable>
          )}

          {(com == null || com.length > 0) && (
            <div style={{ marginTop: 18 }}>
              <SectionTitle>Comisiones cobradas{com ? ` (${com.length})` : ''}</SectionTitle>
              {com == null ? <Loading /> : (
                <MiniTable head={['Fecha', 'Fondo', 'Concepto', 'Monto']}>
                  {com.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid #F4F6F9' }}>
                      <Cell>{fdate(r.paid_on)}</Cell>
                      <Cell muted>{r.fund || '—'}</Cell>
                      <Cell muted>{r.concept || r.client_name || '—'}</Cell>
                      <Cell right bold green>{money2(r.amount, r.currency || 'US$')}</Cell>
                    </tr>
                  ))}
                </MiniTable>
              )}
            </div>
          )}

          {(referidos == null || referidos.length > 0) && (
            <div style={{ marginTop: 18 }}>
              <SectionTitle>A quién trajo{referidos ? ` (${referidos.length})` : ''}</SectionTitle>
              {referidos == null ? <Loading /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {referidos.map((r) => (
                    <button key={r.id} onClick={() => onOpenPerson?.(r.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', fontSize: 12, padding: '6px 6px', borderRadius: 6, background: 'transparent', border: 0, cursor: 'pointer' }}>
                      <span style={{ color: '#9AA4B2', flexShrink: 0 }}>→</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1e293b' }}>{r.nombre}</span>
                      <span style={{ color: '#9AA4B2', fontSize: 10 }}>{r.tipo}</span>
                      <span style={{ color: '#9AA4B2', fontSize: 10 }}>{fdate(r.ingreso_date)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const StatCard = ({ bg, bd, lc, label, value, sub }) => (
  <div style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 11, padding: '11px 12px' }}>
    <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: lc }}>{label}</div>
    <div style={{ fontSize: 17, fontWeight: 800, marginTop: 3, color: lc }}>{value}</div>
    <div style={{ fontSize: 10, color: '#9AA4B2', marginTop: 1 }}>{sub}</div>
  </div>
);
const SectionTitle = ({ children }) => <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: '#8A93A2', marginBottom: 10 }}>{children}</div>;
const Row = ({ k, v }) => <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, fontSize: 12.5 }}><span style={{ color: '#9AA4B2', flexShrink: 0 }}>{k}</span><span style={{ fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{v || '—'}</span></div>;
const IconRow = ({ icon, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9AA4B2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {icon === 'mail' ? <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></> : <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />}
    </svg>{children}
  </div>
);
const FileIcon = ({ color }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /></svg>;
const MiniTable = ({ head, children }) => (
  <div style={{ border: '1px solid #F1F5F9', borderRadius: 11, overflow: 'hidden' }}>
    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
      <thead><tr style={{ color: '#9AA4B2' }}>{head.map((h, i) => <th key={i} style={{ textAlign: i === head.length - 1 ? 'right' : 'left', padding: '8px 12px', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', background: '#FAFBFC' }}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);
const Cell = ({ children, muted, right, bold, green }) => <td style={{ padding: '9px 12px', textAlign: right ? 'right' : 'left', fontWeight: bold ? 700 : muted ? 500 : 400, color: green ? '#15803d' : muted ? '#475569' : undefined }}>{children}</td>;
const Loading = () => <div style={{ color: '#9AA4B2', fontSize: 12, padding: '8px 0' }}>Cargando…</div>;
const Empty = ({ children }) => <div style={{ color: '#9AA4B2', fontSize: 12, padding: '4px 0', fontStyle: 'italic' }}>{children}</div>;
