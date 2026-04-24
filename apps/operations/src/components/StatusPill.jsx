const pillClasses = {
  'pill-green': 'bg-green-bg text-[#16A34A]',
  'pill-yellow': 'bg-yellow-bg text-[#CA8A04]',
  'pill-red': 'bg-red-bg text-red',
  'pill-blue': 'bg-blue-bg text-blue',
  'pill-gray': 'bg-surface2 text-text3',
  'pill-orange': 'bg-orange-bg text-orange',
};

export default function StatusPill({ text, pillClass, style, className = '' }) {
  const cls = pillClasses[pillClass] || 'bg-surface2 text-text3';
  return (
    <span
      className={`inline-flex items-center gap-1 py-[3px] px-2.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${cls} ${className}`}
      style={style}
    >
      {text}
    </span>
  );
}