import { useEffect, useMemo, useState } from 'react';
import { Users, Phone, DollarSign, Sparkles } from 'lucide-react';
import { supabase } from '@korex/db';
import { useDashboard } from '../hooks/useDashboard.js';
import { useCrm } from '../hooks/useCrm.js';
import KpiCard from '../components/dashboard/KpiCard.jsx';
import FunnelChart from '../components/dashboard/FunnelChart.jsx';
import HeatChart from '../components/dashboard/HeatChart.jsx';
import VendorsTable from '../components/dashboard/VendorsTable.jsx';
import DashboardFilters from '../components/dashboard/DashboardFilters.jsx';
import TargetsModal from '../components/dashboard/TargetsModal.jsx';
import { fmtMoney, fmtInt } from '../components/dashboard/format.js';

// Suma in-memory `per_owner` y derivados, opcionalmente filtrando por vendor.
function aggregateView(data, sellers, vendor) {
  const empty = {
    contacts: 0, calls: 0, proposals: 0, won: 0,
    revenue: 0, pipeline: 0, avg_deal: 0,
    contacts_prev: 0, won_prev: 0, proposals_prev: 0, revenue_prev: 0,
  };
  if (!data) return { kpis: empty, sparks: { contacts: [] }, vendorRows: [], funnel: [], heat: [] };

  const perOwner = data.per_owner || [];
  const perPrev = data.per_owner_prev || [];
  const perCalls = data.per_owner_calls || [];
  const targets = data.targets || {};
  const spark = data.spark || [];

  const callsByOwner = Object.fromEntries(perCalls.map((r) => [r.owner_id, Number(r.calls) || 0]));
  const prevByOwner = Object.fromEntries(perPrev.map((r) => [r.owner_id, r]));

  // Build vendor rows = todos los sellers + cualquier owner que aparezca con datos
  const sellersById = Object.fromEntries(sellers.map((s) => [s.user_id, s]));
  // SOLO mostrar miembros validos del equipo de ventas (sellers + admins).
  // Owner_ids de leads que ya no estan en el equipo no se renderizan.
  const ownerIds = new Set(sellers.map((s) => s.user_id).filter(Boolean));

  const rows = [...ownerIds].map((uid) => {
    const po = perOwner.find((r) => r.owner_id === uid) || {};
    const prev = prevByOwner[uid] || {};
    const seller = sellersById[uid] || {};
    if (!seller.user_id) return null;
    const calls = callsByOwner[uid] || 0;
    const proposals = Number(po.proposals || 0);
    const won = Number(po.won || 0);
    return {
      user_id: uid,
      name: seller.name || '(sin perfil)',
      role: seller.role,
      color: seller.color,
      avatar_url: seller.avatar_url,
      contacts: Number(po.contacts || 0),
      calls,
      proposals,
      won,
      revenue: Number(po.revenue || 0),
      pipeline: Number(po.pipeline || 0),
      avg_deal: Number(po.avg_deal || 0),
      convRate: proposals > 0 ? won / proposals : 0,
      target: Number(targets[uid] || 0),
      contacts_prev: Number(prev.contacts_prev || 0),
      won_prev: Number(prev.won_prev || 0),
      proposals_prev: Number(prev.proposals_prev || 0),
      revenue_prev: Number(prev.revenue_prev || 0),
    };
  }).filter(Boolean);

  const filtered = vendor === 'all' ? rows : rows.filter((r) => r.user_id === vendor);
  const sum = filtered.reduce((a, r) => {
    a.contacts += r.contacts; a.calls += r.calls; a.proposals += r.proposals; a.won += r.won;
    a.revenue += r.revenue; a.pipeline += r.pipeline;
    a.contacts_prev += r.contacts_prev; a.won_prev += r.won_prev;
    a.proposals_prev += r.proposals_prev; a.revenue_prev += r.revenue_prev;
    return a;
  }, { ...empty });
  sum.avg_deal = sum.won > 0 ? sum.revenue / sum.won : 0;

  // Sparkline contactos: agrupar buckets de spark por fecha sumando v
  const sparkFiltered = vendor === 'all' ? spark : spark.filter((s) => s.owner_id === vendor);
  const byBucket = {};
  sparkFiltered.forEach((s) => { byBucket[s.bucket] = (byBucket[s.bucket] || 0) + Number(s.v); });
  const sparkContacts = Object.keys(byBucket).sort().map((k) => byBucket[k]);

  return { kpis: sum, sparks: { contacts: sparkContacts }, vendorRows: rows, funnel: data.funnel || [], heat: data.heat || [] };
}

