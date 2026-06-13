// Selector de hora en formato 24 h (sin AM/PM, sin que se corte el valor como
// pasaba con <input type="time"> en navegadores con locale de 12 h).
// Opciones cada 30 min; si el valor guardado está fuera de la grilla (ej.
// 09:15), se agrega para no perderlo.

const STEP_MIN = 30;
export const TIME_OPTIONS = Array.from({ length: (24 * 60) / STEP_MIN }, (_, i) => {
  const m = i * STEP_MIN;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});

export default function TimeSelect({ value, onChange, disabled, mobile }) {
  const opts = value && !TIME_OPTIONS.includes(value)
    ? [...TIME_OPTIONS, value].sort()
    : TIME_OPTIONS;
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}
            className={`border border-border rounded-lg bg-white outline-none cursor-pointer focus:border-[#F59E0B] transition-colors ${
              mobile ? 'h-[30px] px-1.5 text-[11.5px]' : 'h-8 px-2 text-[12px]'} font-semibold`}>
      {!value && <option value="" disabled>--:--</option>}
      {opts.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}
