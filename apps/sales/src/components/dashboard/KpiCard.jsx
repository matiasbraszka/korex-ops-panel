import { ArrowUp, ArrowDown } from 'lucide-react';
import Sparkline from './Sparkline.jsx';

const TONES = {
  blue:   { bg: 'var(--color-blue-bg)',   fg: 'var(--color-blue)' },
  green:  { bg: 'var(--color-green-bg)',  fg: '#16A34A' },
  orange: { bg: 'var(--color-orange-bg)', fg: '#F97316' },
  purple: { bg: 'var(--color-purple-bg)', fg: '#8B5CF6' },
};

function Delta({ value, suffix = '' }) {
  if (value == null || value === 0) return <span className="text-[10.5px] text-text3">—</span>;
  const positive = value > 0;
  const cls = positive ? 'text-green-600' : 'text-red';
  const Icon = positive ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10.5px] font-bold ${cls}`}>
      <Icon size={10} strokeWidth={2.5} />
      {Math.abs(value).toFixed(suffix === 'pp' ? 1 : 0)}{suffix}
    </span>
  );
}

export default function KpiCard({ icon: Icon, tone = 'blue', label, value, delta, deltaSuffix = '%', sub, spark }) {
  const c = TONES[tone] || TONES.blue;
  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <div className="flex items-center justify-between">
        <span className="w-[30px] h-[30px] rounded-lg inline-flex items-center justify-center"
              style={{ background: c.bg, color: c.fg }}>
          {Icon && <Icon size={15} />}
        </span>
        <Delta value={delta} suffix={deltaSuffix} />
      </div>
      <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3 mt-3.5">{label}</div>
      <div className="text-[24px] font-bold tabular-nums mt-0.5 leading-tight tracking-tight">
        {value}
      </div>
      <div className="flex items-end justify-between mt-2 gap-2">
        <div className="text-[10.5px] text-text3 truncate">{sub}</div>
        {spark && spark.length > 1 && <Sparkline values={spark} color={c.fg} width={70} height={22} />}
      </div>
    </div>
  );
}
