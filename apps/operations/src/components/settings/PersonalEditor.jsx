import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@korex/db';
import { useAuth } from '@korex/auth';
import { CalendarDays, FileText, Wallet } from 'lucide-react';
import FichaPersonal from './personal/FichaPersonal';
import { fmtMoney, fmtPeriod, antiguedadLabel, contractStatus, TONE_CLS } from './personal/utils';

// Pestaña Personal: ficha HR de cada miembro del equipo (datos, salarios,
// pagos con factura y contratos). Solo admins — además del guard de UI, las
// tablas staff_* y el bucket staff-docs tienen RLS admin-only.
export default function PersonalEditor() {
  const { isAdmin } = useAuth();

  const [members, setMembers] = useState([]);
  const [hrById, setHrById] = useState({});
  const [paymentsById, setPaymentsById] = useState({});
  const [contractsById, setContractsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    const [m, hr, pay, con] = await Promise.all([
      supabase.from('team_members').select('*').order('position'),
      supabase.from('staff_hr').select('*'),
      supabase.from('staff_payments').select('*').order('period', { ascending: false }),
      supabase.from('staff_contracts').select('*').order('created_at', { ascending: false }),
    ]);
    setMembers(m.data || []);
    setHrById(Object.fromEntries((hr.data || []).map((x) => [x.member_id, x])));
    setPaymentsById(groupBy(pay.data || [], 'member_id'));
    setContractsById(groupBy(con.data || [], 'member_id'));
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (!isAdmin) return <div className="text-red text-center py-20">No tenés permiso.</div>;
  if (loading) return <div className="text-text3 text-center py-10">Cargando…</div>;

  const openMember = members.find((m) => m.id === openId);

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-[14px] font-bold text-text">Personal</h2>
        <p className="text-[11px] text-text3 mt-0.5">
          Ficha completa de cada miembro: fechas, salarios, historial de pagos con facturas y contratos.
          Solo visible para admins. El alta de gente sigue siendo en "Equipo y usuarios".
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {members.map((m) => (
          <MemberCard
            key={m.id}
            member={m}
            hr={hrById[m.id]}
            payments={paymentsById[m.id] || []}
            contracts={contractsById[m.id] || []}
            onOpen={() => setOpenId(m.id)}
          />
        ))}
      </div>

      {members.length === 0 && (
        <div className="text-text3 text-center py-10 text-[13px]">
          No hay miembros cargados. Agregalos primero en "Equipo y usuarios".
        </div>
      )}

      {openMember && (
        <FichaPersonal
          member={openMember}
          hr={hrById[openMember.id]}
          payments={paymentsById[openMember.id] || []}
          contracts={contractsById[openMember.id] || []}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function MemberCard({ member, hr, payments, contracts, onOpen }) {
  const lastPayment = payments[0]; // ya vienen ordenados por período desc
  const antiguedad = antiguedadLabel(hr?.start_date);
  // El peor estado entre los contratos: vencido > por vencer.
  const worst = contracts
    .map(contractStatus)
    .find((s) => s.tone === 'red') || contracts.map(contractStatus).find((s) => s.tone === 'amber');

  return (
    <button
      onClick={onOpen}
      className="text-left bg-white border border-border rounded-xl p-4 hover:border-blue hover:shadow-[0_2px_10px_rgba(91,124,245,0.12)] transition-all cursor-pointer"
    >
      <div className="flex items-center gap-3">
        {member.avatar_url ? (
          <img src={member.avatar_url} alt={member.name} className="w-11 h-11 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-white text-[12px] font-bold shrink-0"
               style={{ background: member.color || '#5B7CF5' }}>
            {member.initials || member.name?.[0] || '?'}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-text truncate">{member.name}</div>
          <div className="text-[11px] text-text3 truncate">{member.role || 'Sin rol'}</div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-[11px]">
        <div className="flex items-center gap-1.5 text-text2">
          <CalendarDays size={12} className="text-text3 shrink-0" />
          {antiguedad ? `En Korex hace ${antiguedad}` : 'Sin fecha de ingreso'}
        </div>
        <div className="flex items-center gap-1.5 text-text2">
          <Wallet size={12} className="text-text3 shrink-0" />
          {hr?.promised_salary != null
            ? `Prometido: ${fmtMoney(hr.promised_salary, hr.currency)}`
            : 'Sin salario cargado'}
        </div>
        <div className="flex items-center gap-1.5 text-text2">
          <FileText size={12} className="text-text3 shrink-0" />
          {lastPayment
            ? `Último pago: ${fmtPeriod(lastPayment.period)} · ${fmtMoney(lastPayment.amount, lastPayment.currency)}`
            : 'Sin pagos registrados'}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] py-0.5 px-2 rounded-full bg-surface2 text-text3">
          {payments.length} pago{payments.length === 1 ? '' : 's'}
        </span>
        <span className="text-[10px] py-0.5 px-2 rounded-full bg-surface2 text-text3">
          {contracts.length} contrato{contracts.length === 1 ? '' : 's'}
        </span>
        {worst && (
          <span className={`text-[10px] py-0.5 px-2 rounded-full font-semibold ${TONE_CLS[worst.tone]}`}>
            Contrato: {worst.label.toLowerCase()}
          </span>
        )}
      </div>
    </button>
  );
}

function groupBy(rows, key) {
  const out = {};
  for (const r of rows) {
    if (!out[r[key]]) out[r[key]] = [];
    out[r[key]].push(r);
  }
  return out;
}
