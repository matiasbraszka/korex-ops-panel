import { useEffect, useState, useMemo } from 'react';
import { sbFetch } from '@korex/db';
import PersonDrawer from '../components/PersonDrawer.jsx';
import { Search, Msg } from '../components/bits.jsx';
import { money, fdate, ini, avatarColor, roleChip } from '../lib/format.js';

// Directorio (diseño Claude Design): roster de personas con avatar, qué pagó/cobró/trajo,
// contrato e ingreso. Click en la fila abre el perfil 360°.
const ROLE_FILTERS = [['', 'Todos'], ['Cliente', 'Clientes'], ['Usuario', 'Afiliados'], ['Conector', 'Conectores'], ['Consultor', 'Consultores'], ['Marketing', 'Marketing']];
const isSigned = (s) => /^(true|si|sí|x|1)$/i.test(String(s || '').trim());

export default function DirectorioPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [tipo, setTipo] = useState('');
  const [hover, setHover] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    sbFetch('fin_person_activity?select=id,nombre,tipo,cli,ref,email,telefono,contrato_firmado,ingreso_date,pagos_count,pagos_net_usd,com_count,com_amount,referidos_count&order=ingreso_date.desc.nullslast&limit=2000')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(String(e)));
  }, []);

  const counts = useMemo(() => {
    const c = {}; (rows || []).forEach((r) => { if (r.tipo) c[r.tipo] = (c[r.tipo] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const qq = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!qq || [r.nombre, r.email, r.cli, r.ref].some((x) => (x || '').toLowerCase().includes(qq))) &&
      (!tipo || r.tipo === tipo));
  }, [rows, q, tipo]);

  if (error) return <Msg>Error cargando directorio: {error}</Msg>;
  if (!rows) return <Msg>Cargando directorio…</Msg>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '16px 22px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 11, flexShrink: 0 }}>
        {counts.map(([k, n]) => { const [bg, fg] = roleChip(k); return (
          <span key={k} style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: bg, color: fg }}>{k} · <b>{n}</b></span>
        ); })}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9AA4B2' }}>{rows.length} personas</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 11, flexShrink: 0 }}>
        <Search value={q} onChange={setQ} placeholder="Buscar nombre, email, cliente o referente…" width={300} />
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {ROLE_FILTERS.map(([v, label]) => { const sel = tipo === v; const [cbg, cfg] = v ? roleChip(v) : ['#0EA5A4', '#fff']; return (
            <button key={v || 'all'} onClick={() => setTipo(v)} style={{ border: `1px solid ${sel ? 'transparent' : '#E2E5EB'}`, background: sel ? (v ? cbg : '#0EA5A4') : '#fff', color: sel ? (v ? cfg : '#fff') : '#475569', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 20, cursor: 'pointer' }}>{label}</button>
          ); })}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#9AA4B2' }}>mostrando {filtered.length} de {rows.length}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, boxShadow: '0 1px 3px rgba(13,17,23,.04)' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12.5, whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#64748B' }}>
              {['Persona', 'Rol', 'Cliente', 'Referente', 'Pagó', 'Cobró', 'Trajo', 'Contrato', 'Ingreso'].map((h, i) => (
                <th key={h} style={{ position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E5EB', padding: '10px 14px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: (i >= 4 && i <= 6) || i === 7 ? (i === 4 || i === 5 ? 'left' : 'center') : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const [avBg, avFg] = avatarColor(r.nombre); const [rbg, rfg] = roleChip(r.tipo);
              const firmado = isSigned(r.contrato_firmado); const hov = hover === r.id;
              return (
                <tr key={r.id} onClick={() => setOpenId(r.id)} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer', background: hov ? '#F6FBFB' : '#fff' }}>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: avBg, color: avFg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>{ini(r.nombre)}</div>
                      <div><div style={{ fontWeight: 600 }}>{r.nombre || '—'}</div><div style={{ fontSize: 10.5, color: '#9AA4B2' }}>{r.email || '—'}</div></div>
                    </div>
                  </Td>
                  <Td><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: rbg, color: rfg }}>{r.tipo || '—'}</span></Td>
                  <Td muted>{r.cli || '—'}</Td>
                  <Td muted>{r.ref || '—'}</Td>
                  <Td muted>{r.pagos_count ? money(r.pagos_net_usd) : '—'}</Td>
                  <Td style={{ fontWeight: 600, color: r.com_count ? '#15803d' : '#cbd5e1' }}>{r.com_count ? money(r.com_amount) : '—'}</Td>
                  <Td center style={{ color: r.referidos_count ? '#0369a1' : '#cbd5e1', fontWeight: 600 }}>{r.referidos_count || '—'}</Td>
                  <Td center style={{ color: firmado ? '#16a34a' : '#cbd5e1', fontWeight: 700 }}>{firmado ? '✓' : '✕'}</Td>
                  <Td style={{ color: '#9AA4B2' }}>{fdate(r.ingreso_date)}</Td>
                </tr>
              );
            })}
            {!filtered.length && <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: '#9AA4B2' }}>Sin resultados.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ height: 14, flexShrink: 0 }} />

      {openId && <PersonDrawer personId={openId} onClose={() => setOpenId(null)} onOpenPerson={setOpenId} />}
    </div>
  );
}

const Td = ({ children, center, muted, style }) => (
  <td style={{ padding: '9px 14px', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9', textAlign: center ? 'center' : 'left', color: muted ? '#475569' : undefined, ...style }}>{children}</td>
);
