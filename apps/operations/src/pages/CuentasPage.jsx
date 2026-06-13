import { useState, Suspense, lazy } from 'react';
import { Landmark, Bitcoin, CreditCard } from 'lucide-react';

// Centro de cuentas: un solo apartado con selector para ver cada cuenta
// (Mercury / Kraken / Stripe) y controlar movimientos, fugas o fallos.
const MercuryView = lazy(() => import('./MercuryPage'));
const KrakenView = lazy(() => import('./KrakenPage'));

const TABS = [
  { id: 'mercury', label: 'Mercury', sub: 'Banco',  Icon: Landmark,   color: '#0F766E' },
  { id: 'kraken',  label: 'Kraken',  sub: 'Cripto', Icon: Bitcoin,    color: '#15803D' },
  { id: 'stripe',  label: 'Stripe',  sub: 'Pagos',  Icon: CreditCard, color: '#635BFF', soon: true },
];

export default function CuentasPage() {
  const [view, setView] = useState('mercury');

  return (
    <div className="max-w-[960px] mx-auto">
      {/* Selector de cuenta */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {TABS.map((t) => {
          const active = view === t.id;
          return (
            <button
              key={t.id}
              onClick={() => !t.soon && setView(t.id)}
              disabled={t.soon}
              className="flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left transition-all"
              style={{
                cursor: t.soon ? 'not-allowed' : 'pointer',
                borderColor: active ? t.color : 'var(--color-border)',
                background: active ? `${t.color}10` : '#fff',
                opacity: t.soon ? 0.55 : 1,
              }}
            >
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: active ? t.color : 'var(--color-surface2)', color: active ? '#fff' : t.color }}>
                <t.Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold" style={{ color: active ? t.color : 'var(--color-text)' }}>{t.label}</span>
                <span className="block text-[10.5px] text-text3">{t.soon ? 'Próximamente' : t.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Vista seleccionada */}
      <Suspense fallback={<div className="text-text3 text-center py-16 text-sm">Cargando…</div>}>
        {view === 'mercury' ? <MercuryView /> : view === 'kraken' ? <KrakenView /> : null}
      </Suspense>
    </div>
  );
}
