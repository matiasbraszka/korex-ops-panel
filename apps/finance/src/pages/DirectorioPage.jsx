import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
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
  const [editId, setEditId] = useState(null);   // persona en edición (id de fin_directory)

  const load = useCallback(() => {
    sbFetch('fin_person_activity?select=id,nombre,tipo,cli,ref,email,telefono,contrato_firmado,ingreso_date,pagos_count,pagos_net_usd,com_count,com_amount,referidos_count&order=ingreso_date.desc.nullslast&limit=2000')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

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

  if (error) return <Msg>Error cargando la base de datos: {error}</Msg>;
  if (!rows) return <Msg>Cargando base de datos…</Msg>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '16px 22px 0' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 11, flexShrink: 0 }}>
        {counts.map(([k, n]) => { const [bg, fg] = roleChip(k); return (
          <span key={k} style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 20, background: bg, color: fg }}>{k} · <b>{n}</b></span>
        ); })}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9AA4B2' }}>{rows.length} personas</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 11, flexShrink: 0 }}>
        <button onClick={() => setEditId('new')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#fff', border: 0, borderRadius: 9, padding: '8px 13px', cursor: 'pointer', whiteSpace: 'nowrap', background: '#0EA5A4' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg> Nueva persona
        </button>
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
              {['Persona', 'Rol', 'Cliente', 'Referente', 'Pagó', 'Cobró', 'Trajo', 'Contrato', 'Ingreso', ''].map((h, i) => (
                <th key={i} style={{ position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '1px solid #E2E5EB', padding: '10px 14px', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', textAlign: (i >= 4 && i <= 6) || i === 7 ? (i === 4 || i === 5 ? 'left' : 'center') : 'left' }}>{h}</th>
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
                  <Td center>
                    <button onClick={(e) => { e.stopPropagation(); setEditId(r.id); }} title="Editar datos y facturación" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: hov ? '#0EA5A4' : '#C4CCD6', padding: 0, display: 'inline-flex' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    </button>
                  </Td>
                </tr>
              );
            })}
            {!filtered.length && <tr><td colSpan={10} style={{ padding: 30, textAlign: 'center', color: '#9AA4B2' }}>Sin resultados.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ height: 14, flexShrink: 0 }} />

      {openId && <PersonDrawer personId={openId} onClose={() => setOpenId(null)} onOpenPerson={setOpenId} />}
      {editId && <EditPersonModal id={editId === 'new' ? null : editId} onClose={() => setEditId(null)} onSaved={() => { setEditId(null); load(); }} />}
    </div>
  );
}

