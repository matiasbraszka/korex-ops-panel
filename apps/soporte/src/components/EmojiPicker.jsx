import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// Selector de emojis para la caja de escribir.
//
// Propio y sin dependencia nueva: las librerías de emojis traen el set Unicode
// entero (miles, con imágenes) y pesan más que toda la bandeja. Acá está lo que
// el equipo usa de verdad escribiéndole a un cliente, agrupado y buscable. Si
// falta alguno, se agrega a la lista de abajo y listo.
//
// Se apoya en que WhatsApp y el navegador ya saben dibujar emojis: son caracteres
// de texto, no imágenes.

const GRUPOS = [
  {
    nombre: 'Frecuentes',
    lista: ['👍', '🙏', '🙌', '👏', '💪', '🔥', '✅', '❤️', '😊', '😃', '😅', '🤝', '👌', '✨', '🎉', '💯'],
  },
  {
    nombre: 'Caras',
    lista: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '😘', '😋',
            '😎', '🤩', '🥳', '🙃', '🤗', '🤔', '🤨', '😐', '😑', '😴', '😌', '😔', '😕', '🙁', '😢', '😭',
            '😤', '😠', '😳', '🥺', '😬', '😮', '😱', '🤯', '🤭', '😏', '😒', '🙄', '😷', '🤒', '🥲', '🫠'],
  },
  {
    nombre: 'Gestos',
    lista: ['👍', '👎', '👌', '🤌', '✌️', '🤞', '🫰', '🤙', '👋', '🙋', '🙌', '👏', '🙏', '💪', '🤝', '☝️',
            '👇', '👉', '👈', '✍️', '🫡', '🤷', '🤦', '💅'],
  },
  {
    nombre: 'Trabajo',
    lista: ['✅', '❌', '⚠️', '❗', '❓', '📌', '📎', '📝', '📄', '📊', '📈', '📉', '🗓️', '⏰', '⏳', '🔔',
            '💡', '🔍', '🔗', '📢', '📣', '💬', '📞', '📱', '💻', '🖥️', '⌨️', '🖱️', '📤', '📥', '🗂️', '🔒'],
  },
  {
    nombre: 'Marketing',
    lista: ['🚀', '🔥', '💰', '💵', '💸', '🏆', '🥇', '🎯', '📺', '🎬', '🎥', '📸', '🎙️', '🎧', '⭐', '🌟',
            '✨', '💎', '🧲', '📦', '🛒', '🤑', '📍', '🧠'],
  },
  {
    nombre: 'Varios',
    lista: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '☕', '🍾', '🥂', '🎉', '🎊', '🎁', '🌱',
            '☀️', '🌙', '⚡', '💧', '🌎', '🏠', '🚗', '✈️'],
  },
];

// Búsqueda simple: se le pone un par de palabras a cada emoji que cuesta encontrar.
const NOMBRES = {
  '👍': 'ok pulgar bien dale', '🙏': 'gracias porfa favor', '🔥': 'fuego genial',
  '✅': 'listo hecho tilde', '❌': 'no error mal', '⚠️': 'ojo cuidado atencion',
  '🚀': 'lanzamiento crecer', '💰': 'plata dinero', '🎯': 'objetivo meta',
  '📌': 'importante fijar', '⏰': 'hora tiempo', '🎬': 'video grabar',
  '📸': 'foto camara', '💬': 'mensaje chat', '❤️': 'corazon amor',
  '😂': 'risa jaja', '🤝': 'trato acuerdo', '💪': 'fuerza vamos',
  '🎉': 'festejo felicitaciones', '🧠': 'cerebro idea',
};

export default function EmojiPicker({ onPick, onClose }) {
  const [q, setQ] = useState('');
  const ref = useRef(null);

  // Cerrar al hacer clic afuera o con Esc: el picker no debe quedar tapando la caja.
  useEffect(() => {
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    const tecla = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', tecla); };
  }, [onClose]);

  const t = q.trim().toLowerCase();
  const grupos = t
    ? [{ nombre: 'Resultados', lista: [...new Set(GRUPOS.flatMap(g => g.lista))].filter(e => (NOMBRES[e] || '').includes(t)) }]
    : GRUPOS;

  return (
    <div ref={ref}
      className="absolute bottom-full left-0 mb-2 w-[292px] rounded-xl border border-border bg-white shadow-[0_12px_32px_rgba(10,22,40,.16)] z-30 overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-border">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar (gracias, listo, fuego…)"
          className="flex-1 min-w-0 text-[12px] py-1 px-2 rounded-md border border-border outline-none focus:border-[#F59E0B]" />
        <button onClick={onClose} title="Cerrar" className="shrink-0 bg-transparent border-0 text-text3 hover:text-text cursor-pointer p-0.5">
          <X size={14} />
        </button>
      </div>
      <div className="max-h-[248px] overflow-y-auto p-2">
        {grupos.map(g => (
          g.lista.length > 0 && (
            <div key={g.nombre} className="mb-1.5">
              <div className="text-[9.5px] font-extrabold uppercase tracking-[0.08em] text-text3 px-1 pb-1">{g.nombre}</div>
              <div className="grid grid-cols-8 gap-0.5">
                {g.lista.map((e, i) => (
                  <button key={g.nombre + i} onClick={() => onPick(e)} title={NOMBRES[e] || e}
                    className="w-[32px] h-[32px] text-[19px] leading-none rounded-md border-0 bg-transparent cursor-pointer hover:bg-[#F4F5F7] flex items-center justify-center">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )
        ))}
        {t && grupos[0].lista.length === 0 && (
          <div className="text-[12px] text-text3 py-6 text-center">Ningún emoji con eso. Probá con otra palabra.</div>
        )}
      </div>
    </div>
  );
}