function pctChange(curr, prev) {
  if (!prev || prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

export default function DashboardPage() {
  const [vendor, setVendor] = useState('all');
  const [range, setRange] = useState('month');
  const [pipelineFilter, setPipelineFilter] = useState(null); // null = todos
  const [targetsOpen, setTargetsOpen] = useState(false);

  const { data, loading, error, reload } = useDashboard(range, pipelineFilter);
  const { sellers, salesTeam, pipelines } = useCrm();
  const isAdmin = useIsAdmin();

  // salesTeam = vendedores + admins. Es el universo permitido para aparecer
  // en la tabla. Filtra los owner_id "fantasma" que vinieron del RPC pero no
  // pertenecen al equipo de ventas (ej: leads creados por usuarios borrados).
  const view = useMemo(() => aggregateView(data, salesTeam, vendor), [data, salesTeam, vendor]);
  const { kpis, sparks, vendorRows, funnel, heat } = view;

  const convRate = kpis.proposals > 0 ? kpis.won / kpis.proposals : 0;
  const convRatePrev = kpis.proposals_prev > 0 ? kpis.won_prev / kpis.proposals_prev : 0;

  // % del objetivo: revenue acumulado vs sum(targets) del set visible.
  const totalTarget = vendorRows.reduce((a, r) => a + Number(r.target || 0), 0);
  const objetivoPct = totalTarget > 0 ? Math.round((kpis.revenue / totalTarget) * 100) : null;

  return (
    <div className="flex flex-col gap-3.5 max-md:gap-3 pb-4">
      <DashboardFilters
        vendor={vendor} setVendor={setVendor}
        range={range} setRange={setRange}
        pipelineId={pipelineFilter} setPipelineId={setPipelineFilter}
        pipelines={pipelines}
        sellers={sellers} isAdmin={isAdmin}
        onEditTargets={() => setTargetsOpen(true)}
        generatedAt={data?.generated_at}
      />

      {error && (
        <div className="bg-red-bg border border-red/30 text-red text-[12px] rounded-lg p-3 flex items-center justify-between">
          <span>Error: {error}</span>
          <button onClick={reload} className="bg-white border border-red/30 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer">Reintentar</button>
        </div>
      )}

      {loading && !data ? (
        <div className="text-text3 text-center py-12 text-[12px]">Cargando dashboard…</div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3.5 max-md:gap-2.5">
            <KpiCard
              icon={Users} tone="blue"
              label={range === 'max' ? 'Contactos · histórico' : 'Contactos del mes'}
              value={fmtInt(kpis.contacts)}
              delta={range === 'month' ? pctChange(kpis.contacts, kpis.contacts_prev) : null}
              deltaSuffix="%"
              sub={range === 'max' ? 'todos los registros' : 'vs. mes anterior'}
              spark={sparks.contacts}
            />
            <KpiCard
              icon={Phone} tone="purple"
              label="Llamadas"
              value={fmtInt(kpis.calls)}
              sub={range === 'max' ? 'todas las llamadas' : 'mes en curso'}
            />
            <KpiCard
              icon={DollarSign} tone="green"
              label={range === 'max' ? 'Cerrado · histórico' : 'Cerrado MTD'}
              value={fmtMoney(kpis.revenue)}
              delta={range === 'month' ? pctChange(kpis.revenue, kpis.revenue_prev) : null}
              deltaSuffix="%"
              sub={objetivoPct != null ? `${objetivoPct}% del objetivo` : `${kpis.won} cierre${kpis.won === 1 ? '' : 's'}`}
            />
            <KpiCard
              icon={Sparkles} tone="orange"
              label="Tasa de cierre"
              value={(convRate * 100).toFixed(1) + '%'}
              delta={range === 'month' && convRatePrev > 0 ? Math.round((convRate - convRatePrev) * 100 * 10) / 10 : null}
              deltaSuffix="pp"
              sub="propuestas → ganados"
            />
          </div>

          {/* Funnel + Heat — lado a lado desde sm (640px) para evitar scroll */}
          <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] gap-3.5 max-sm:gap-3">
            <FunnelChart funnel={funnel} />
            <HeatChart heat={heat} />
          </div>

          {/* Vendedores */}
          <VendorsTable rows={vendorRows} vendor={vendor} onVendorClick={setVendor} range={range} />

          <div className="text-[10.5px] text-text3 text-center pt-2">
            Korex · Panel de Ventas
          </div>
        </>
      )}

      <TargetsModal
        open={targetsOpen}
        onClose={() => setTargetsOpen(false)}
        sellers={salesTeam}
        onSaved={reload}
      />
    </div>
  );
}

function useIsAdmin() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !alive) return;
        const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
        if (alive) setAdmin((data || []).some((r) => r.role === 'admin'));
      } catch {}
    })();
    return () => { alive = false; };
  }, []);
  return admin;
}
