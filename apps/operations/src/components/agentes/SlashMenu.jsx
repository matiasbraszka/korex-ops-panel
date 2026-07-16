// Menú de comandos del chat: se abre al escribir "/" al principio del mensaje, igual que en
// Claude Code. Elegís el paso en vez de describirlo, y el backend lo toma sin adivinar.
//
// Por qué existe: el ruteo por texto es una heurística sobre la frase, y "en base a la
// investigación y al onboarding, ¿qué estrategia hacemos?" nombra tres pasos y pide uno. Con el
// comando no hay ambigüedad posible. La prosa sigue funcionando: esto es un atajo, no un modo.
//
// Los comandos NO están hardcodeados acá: salen del corpus (las fichas de cada paso). Agregar un
// paso al corpus lo hace aparecer en este menú sin tocar código.
import { Lock, CornerDownLeft } from 'lucide-react';

export default function SlashMenu({ items, active, onPick, onHover, accent }) {
  if (!items.length) return null;
  return (
    <div
      className="absolute bottom-[calc(100%+8px)] left-0 z-50 bg-white border border-border rounded-2xl overflow-hidden max-md:right-0 max-md:w-auto"
      style={{ width: 460, maxWidth: '90vw', boxShadow: '0 12px 32px rgba(10,22,40,.10), 0 4px 12px rgba(10,22,40,.06)', animation: 'agentPop .16s cubic-bezier(.4,0,.2,1)' }}
      role="listbox"
    >
      <div className="px-3.5 pt-2.5 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-text3">
        Pasos del descubrimiento
      </div>
      <div className="max-h-[300px] overflow-y-auto pb-1.5">
        {items.map((it, i) => {
          const on = i === active;
          // "fuera" = el paso existe pero no se produce en el chat (necesita buscar en la web o
          // leer el Ad Library). Se muestra igual, con candado: sirve para que el agente te arme
          // el pedido y te diga qué falta. Ocultarlo haría creer que el paso no existe.
          const off = it.ejecuta === 'fuera';
          return (
            <button
              key={it.slug}
              onClick={() => onPick(it)}
              onMouseEnter={() => onHover(i)}
              role="option"
              aria-selected={on}
              className="w-full flex items-center gap-3 text-left py-2 px-3.5 border-none cursor-pointer bg-transparent"
              style={on ? { background: accent.bg2 } : undefined}
            >
              <span
                className="shrink-0 inline-flex items-center justify-center w-[22px] h-[22px] rounded-md text-[11px] font-bold"
                style={{ background: on ? accent.bg : 'var(--color-surface2)', color: on ? accent.c : 'var(--color-text3)' }}
              >
                {it.ord}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <code className="text-[12.5px] font-semibold" style={{ color: on ? accent.c : 'var(--color-text)' }}>
                    /{it.slug}
                  </code>
                  {off && <Lock size={11} className="text-text3 shrink-0" />}
                </span>
                <span className="block text-[11.5px] text-text2 truncate">
                  {it.menu}{off && ' · no se hace desde el chat'}
                </span>
              </span>
              {on && <CornerDownLeft size={13} className="text-text3 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
