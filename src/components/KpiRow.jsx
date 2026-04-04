export default function KpiRow({ items }) {
  return (
    <div className="grid grid-cols-4 gap-3.5 mb-6 max-md:grid-cols-2 max-md:gap-2">
      {items.map((item, i) => (
        <div key={i} className="bg-white border border-border rounded-[10px] py-[18px] px-5 max-md:py-3 max-md:px-3.5">
          <div className="text-[11px] text-text3 font-medium">{item.label}</div>
          <div className="text-[32px] font-extrabold my-1 tracking-tight max-md:text-2xl" style={{ color: item.color }}>
            {item.value}
          </div>
          {item.sub && <div className="text-[11px] text-text3">{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}