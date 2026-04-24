export default function ViewToggle({ value, onChange }) {
  const views = [
    { id: 'roadmap',  label: 'Roadmap',  icon: '\u25A6' },
    { id: 'timeline', label: 'Timeline', icon: '\u25AE' },
    { id: 'lista',    label: 'Lista',    icon: '\u2630' },
    { id: 'mi-semana', label: 'To-Do List', icon: '\u25A3' },
  ];

  return (
    <div className="inline-flex items-center p-1 bg-gray-100 rounded-lg gap-0.5 max-md:w-full">
      {views.map(v => {
        const active = value === v.id;
        return (
          <button
            key={v.id}
            onClick={() => onChange(v.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold font-sans transition-all max-md:flex-1 max-md:justify-center ${
              active
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="text-[11px]">{v.icon}</span>
            {v.label}
          </button>
        );
      })}
    </div>
  );
}
