// Tablero de gasto de la API de Anthropic — control total de lo que se usa con la API.
// Muestra gasto hoy/semana/mes, desglose por modelo y por función, serie diaria y
// las últimas llamadas. Permite fijar el MODELO y los TOPES de gasto (frenos anti-fuga).
import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { sbFetch, supabase } from '@korex/db';
import { Cpu, RefreshCw, ShieldCheck, DollarSign, Activity, Save } from 'lucide-react';

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (más barato)' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 (más capaz)' },
];
const money = (n) => 'US$' + Number(n || 0).toFixed(4);
const fmtDT = (s) => { try { return new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
const FN_LABEL = { generate_avatars: 'Generar avatares' };

function Card({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-2xl p-[18px]" style={{ border: '1px solid #E7EAF0', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] mb-1.5" style={{ color: color || '#9098A4' }}>{label}</div>
      <div className="text-[26px] font-extrabold tracking-[-.02em]" style={{ color: '#1A1D26' }}>{value}</div>
      {sub && <div className="text-[11.5px] text-[#9098A4] mt-0.5">{sub}</div>}
    </div>
  );
}

export default function ApiUsageEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  const base = () => ({
    avatar_model: appSettings?.api_config?.avatar_model || 'claude-haiku-4-5-20251001',
    daily_cap_usd: appSettings?.api_config?.daily_cap_usd ?? 5,
    monthly_cap_usd: appSettings?.api_config?.monthly_cap_usd ?? 100,
  });
  const [draft, setDraft] = useState(base);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setDraft(base()); /* eslint-disable-next-line */ }, [appSettings]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: s }, r] = await Promise.all([
        supabase.rpc('api_usage_stats'),
        sbFetch('api_usage?select=created_at,fn,model,input_tokens,output_tokens,cost_usd,status,error&order=created_at.desc&limit=25'),
      ]);
      setStats(s || null);
      setRecent(Array.isArray(r) ? r : []);
    } catch { /* noop */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = () => {
    const prev = appSettings?.api_config || {};
    updateAppSettings({ api_config: { ...prev, avatar_model: draft.avatar_model, daily_cap_usd: Number(draft.daily_cap_usd) || 0, monthly_cap_usd: Number(draft.monthly_cap_usd) || 0 } });
    setDirty(false);
  };

  const byModel = stats?.by_model || {};
  const byFn = stats?.by_fn || {};
  const daily = stats?.daily || [];
  const maxDay = Math.max(0.0001, ...daily.map((d) => Number(d.cost || 0)));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex gap-3 items-center">
          <span className="inline-flex items-center justify-center w-[38px] h-[38px] rounded-[11px]" style={{ background: '#EEF2FF', color: '#4A67D8' }}><Cpu size={20} /></span>
          <div>
            <div className="text-[16px] font-bold text-[#1A1D26] tracking-[-.01em]">Gasto de API</div>
            <div className="text-[12px] text-[#9098A4]">Control total de lo que se usa con la API de Anthropic. Cada llamada queda registrada.</div>
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-white border border-[#E2E5EB] rounded-lg py-2 px-3 text-[#3F4653] cursor-pointer hover:bg-[#F7F8FA]"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />Actualizar</button>
      </div>

      {/* Cards de gasto */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <Card label="Hoy" value={money(stats?.today?.cost)} sub={`${stats?.today?.calls || 0} llamadas`} color="#4A67D8" />
        <Card label="Esta semana" value={money(stats?.week?.cost)} sub={`${stats?.week?.calls || 0} llamadas`} color="#7C3AED" />
        <Card label="Este mes" value={money(stats?.month?.cost)} sub={`${stats?.month?.calls || 0} llamadas`} color="#DB2777" />
      </div>

      {/* Config: modelo + topes (frenos anti-fuga) */}
      <div className="bg-white rounded-2xl p-[18px]" style={{ border: '1px solid #E7EAF0', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
        <div className="flex items-center gap-2 mb-3"><ShieldCheck size={16} className="text-[#16A34A]" /><span className="text-[13px] font-bold text-[#1A1D26]">Control y frenos</span></div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
          <div>
            <div className="text-[11px] font-semibold text-[#6B7280] mb-1.5">Modelo para avatares</div>
            <select value={draft.avatar_model} onChange={(e) => { setDraft((d) => ({ ...d, avatar_model: e.target.value })); setDirty(true); }} className="w-full py-2 px-[11px] border border-[#E2E5EB] rounded-lg text-[12.5px] text-[#1A1D26] bg-white outline-none focus:border-blue cursor-pointer">
              {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6B7280] mb-1.5">Tope diario (US$)</div>
            <input type="number" min="0" step="1" value={draft.daily_cap_usd} onChange={(e) => { setDraft((d) => ({ ...d, daily_cap_usd: e.target.value })); setDirty(true); }} className="w-full py-2 px-[11px] border border-[#E2E5EB] rounded-lg text-[12.5px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-[#6B7280] mb-1.5">Tope mensual (US$)</div>
            <input type="number" min="0" step="10" value={draft.monthly_cap_usd} onChange={(e) => { setDraft((d) => ({ ...d, monthly_cap_usd: e.target.value })); setDirty(true); }} className="w-full py-2 px-[11px] border border-[#E2E5EB] rounded-lg text-[12.5px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
          </div>
        </div>
        <div className="text-[10.5px] text-[#AEB4BF] mt-2.5">Si se alcanza el tope, la API deja de llamarse hasta el día/mes siguiente (o subís el tope acá). Nada corre en segundo plano: la API solo se usa cuando alguien toca un botón.</div>
        {dirty && <div className="flex justify-end mt-3"><button onClick={save} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold bg-blue text-white rounded-lg py-2 px-3.5 cursor-pointer hover:bg-blue-dark border-none"><Save size={14} />Guardar</button></div>}
      </div>

      {/* Desgloses */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        <div className="bg-white rounded-2xl p-[18px]" style={{ border: '1px solid #E7EAF0', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
          <div className="flex items-center gap-2 mb-2.5"><DollarSign size={15} className="text-[#4A67D8]" /><span className="text-[12.5px] font-bold text-[#1A1D26]">Por modelo (este mes)</span></div>
          {Object.keys(byModel).length ? Object.entries(byModel).map(([m, v]) => (
            <div key={m} className="flex items-center justify-between py-1.5 border-b border-[#F1F3F7] last:border-0">
              <span className="text-[12px] text-[#3F4653] truncate">{m}</span>
              <span className="text-[12px] font-semibold text-[#1A1D26] shrink-0">{money(v.cost)} <span className="text-[#AEB4BF] font-normal">· {v.calls}</span></span>
            </div>
          )) : <div className="text-[11.5px] text-[#AEB4BF] py-1.5">Sin uso este mes.</div>}
        </div>
        <div className="bg-white rounded-2xl p-[18px]" style={{ border: '1px solid #E7EAF0', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
          <div className="flex items-center gap-2 mb-2.5"><Activity size={15} className="text-[#DB2777]" /><span className="text-[12.5px] font-bold text-[#1A1D26]">Por función (este mes)</span></div>
          {Object.keys(byFn).length ? Object.entries(byFn).map(([fn, v]) => (
            <div key={fn} className="flex items-center justify-between py-1.5 border-b border-[#F1F3F7] last:border-0">
              <span className="text-[12px] text-[#3F4653] truncate">{FN_LABEL[fn] || fn}</span>
              <span className="text-[12px] font-semibold text-[#1A1D26] shrink-0">{money(v.cost)} <span className="text-[#AEB4BF] font-normal">· {v.calls}</span></span>
            </div>
          )) : <div className="text-[11.5px] text-[#AEB4BF] py-1.5">Sin uso este mes.</div>}
        </div>
      </div>

      {/* Serie diaria (últimos 30 días) */}
      {daily.length > 0 && (
        <div className="bg-white rounded-2xl p-[18px]" style={{ border: '1px solid #E7EAF0', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
          <div className="text-[12.5px] font-bold text-[#1A1D26] mb-3">Gasto diario (últimos 30 días)</div>
          <div className="flex items-end gap-1 h-[90px]">
            {daily.map((d) => (
              <div key={d.day} title={`${d.day}: ${money(d.cost)}`} className="flex-1 rounded-t" style={{ height: `${Math.max(3, (Number(d.cost) / maxDay) * 90)}px`, background: 'linear-gradient(180deg,#7B9AFF,#4A67D8)', minWidth: 4 }} />
            ))}
          </div>
        </div>
      )}

      {/* Últimas llamadas */}
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E7EAF0', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
        <div className="text-[12.5px] font-bold text-[#1A1D26] py-3 px-[18px] border-b border-[#F1F3F7]">Últimas llamadas</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]" style={{ borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr className="text-[#9098A4] text-left">
                {['Fecha', 'Función', 'Modelo', 'Tokens (in/out)', 'Costo', 'Estado'].map((h) => <th key={h} className="font-semibold py-2 px-[18px] whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {recent.length ? recent.map((r, i) => (
                <tr key={i} className="border-t border-[#F1F3F7]">
                  <td className="py-2 px-[18px] text-[#6B7280] whitespace-nowrap">{fmtDT(r.created_at)}</td>
                  <td className="py-2 px-[18px] text-[#3F4653]">{FN_LABEL[r.fn] || r.fn}</td>
                  <td className="py-2 px-[18px] text-[#6B7280]">{r.model}</td>
                  <td className="py-2 px-[18px] text-[#6B7280] whitespace-nowrap">{(r.input_tokens || 0).toLocaleString()} / {(r.output_tokens || 0).toLocaleString()}</td>
                  <td className="py-2 px-[18px] font-semibold text-[#1A1D26] whitespace-nowrap">{money(r.cost_usd)}</td>
                  <td className="py-2 px-[18px]">
                    <span className="inline-flex items-center py-[2px] px-2 rounded-full text-[10px] font-bold" style={r.status === 'ok' ? { background: '#ECFDF3', color: '#15803D' } : r.status === 'blocked' ? { background: '#FEF3C7', color: '#B45309' } : { background: '#FEF2F2', color: '#B91C1C' }}>{r.status === 'ok' ? 'OK' : r.status === 'blocked' ? 'Frenado' : 'Error'}</span>
                  </td>
                </tr>
              )) : <tr><td colSpan={6} className="py-4 px-[18px] text-center text-[#AEB4BF]">Todavía no hay llamadas registradas.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
