import { useEffect, useState, useMemo, useRef } from 'react';
import { sbFetch } from '@korex/db';
import { Search, Msg } from '../components/bits.jsx';
import { money, ini, avatarColor, mlabel, ROLE, ROLE_LABEL } from '../lib/format.js';

// Acuerdos (diseño Claude Design): vista "Por cliente" (tarjetas editables de punta a
// punta: %, valor, umbral, asignaciones) y "Por conector" (cuánto genera cada conector).
// Lo que afecta el cálculo dispara el recálculo automático del motor (fin_recompute).
const ROLES = ['cliente', 'conector', 'afiliado', 'consultor', 'marketing'];
const TIPOS = ['SETUP', 'CRM', 'PUBLICIDAD'];
const TYPE_CHIP = { SETUP: ['#e2e8f0', '#475569'], CRM: ['#dbeafe', '#1d4ed8'], PUBLICIDAD: ['#fef3c7', '#b45309'] };
const pct = (v) => (v == null ? '—' : (Number(v) * 100).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + '%');

export default function AcuerdosPage() {
  const [terms, setTerms] = useState(null);
  const [rules, setRules] = useState(null);
  const [dir, setDir] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState('cliente');
  const [recalc, setRecalc] = useState('');
  const timer = useRef(null);

  const runRecompute = async () => {
    setRecalc('running');
    try { await sbFetch('rpc/fin_recompute', { method: 'POST', body: '{}', throwOnError: true }); setRecalc('done'); clearTimeout(timer.current); timer.current = setTimeout(() => setRecalc(''), 3000); }
    catch { setRecalc('err'); }
  };
  const scheduleRecompute = () => { setRecalc('pending'); clearTimeout(timer.current); timer.current = setTimeout(runRecompute, 900); };

  useEffect(() => {
    Promise.all([
      sbFetch('fin_client_terms?select=id,sheet_client_name,client_id,service_value,umbral_base,conector_name,consultor_name,marketing_name,conector_start_date,consultor_start_date,marketing_start_date&order=agreement_date.desc.nullslast'),
      sbFetch('fin_commission_rules?select=id,sheet_client_name,client_id,income_type,role_key,pct'),
      sbFetch('fin_directory?select=nombre,tipo,roles&limit=1000'),
      sbFetch('fin_incomes?select=conector_name_sheet,client_name_sheet,collected_by,net_usd,korex_real,fin_commission_entries(role_key,amount)&limit=6000'),
    ])
      .then(([t, r, dd, inc]) => { setTerms(t || []); setRules(r || []); setDir(dd || []); setIncomes(inc || []); })
      .catch((e) => setError(String(e)));
  }, []);

  const assignOpts = useMemo(() => {
    // SOLO personas de la Base de datos con ese rol (principal o adicional). Nada de texto libre.
    const byRole = (role) => dir.filter((x) => x.tipo === role || (x.roles || []).includes(role)).map((x) => x.nombre);
    const uniq = (arr) => [...new Set(arr.filter(Boolean).map((s) => String(s).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return { conector: uniq(byRole('Conector')), consultor: uniq(byRole('Consultor')), marketing: uniq(byRole('Marketing')) };
  }, [dir]);

  const cards = useMemo(() => {
    if (!terms || !rules) return null;
    const byClient = new Map();
    rules.forEach((r) => { const k = (r.sheet_client_name || '').toLowerCase(); if (!byClient.has(k)) byClient.set(k, {}); const m = byClient.get(k); (m[r.income_type] ||= {})[r.role_key] = { pct: Number(r.pct), id: r.id }; });
    return terms.map((t) => ({ ...t, matrix: byClient.get((t.sheet_client_name || '').toLowerCase()) || {} }));
  }, [terms, rules]);

  const conectorGroups = useMemo(() => {
    const m = {};
    incomes.forEach((r) => {
      const n = r.conector_name_sheet; if (!n) return;
      const con = (r.fin_commission_entries || []).filter((e) => e.role_key === 'conector').reduce((a, e) => a + (Number(e.amount) || 0), 0);
      const g = m[n] || (m[n] = { ventas: 0, fact: 0, cash: 0, comision: 0, clients: {} });
      // Facturación = neto · CashCollect = korex_real (mismas definiciones validadas del dashboard).
      g.ventas++; g.fact += Number(r.net_usd) || 0; g.cash += Number(r.korex_real) || 0; g.comision += con;
      const c = g.clients[r.client_name_sheet || '—'] || (g.clients[r.client_name_sheet || '—'] = { ventas: 0, fact: 0, cash: 0, comision: 0 });
      c.ventas++; c.fact += Number(r.net_usd) || 0; c.cash += Number(r.korex_real) || 0; c.comision += con;
    });
    return Object.entries(m).sort((a, b) => b[1].cash - a[1].cash).map(([name, g]) => ({ name, ...g, clients: Object.entries(g.clients).sort((a, b) => b[1].fact - a[1].fact).map(([cli, c]) => ({ cli, ...c })) }));
  }, [incomes]);

  if (error) return <Msg>Error cargando acuerdos: {error}</Msg>;
  if (!cards) return <Msg>Cargando acuerdos…</Msg>;

  const qq = q.trim().toLowerCase();
  const filteredCards = cards.filter((c) => !qq || (c.sheet_client_name || '').toLowerCase().includes(qq) || [c.conector_name, c.consultor_name, c.marketing_name].some((n) => (n || '').toLowerCase().includes(qq)));
  const filteredCon = conectorGroups.filter((g) => !qq || g.name.toLowerCase().includes(qq));
  const recalcLabel = recalc === 'pending' ? 'Cambios pendientes…' : recalc === 'running' ? 'Recalculando…' : recalc === 'done' ? '✓ Recalculado' : 'Recalcular ahora';

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px 40px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <Search value={q} onChange={setQ} placeholder="Buscar cliente o asignado…" width={280} />
        <div style={{ display: 'flex', gap: 3, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 10, padding: 3 }}>
          {[['cliente', 'Por cliente'], ['conector', 'Por conector']].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} style={{ border: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: view === v ? 700 : 500, padding: '6px 13px', borderRadius: 7, whiteSpace: 'nowrap', background: view === v ? '#0EA5A4' : 'transparent', color: view === v ? '#fff' : '#475569' }}>{label}</button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9AA4B2' }}>{view === 'cliente' ? `${filteredCards.length} acuerdos · todo editable, se recalcula solo` : `${filteredCon.length} conectores`}</span>
        <button onClick={runRecompute} disabled={recalc === 'running' || recalc === 'pending'} style={{ border: 0, background: recalc === 'done' ? '#dcfce7' : '#0EA5A4', color: recalc === 'done' ? '#15803d' : '#fff', fontSize: 12.5, fontWeight: 600, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', opacity: (recalc === 'running' || recalc === 'pending') ? 0.7 : 1 }}>{recalcLabel}</button>
      </div>

      {view === 'cliente' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {filteredCards.map((c) => <ClientCard key={c.id || c.sheet_client_name} c={c} assignOpts={assignOpts} onEdited={scheduleRecompute} />)}
          {!filteredCards.length && <div style={{ color: '#9AA4B2', padding: 40, textAlign: 'center', gridColumn: '1 / -1' }}>Sin resultados.</div>}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12.5, whiteSpace: 'nowrap' }}>
              <thead><tr style={{ color: '#64748B' }}>
                {[['Conector / Cliente', '#F8FAFC', '#64748B'], ['Ventas', '#F8FAFC', '#64748B'], ['Facturación', '#F0FDF4', '#15803d'], ['CashCollect', '#F0FDFA', '#0d9488'], ['Comisión conector', '#EAF6FE', '#0369a1']].map(([l, bg, fg]) => (
                  <th key={l} style={{ position: 'sticky', top: 0, background: bg, borderBottom: '1px solid #E2E5EB', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: fg }}>{l}</th>
                ))}
              </tr></thead>
              <tbody>
                {filteredCon.map((g) => { const [bg, fg] = avatarColor(g.name); return (
                  <Fragment key={g.name}>
                    <tr style={{ background: '#F6FBFB' }}>
                      <td style={{ padding: '9px 14px', borderBottom: '1px solid #E6ECF1', borderRight: '1px solid #EEF1F5', fontWeight: 700 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 22, height: 22, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700 }}>{ini(g.name)}</div>{g.name}</div></td>
                      <td style={conCell(700)}>{g.ventas}</td>
                      <td style={conCell(700)}>{money(g.fact)}</td>
                      <td style={{ ...conCell(700), color: '#15803d' }}>{money(g.cash)}</td>
                      <td style={{ ...conCell(700), color: '#0369a1', borderRight: 0 }}>{money(g.comision)}</td>
                    </tr>
                    {g.clients.map((cl) => (
                      <tr key={cl.cli}>
                        <td style={{ padding: '8px 14px 8px 36px', borderBottom: '1px solid #F4F6F9', borderRight: '1px solid #F4F6F9', color: '#475569' }}>{cl.cli}</td>
                        <td style={conSub()}>{cl.ventas}</td>
                        <td style={conSub()}>{money(cl.fact)}</td>
                        <td style={{ ...conSub(), color: '#15803d' }}>{money(cl.cash)}</td>
                        <td style={{ ...conSub(), color: '#0369a1', borderRight: 0 }}>{money(cl.comision)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ); })}
                {!filteredCon.length && <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: '#9AA4B2' }}>Sin conectores con ventas.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const conCell = (w) => ({ padding: '9px 14px', borderBottom: '1px solid #E6ECF1', borderRight: '1px solid #EEF1F5', fontWeight: w });
const conSub = () => ({ padding: '8px 14px', borderBottom: '1px solid #F4F6F9', borderRight: '1px solid #F4F6F9', color: '#64748B' });

/* ---------- tarjeta editable por cliente ---------- */
function ClientCard({ c, assignOpts, onEdited }) {
  const [matrix, setMatrix] = useState(c.matrix);
  const [fields, setFields] = useState({ service_value: c.service_value, umbral_base: c.umbral_base, conector_name: c.conector_name, consultor_name: c.consultor_name, marketing_name: c.marketing_name, conector_start_date: c.conector_start_date, consultor_start_date: c.consultor_start_date, marketing_start_date: c.marketing_start_date });
  const [state, setState] = useState('');
  const okTimer = useRef(null);
  const [bg, fg] = avatarColor(c.sheet_client_name);

  const flash = (s) => { setState(s); if (s === 'ok') { clearTimeout(okTimer.current); okTimer.current = setTimeout(() => setState(''), 1200); } };
  const patchTerm = async (body) => { if (!c.id) return; flash('saving'); try { await sbFetch(`fin_client_terms?id=eq.${c.id}`, { method: 'PATCH', body: JSON.stringify(body), throwOnError: true }); flash('ok'); } catch { flash('err'); } };

  const commitField = (field, raw, { kind = 'text', recompute = false } = {}) => {
    let val;
    if (kind === 'num') { const dd = String(raw).replace(/[^\d]/g, ''); val = dd === '' ? null : Number(dd); }
    else if (kind === 'date') { val = raw || null; }
    else { val = String(raw).trim() || null; }
    const same = kind === 'num' ? Number(fields[field] || 0) === Number(val || 0) : (fields[field] ?? null) === (val ?? null);
    if (same) return;
    setFields((f) => ({ ...f, [field]: val })); patchTerm({ [field]: val }); if (recompute) onEdited?.();
  };
  const commitCell = async (tipo, role, rawStr) => {
    const cur = matrix[tipo]?.[role];
    const curPctNum = cur ? Math.round(cur.pct * 1e6) : null;
    const raw = String(rawStr).trim().replace(',', '.');
    const n = raw === '' ? null : parseFloat(raw);
    const frac = n == null || isNaN(n) ? null : Math.round((n / 100) * 1e6) / 1e6;
    if (frac != null && curPctNum === Math.round(frac * 1e6)) return;
    // Korex admite 0 explícito (Korex no se lleva nada en esa categoría); para los demás
    // roles, 0 o vacío = borrar la regla. Vacío en Korex = volver a automático.
    const isKorex = role === 'korex_pct';
    flash('saving');
    try {
      if (frac == null || (frac === 0 && !isKorex)) {
        if (cur?.id) await sbFetch(`fin_commission_rules?id=eq.${cur.id}`, { method: 'DELETE', throwOnError: true });
        setMatrix((m) => { const t = { ...(m[tipo] || {}) }; delete t[role]; return { ...m, [tipo]: t }; });
      } else if (cur?.id) {
        await sbFetch(`fin_commission_rules?id=eq.${cur.id}`, { method: 'PATCH', body: JSON.stringify({ pct: frac }), throwOnError: true });
        setMatrix((m) => ({ ...m, [tipo]: { ...(m[tipo] || {}), [role]: { ...cur, pct: frac } } }));
      } else {
        const res = await sbFetch('fin_commission_rules', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ client_id: c.client_id || null, sheet_client_name: c.sheet_client_name, income_type: tipo, role_key: role, pct: frac }), throwOnError: true });
        const id = Array.isArray(res) ? res[0]?.id : res?.id;
        setMatrix((m) => ({ ...m, [tipo]: { ...(m[tipo] || {}), [role]: { pct: frac, id } } }));
      }
      flash('ok'); onEdited?.();
    } catch { flash('err'); }
  };

  const nonKorex = (tipo) => ROLES.reduce((a, r) => a + (matrix[tipo]?.[r]?.pct || 0), 0);
  const korexOf = (tipo) => (tipo === 'PUBLICIDAD' ? 0.15 : 1 - nonKorex(tipo));
  const ASSIGN = [['Conector', 'conector_name', 'conector_start_date', ROLE.conector, 'conector'], ['Consultor', 'consultor_name', 'consultor_start_date', ROLE.consultor, 'consultor'], ['Marketing', 'marketing_name', 'marketing_start_date', ROLE.marketing, 'marketing']];

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E5EB', borderRadius: 13, overflow: 'hidden', boxShadow: '0 1px 2px rgba(13,17,23,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 15px', borderBottom: '1px solid #EEF1F5', background: `linear-gradient(90deg, ${bg}, #fff)` }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12 }}>{ini(c.sheet_client_name)}</div>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{c.sheet_client_name}</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: c.client_id ? '#dcfce7' : '#f1f5f9', color: c.client_id ? '#15803d' : '#94a3b8' }}>{c.client_id ? 'en panel' : 'solo Sheet'}</span>
        <span style={{ fontSize: 10, minWidth: 56, textAlign: 'right', color: state === 'ok' ? '#16a34a' : state === 'err' ? '#dc2626' : '#9AA4B2' }}>{state === 'saving' ? 'guardando…' : state === 'ok' ? '✓' : state === 'err' ? 'error' : ''}</span>
      </div>

      <div style={{ display: 'flex', gap: 22, padding: '11px 15px', borderBottom: '1px solid #EEF1F5' }}>
        <Stat label="Valor"><Inp kind="num" value={fields.service_value} width={84} onCommit={(v) => commitField('service_value', v, { kind: 'num' })} /></Stat>
        <Stat label="Umbral"><Inp kind="num" value={fields.umbral_base} width={84} onCommit={(v) => commitField('umbral_base', v, { kind: 'num', recompute: true })} /></Stat>
      </div>

      <div style={{ padding: '10px 15px', borderBottom: '1px solid #EEF1F5', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ASSIGN.map(([rol, nameF, dateF, color, optsKey]) => (
          <div key={rol} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
            <span style={{ width: 64, fontWeight: 700, color }}>{rol}</span>
            <RoleSelect value={fields[nameF]} options={assignOpts[optsKey] || []} onCommit={(v) => commitField(nameF, v, { recompute: true })} />
            <span style={{ color: '#9AA4B2', fontSize: 10.5, whiteSpace: 'nowrap' }}>desde</span>
            <Inp type="date" value={fields[dateF]} width={120} onCommit={(v) => commitField(dateF, v, { kind: 'date', recompute: true })} />
          </div>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead><tr style={{ color: '#9AA4B2', textAlign: 'left' }}>
          <th style={{ textAlign: 'left', padding: '6px 15px', fontWeight: 600 }}>Tipo</th>
          {ROLES.map((r) => <th key={r} style={{ padding: '6px 4px', fontWeight: 700, color: ROLE[r] }}>{ROLE_LABEL[r]}</th>)}
          <th style={{ padding: '6px 4px', fontWeight: 700, color: '#15803d' }} title="Lo que se lleva Korex. Vacío = automático (lo que sobra / 15% en Publicidad). Escribí un % para fijarlo.">Korex</th>
          <th style={{ padding: '6px 15px 6px 4px', fontWeight: 600 }}>Σ</th>
        </tr></thead>
        <tbody>
          {TIPOS.map((tp) => {
            const kxOver = matrix[tp]?.korex_pct?.pct;   // % fijado a mano (override) o undefined = automático
            const kxAuto = korexOf(tp);                  // automático: lo que sobra (SETUP/CRM) o 15% (Publicidad)
            const effKx = kxOver != null ? kxOver : kxAuto;
            const sumAll = nonKorex(tp) + effKx;
            const over = (tp === 'SETUP' || tp === 'CRM') && sumAll > 1.0005;
            const [tbg, tfg] = TYPE_CHIP[tp];
            return (
              <tr key={tp} style={{ borderTop: '1px solid #EEF1F5' }}>
                <td style={{ padding: '6px 15px' }}><span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: tbg, color: tfg }}>{tp}</span></td>
                {ROLES.map((r) => <td key={r} style={{ padding: '6px 4px' }}><Pct value={matrix[tp]?.[r]?.pct} color={ROLE[r]} onCommit={(v) => commitCell(tp, r, v)} /></td>)}
                <td style={{ padding: '6px 4px' }}><KorexPct value={kxOver} auto={kxAuto} onCommit={(v) => commitCell(tp, 'korex_pct', v)} /></td>
                <td style={{ padding: '6px 15px 6px 4px', fontWeight: 700, color: over ? '#dc2626' : '#94a3b8' }}>{tp === 'PUBLICIDAD' ? '—' : `${over ? '⚠ ' : ''}${(sumAll * 100).toFixed(0)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, children }) {
  return <div><div style={{ fontSize: 10, color: '#9AA4B2', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div><div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>US$ {children}</div></div>;
}
function Inp({ value, type = 'text', kind = 'text', placeholder = '—', width, flex, list, onCommit }) {
  const init = value == null || value === '' ? '' : (kind === 'num' ? String(Math.round(Number(value))) : String(value));
  return <input type={type === 'date' ? 'date' : 'text'} inputMode={kind === 'num' ? 'numeric' : undefined} list={list} defaultValue={init} key={init} placeholder={placeholder}
    onBlur={(e) => onCommit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
    style={{ width: flex ? undefined : width, flex: flex ? 1 : undefined, minWidth: 0, fontSize: kind === 'num' ? 14 : 11.5, fontWeight: kind === 'num' ? 700 : 400, background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '2px 4px', outline: 'none', color: init === '' ? '#cbd5e1' : '#1e293b' }}
    onFocus={(e) => { e.target.style.borderColor = '#99E6E3'; e.target.style.background = '#fff'; }} onBlurCapture={(e) => { e.target.style.borderColor = 'transparent'; }} />;
}
// Desplegable de asignación: SOLO personas con ese rol en la Base de datos (sin texto libre).
// Si el valor actual no está registrado con ese rol, lo muestra igual marcado "sin ficha".
function RoleSelect({ value, options, onCommit }) {
  const cur = (value || '').trim();
  const has = cur && options.some((o) => o === cur);
  const sel = { flex: 1, minWidth: 0, fontSize: 11.5, border: '1px solid transparent', borderRadius: 4, padding: '2px 4px', background: 'transparent', outline: 'none', color: cur ? '#1e293b' : '#cbd5e1', cursor: 'pointer', fontWeight: 400 };
  return (
    <select value={cur} onChange={(e) => onCommit(e.target.value)} style={sel}
      onFocus={(e) => { e.target.style.borderColor = '#99E6E3'; e.target.style.background = '#fff'; }}
      onBlur={(e) => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; }}>
      <option value="">sin asignar</option>
      {cur && !has && <option value={cur}>{cur} — sin ficha</option>}
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Pct({ value, color, onCommit }) {
  const init = value ? String(+(value * 100).toFixed(2)) : '';
  return <input type="text" inputMode="decimal" defaultValue={init} key={init} placeholder="—"
    onBlur={(e) => onCommit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
    style={{ width: 44, fontSize: 11, textAlign: 'left', background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '2px 4px', outline: 'none', fontWeight: value ? 600 : 400, color: value ? color : '#cbd5e1' }}
    onFocus={(e) => { e.target.style.borderColor = '#99E6E3'; e.target.style.background = '#fff'; }} />;
}
// % de Korex: vacío = automático (lo que sobra / 15% en Publicidad). Si se fija a mano, queda en verde.
// Borrar el valor lo devuelve a automático (commitCell borra la regla 'korex_pct').
function KorexPct({ value, auto, onCommit }) {
  const has = value != null;
  const init = has ? String(+(value * 100).toFixed(2)) : '';
  const autoStr = auto == null ? 'auto' : String(+(auto * 100).toFixed(1));
  return <input type="text" inputMode="decimal" defaultValue={init} key={init} placeholder={autoStr}
    title={has ? 'Korex fijado a mano — borralo para volver a automático' : `Automático: ${autoStr}% (lo que sobra). Escribí un % para fijar cuánto se lleva Korex acá.`}
    onBlur={(e) => onCommit(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
    style={{ width: 46, fontSize: 11, textAlign: 'left', background: has ? '#F0FDF4' : 'transparent', border: `1px solid ${has ? '#B6E8C5' : 'transparent'}`, borderRadius: 4, padding: '2px 4px', outline: 'none', fontWeight: 700, color: has ? '#15803d' : '#cbd5e1' }}
    onFocus={(e) => { e.target.style.borderColor = '#99E6E3'; e.target.style.background = '#fff'; }} />;
}
const Fragment = ({ children }) => <>{children}</>;