/* ---------- alta / edición / baja de persona ---------- */
const FACTURAR_OPTS = ['', 'Persona', 'Empresa'];
function EditPersonModal({ id, onClose, onSaved }) {
  const isNew = !id;
  const [data, setData] = useState(isNew ? {} : null);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [aliasInput, setAliasInput] = useState('');
  // Roster completo de la base (para los desplegables de Cliente / Conector / Afiliado:
  // así solo se puede elegir gente ya registrada y no hay typos).
  const [roster, setRoster] = useState([]);
  useEffect(() => {
    sbFetch('fin_directory?select=nombre,tipo,roles&order=nombre.asc&limit=3000')
      .then((d) => setRoster(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);
  const uniqSorted = (arr) => [...new Set(arr.filter(Boolean).map((s) => String(s).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // Cliente = rol principal Cliente o que tenga 'Cliente' entre sus roles adicionales.
  const isRole = (p, r) => p.tipo === r || (p.roles || []).includes(r);
  const clientOpts = useMemo(() => uniqSorted(roster.filter((p) => isRole(p, 'Cliente')).map((p) => p.nombre)), [roster]);
  const personOpts = useMemo(() => uniqSorted(roster.map((p) => p.nombre).filter((n) => n !== (data?.nombre || ''))), [roster, data]);
  const addAlias = () => {
    const v = aliasInput.trim(); if (!v) return;
    setData((s) => { const cur = s.aliases || []; if (cur.some((a) => a.trim().toLowerCase() === v.toLowerCase())) return s; return { ...s, aliases: [...cur, v] }; });
    setAliasInput('');
  };
  const removeAlias = (i) => setData((s) => ({ ...s, aliases: (s.aliases || []).filter((_, j) => j !== i) }));

  useEffect(() => {
    if (isNew) return;
    let alive = true;
    sbFetch(`fin_directory?id=eq.${id}&select=nombre,tipo,cliente_padre,conector,conector_e,email,telefono,dir_facturacion,id_fiscal,facturar_a,empresa,aliases,roles&limit=1`)
      .then((d) => { if (alive) { const row = (Array.isArray(d) ? d[0] : null) || {}; row.conector_e = row.conector_e || row.conector || ''; setData(row); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(String(e)); setLoading(false); } });
    return () => { alive = false; };
  }, [id, isNew]);

  const set = (k, v) => setData((s) => ({ ...s, [k]: v }));
  const esCliente = data?.tipo === 'Cliente';
  // Roles adicionales (doble rol): etiqueta informativa, el motor de comisiones NO la usa.
  const toggleRole = (r) => setData((s) => { const cur = s.roles || []; return { ...s, roles: cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r] }; });
  const fields = () => {
    const t = data.tipo || null;
    return {
      nombre: (data.nombre || '').trim() || null,
      tipo: t,
      // "Pertenece a un cliente" solo aplica a Usuarios. Cliente = él mismo; el resto (conector/
      // consultor/marketing) no pertenece a un cliente.
      cliente_padre: t === 'Cliente' ? ((data.nombre || '').trim() || null) : (t === 'Usuario' ? ((data.cliente_padre || '').trim() || null) : null),
      conector_e: (data.conector_e || '').trim() || null,   // Conector (clientes) / Afiliado (usuarios)
      email: (data.email || '').trim() || null, telefono: (data.telefono || '').trim() || null,
      dir_facturacion: (data.dir_facturacion || '').trim() || null, id_fiscal: (data.id_fiscal || '').trim() || null,
      facturar_a: data.facturar_a || null, empresa: (data.empresa || '').trim() || null,
      aliases: (data.aliases || []).map((a) => String(a).trim()).filter(Boolean),
      roles: (data.roles || []).filter((r) => r && r !== t),
    };
  };
  const save = async () => {
    if (!(data.nombre || '').trim()) { setErr('El nombre es obligatorio.'); return; }
    setBusy(true); setErr('');
    try {
      if (isNew) {
        await sbFetch('fin_directory', { method: 'POST', headers: { Prefer: 'return=minimal' }, throwOnError: true, body: JSON.stringify(fields()) });
      } else {
        await sbFetch(`fin_directory?id=eq.${id}`, { method: 'PATCH', throwOnError: true, body: JSON.stringify(fields()) });
        // Propaga el afiliado de esta persona a todos sus ingresos + recalcula comisiones.
        await sbFetch('rpc/fin_set_afiliado_for_person', { method: 'POST', body: JSON.stringify({ p_id: id }) }).catch(() => {});
      }
      // Recalcula la conciliación: los alias nuevos hacen matchear pagos con nombre distinto.
      await sbFetch('rpc/fin_recon_run', { method: 'POST', body: '{}' }).catch(() => {});
      onSaved?.();
    } catch (e) { setErr(String(e)); setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setErr('');
    try { await sbFetch(`fin_directory?id=eq.${id}`, { method: 'DELETE', throwOnError: true }); onSaved?.(); }
    catch (e) { setErr(String(e)); setBusy(false); }
  };

  const lab = { fontSize: 11, fontWeight: 600, color: '#64748B', display: 'block', marginBottom: 5 };
  const inp = { width: '100%', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(13,17,23,.4)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(13,17,23,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #EEF1F5' }}>
          <div><div style={{ fontSize: 16, fontWeight: 800 }}>{isNew ? 'Nueva persona' : (loading ? 'Editar persona' : (data?.nombre || 'Editar persona'))}</div><div style={{ fontSize: 12, color: '#9AA4B2', marginTop: 2 }}>Datos de contacto y facturación (se usan al emitir la factura)</div></div>
          <button onClick={onClose} style={{ border: 0, background: '#F1F5F9', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', color: '#64748B', fontSize: 16 }}>✕</button>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9AA4B2', fontSize: 13 }}>Cargando…</div>
        ) : (
          <>
            <div style={{ padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Nombre <span style={{ color: '#e11d48' }}>*</span> {!isNew && <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· al cambiarlo se re-vinculan sus pagos</span>}</label><input value={data.nombre || ''} onChange={(e) => set('nombre', e.target.value)} placeholder="Nombre y apellido" style={inp} /></div>
              <div><label style={lab}>Rol principal</label><select value={data.tipo || ''} onChange={(e) => setData((s) => ({ ...s, tipo: e.target.value, roles: (s.roles || []).filter((r) => r !== e.target.value) }))} style={inp}>{['', 'Cliente', 'Usuario', 'Conector', 'Consultor', 'Marketing'].map((t) => <option key={t} value={t}>{t || '—'}</option>)}</select></div>
              {data.tipo === 'Usuario' && <div><label style={lab}>Cliente (al que pertenece)</label><Combo value={data.cliente_padre} onChange={(v) => set('cliente_padre', v)} options={clientOpts} placeholder="elegir cliente…" empty="Ese cliente no está en la base. Agregalo primero." /></div>}
              <div><label style={lab}>{esCliente ? 'Conector' : 'Afiliado'} <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· {esCliente ? 'quién trajo al cliente' : 'quién lo refirió (se sugiere al cargar su ingreso)'}</span></label><Combo value={data.conector_e} onChange={(v) => set('conector_e', v)} options={personOpts} placeholder={esCliente ? 'elegir conector…' : 'elegir afiliado…'} empty="No está en la base. Agregalo primero como persona." /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lab}>También es <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· roles adicionales (solo lo clasifica, NO cambia las comisiones)</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['Cliente', 'Usuario', 'Conector', 'Consultor', 'Marketing'].filter((r) => r !== data.tipo).map((r) => {
                    const on = (data.roles || []).includes(r);
                    return <button key={r} type="button" onClick={() => toggleRole(r)} style={{ border: `1px solid ${on ? '#0EA5A4' : '#E2E5EB'}`, background: on ? '#0EA5A4' : '#fff', color: on ? '#fff' : '#475569', fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 20, cursor: 'pointer' }}>{r}</button>;
                  })}
                </div>
              </div>
              <div><label style={lab}>E-mail</label><input value={data.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="—" style={inp} /></div>
              <div><label style={lab}>Teléfono</label><input value={data.telefono || ''} onChange={(e) => set('telefono', e.target.value)} placeholder="—" style={inp} /></div>
              <div><label style={lab}>Facturar a</label><select value={data.facturar_a || ''} onChange={(e) => set('facturar_a', e.target.value)} style={inp}>{FACTURAR_OPTS.map((t) => <option key={t} value={t}>{t || '—'}</option>)}</select></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lab}>ID fiscal o DNI</label><input value={data.id_fiscal || ''} onChange={(e) => set('id_fiscal', e.target.value)} placeholder="—" style={inp} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Dirección de facturación</label><input value={data.dir_facturacion || ''} onChange={(e) => set('dir_facturacion', e.target.value)} placeholder="—" style={inp} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Empresa <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· se factura a este nombre si "Facturar a" = Empresa</span></label><input value={data.empresa || ''} onChange={(e) => set('empresa', e.target.value)} placeholder="—" style={inp} /></div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lab}>Otros nombres (alias) <span style={{ color: '#9AA4B2', fontWeight: 400 }}>· con qué otro nombre aparece en Stripe/Mercury — para vincular esos pagos</span></label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, border: '1px solid #E2E5EB', borderRadius: 8, padding: 6, background: '#fff' }}>
                  {(data.aliases || []).map((a, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, background: '#EEF0FF', color: '#4338ca', padding: '3px 8px', borderRadius: 20 }}>
                      {a}<button type="button" onClick={() => removeAlias(i)} title="quitar" style={{ border: 0, background: 'transparent', color: '#6366f1', cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                  <input value={aliasInput} onChange={(e) => setAliasInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addAlias(); } }} onBlur={addAlias} placeholder={(data.aliases || []).length ? 'agregar otro…' : 'ej. el nombre completo que figura en Stripe'} style={{ flex: 1, minWidth: 140, border: 0, outline: 'none', fontSize: 13, padding: '3px 4px', background: 'transparent' }} />
                </div>
              </div>
              {err && <div style={{ gridColumn: '1 / -1', color: '#dc2626', fontSize: 12 }}>Error: {err}</div>}
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid #EEF1F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                {!isNew && (confirmDel
                  ? <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#be123c' }}>¿Borrar del directorio?
                      <button onClick={remove} disabled={busy} style={{ border: 0, background: '#e11d48', color: '#fff', fontSize: 12, fontWeight: 700, padding: '6px 11px', borderRadius: 8, cursor: 'pointer' }}>Sí, borrar</button>
                      <button onClick={() => setConfirmDel(false)} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, padding: '6px 11px', borderRadius: 8, cursor: 'pointer' }}>No</button>
                    </span>
                  : <button onClick={() => setConfirmDel(true)} style={{ border: '1px solid #FBC9CF', background: '#fff', color: '#be123c', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 9, cursor: 'pointer' }}>Eliminar</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={onClose} style={{ border: '1px solid #E2E5EB', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 9, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={save} disabled={busy} style={{ border: 0, background: '#0EA5A4', color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 18px', borderRadius: 9, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? 'Guardando…' : (isNew ? 'Crear persona' : 'Guardar')}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const Td = ({ children, center, muted, style }) => (
  <td style={{ padding: '9px 14px', borderBottom: '1px solid #EEF1F5', borderRight: '1px solid #F4F6F9', textAlign: center ? 'center' : 'left', color: muted ? '#475569' : undefined, ...style }}>{children}</td>
);

// Desplegable con búsqueda: SOLO se puede elegir gente ya registrada en la Base de datos
// (evita typos y que se asigne a alguien que no existe). El texto tipeado solo filtra; el
// valor se setea al hacer click en una opción. Si el valor actual no está registrado, lo
// muestra arriba marcado para que se pueda mantener o reemplazar.
function Combo({ value, onChange, options, placeholder = 'elegir…', empty }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(null); // null = muestra el value; string = buscando
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(null); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const q = (query || '').trim().toLowerCase();
  const list = (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, 80);
  const notReg = value && !options.some((o) => o.toLowerCase() === String(value).toLowerCase());
  const pick = (v) => { onChange(v); setOpen(false); setQuery(null); };
  const inpS = { width: '100%', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' };
  const optS = { padding: '8px 10px', fontSize: 13, cursor: 'pointer', borderTop: '1px solid #F4F6F9' };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input value={query == null ? (value || '') : query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        placeholder={placeholder} style={{ ...inpS, paddingRight: value ? 26 : 10 }} />
      {value && <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(null); }} title="quitar"
        style={{ position: 'absolute', right: 7, top: 9, border: 0, background: 'transparent', color: '#9AA4B2', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>}
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 8, boxShadow: '0 10px 30px rgba(13,17,23,.14)', maxHeight: 220, overflowY: 'auto' }}>
          {notReg && (
            <div onMouseDown={(e) => { e.preventDefault(); pick(value); }} style={{ ...optS, borderTop: 0, color: '#b45309', background: '#FFFBEB' }}>
              {value} <span style={{ fontSize: 11 }}>· actual (sin registrar)</span>
            </div>
          )}
          {list.length === 0
            ? <div style={{ padding: '10px', fontSize: 12, color: '#9AA4B2' }}>{empty || 'Sin coincidencias. Agregalo primero en Base de datos.'}</div>
            : list.map((o) => <div key={o} onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F6FBFB'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                style={optS}>{o}</div>)}
        </div>
      )}
    </div>
  );
}
