export default function ResourcesPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold mb-2">Recursos</h1>
      <p className="text-sm text-text3 mb-6">
        Biblioteca de materiales de venta: guiones, presentaciones, testimonios, documentos.
      </p>
      <div className="rounded-lg border border-border bg-white p-6">
        <div className="text-sm text-text2">
          Módulo en construcción. En Fase 4 vamos a reutilizar el componente de recursos
          que hoy vive en la ficha de Cliente de Operaciones, extrayéndolo a
          <code> packages/ui/Resources </code>
          para que lo consuman ambos módulos sin duplicación de código.
        </div>
      </div>
    </div>
  );
}
