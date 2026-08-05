import { useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';

// Botón "copiar este horario a otros días" para el editor semanal de franjas.
// Lo usan las dos pantallas que tienen la misma grilla de lunes a domingo:
// la disponibilidad por persona (DisponibilidadTab) y los horarios propios de
// un calendario (CalendariosTab).
//
// Cargar el mismo 10:00–18:00 siete veces era el paso más tedioso de la pantalla.
// Se elige el destino y se aplica al toque: no hay "Aplicar" ni confirmación,
// porque nada se guarda hasta que se toca Guardar en la pantalla de arriba.

const LABORALES = [0, 1, 2, 3, 4]; // lunes a viernes

export default function CopiarHorario({ dayIndex, dayNames, onCopy, disabled }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Cerrar al hacer clic afuera o con Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (disabled) return null;

  const otros = dayNames.map((n, i) => ({ n, i })).filter(({ i }) => i !== dayIndex);
  const laborales = LABORALES.filter((i) => i !== dayIndex);

  const aplicar = (indices) => { onCopy(indices); setOpen(false); };

  const Opcion = ({ children, onClick }) => (
    <button onClick={onClick}
            className="w-full text-left px-3 py-[7px] bg-transparent border-0 cursor-pointer text-[12px] text-text2 hover:bg-[#FFFBF2] hover:text-[#B45309] transition-colors duration-100">
      {children}
    </button>
  );

  return (
    <span ref={wrapRef} className="relative inline-flex shrink-0">
      <button onClick={() => setOpen((v) => !v)}
              title={`Copiar el horario del ${dayNames[dayIndex].toLowerCase()} a otros días`}
              aria-label={`Copiar el horario del ${dayNames[dayIndex].toLowerCase()} a otros días`}
              className={`bg-transparent border-0 cursor-pointer p-1 flex items-center transition-colors duration-150 ${
                open ? 'text-[#B45309]' : 'text-text3 hover:text-[#B45309]'}`}>
        <Copy size={13} />
      </button>
      {open && (
        // Los dos últimos días abren hacia arriba: si no, la lista cae fuera del panel.
        <div className={`absolute z-50 right-0 w-[186px] rounded-xl border border-border bg-white py-1.5 overflow-hidden ${
               dayIndex >= dayNames.length - 2 ? 'bottom-[26px]' : 'top-[26px]'}`}
             style={{ boxShadow: '0 10px 30px rgba(10,22,40,.16)' }}>
          <span className="block px-3 pb-1.5 text-[10px] font-bold tracking-[0.08em] text-text3 uppercase">
            Copiar a
          </span>
          {laborales.length > 0 && (
            <Opcion onClick={() => aplicar(laborales)}>Lunes a viernes</Opcion>
          )}
          <Opcion onClick={() => aplicar(otros.map(({ i }) => i))}>Todos los demás días</Opcion>
          <span className="block h-px bg-surface2 my-1" />
          {otros.map(({ n, i }) => (
            <Opcion key={i} onClick={() => aplicar([i])}>{n}</Opcion>
          ))}
        </div>
      )}
    </span>
  );
}
