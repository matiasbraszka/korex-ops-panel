// Barra de nichos: filtra la galería y permite sumar uno nuevo.
//
// Los nichos salen del catálogo (marketing_niches), sembrado con los que ya usamos con los
// clientes. Agregar uno acá no toca nada de los clientes: es solo para ordenar el banco.
import { useState } from 'react';
import { supabase } from '@korex/db';
import { Plus, Loader2, Check, X } from 'lucide-react';
import { TABLA_NICHOS, slugify } from './inspiraciones';

export default function NicheChips({ niches, value, counts, total, canWrite, onChange, onCreated }) {
  const [abriendo, setAbriendo] = useState(false);
  const [nombre, setNombre] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const crear = async () => {
    const label = nombre.trim();
    const slug = slugify(label);
    if (!slug) { setError('Escribí un nombre.'); return; }
    if (niches.some((n) => n.slug === slug)) { setError('Ese nicho ya está en la lista.'); return; }
    setBusy(true); setError('');
    const { data, error: e } = await supabase.from(TABLA_NICHOS)
      .insert({ slug, label, tags: [label.toLowerCase()], sort: 300 })
      .select('*').single();
    setBusy(false);
    if (e) { setError(e.message); return; }
    setNombre(''); setAbriendo(false);
    onCreated(data);
    onChange(slug);
  };

  // Un nicho archivado se sigue mostrando si todavía tiene imágenes: si no, esas imágenes
  // quedarían sin ningún filtro que las alcance.
  const visibles = niches.filter((n) => n.active || (counts[n.slug] || 0) > 0);

  const chip = (activo, color) => ({
    background: activo ? `${color || '#5B7CF5'}1A` : '#fff',
    borderColor: activo ? (color || '#5B7CF5') : '#E2E5EB',
    color: activo ? (color || '#5B7CF5') : '#6B7280',
  });

  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      <button onClick={() => onChange(null)}
        className="py-1.5 px-3 rounded-lg text-[12.5px] font-semibold cursor-pointer border"
        style={chip(!value, '#5B7CF5')}>
        Todos {total > 0 && <span className="opacity-60">· {total}</span>}
      </button>

      {visibles.map((n) => {
        const c = counts[n.slug] || 0;
        return (
          <button key={n.slug} onClick={() => onChange(n.slug)}
            className="py-1.5 px-3 rounded-lg text-[12.5px] font-semibold cursor-pointer border"
            style={chip(value === n.slug, n.color)}
            title={n.active ? undefined : 'Nicho archivado (todavía tiene imágenes)'}>
            {n.label} {c > 0 && <span className="opacity-60">· {c}</span>}
          </button>
        );
      })}

      {canWrite && (abriendo ? (
        <span className="inline-flex items-center gap-1">
          <input autoFocus value={nombre} onChange={(e) => { setNombre(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') crear(); if (e.key === 'Escape') { setAbriendo(false); setNombre(''); setError(''); } }}
            placeholder="Nombre del nicho"
            className="py-1.5 px-2.5 text-[12.5px] border border-[#5B7CF5] rounded-lg outline-none w-[160px]" />
          <button onClick={crear} disabled={busy}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border-none cursor-pointer text-white disabled:opacity-50"
            style={{ background: '#5B7CF5' }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
          <button onClick={() => { setAbriendo(false); setNombre(''); setError(''); }}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[#E2E5EB] bg-white cursor-pointer text-[#6B7280]">
            <X size={14} />
          </button>
          {error && <span className="text-[11.5px] text-[#DC2626] font-semibold">{error}</span>}
        </span>
      ) : (
        <button onClick={() => setAbriendo(true)}
          className="inline-flex items-center gap-1 py-1.5 px-3 rounded-lg text-[12.5px] font-semibold cursor-pointer border border-dashed border-[#C3C9D4] bg-white text-[#6B7280] hover:border-[#5B7CF5] hover:text-[#5B7CF5]">
          <Plus size={13} /> Nuevo nicho
        </button>
      ))}
    </div>
  );
}
