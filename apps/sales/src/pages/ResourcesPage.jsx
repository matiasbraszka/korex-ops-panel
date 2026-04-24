import { ResourcesPanel } from '@korex/ui';
import { useSalesResources } from '../hooks/useSalesResources.js';

// Recursos de Ventas: biblioteca compartida de links (guiones, presentaciones,
// testimonios, etc.) que cualquier vendedor puede consultar y editar.
const ALLOWED_CATEGORIES = [
  'guion', 'presentacion', 'testimonio', 'video', 'doc', 'pdf', 'landing', 'folder', 'other',
];

export default function ResourcesPage() {
  const { items, loading, add, update, remove } = useSalesResources();

  if (loading) return <div className="text-text3 text-center py-20">Cargando recursos…</div>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold mb-1">Recursos</h1>
      <p className="text-xs text-text3 mb-5">
        Biblioteca compartida del equipo de Ventas. Guiones, presentaciones, testimonios, documentos.
      </p>
      <ResourcesPanel
        title="Biblioteca de Ventas"
        icon="📚"
        links={items}
        onAdd={add}
        onUpdate={update}
        onDelete={remove}
        allowedCategories={ALLOWED_CATEGORIES}
        emptyText="Sin recursos cargados"
        emptyHint="Agregá guiones, presentaciones, testimonios y links útiles para la gestión de potenciales clientes."
      />
    </div>
  );
}
