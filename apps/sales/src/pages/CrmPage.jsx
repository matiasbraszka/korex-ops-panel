export default function CrmPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold mb-2">CRM</h1>
      <p className="text-sm text-text3 mb-6">
        Gestión de contactos y potenciales clientes con Kanban editable.
      </p>
      <div className="rounded-lg border border-border bg-white p-6">
        <div className="text-sm text-text2">
          Módulo en construcción. En Fase 2 vamos a agregar:
        </div>
        <ul className="list-disc ml-5 mt-3 space-y-1 text-sm text-text2">
          <li>Tabla <code>sales.leads</code> (potenciales clientes) con ownership por vendedor.</li>
          <li>Pipelines y columnas del Kanban editables por usuario.</li>
          <li>Notas, seguimiento e historial de llamadas por lead.</li>
          <li>Matching automático: cuando entre una llamada de ventas por teléfono/email, se asocia al lead existente o se crea uno nuevo.</li>
        </ul>
      </div>
    </div>
  );
}
