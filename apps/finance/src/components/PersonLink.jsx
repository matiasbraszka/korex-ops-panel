// Nombre clickeable: si está resuelto en el Directorio (id), abre el perfil 360°;
// si no se pudo resolver, queda como texto plano. Hereda el estilo de la celda.
export default function PersonLink({ name, id, onOpen, className = '' }) {
  if (!name) return <span className="text-text3">—</span>;
  if (!id || !onOpen) return <span className={className}>{name}</span>;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onOpen(id); }}
      className={`text-left bg-transparent border-0 p-0 cursor-pointer text-inherit hover:text-blue hover:underline ${className}`}
    >
      {name}
    </button>
  );
}
