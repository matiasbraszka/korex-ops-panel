/**
 * Barra flotante de "Guardar cambios / Cancelar" que aparece en la parte
 * inferior del editor solo cuando hay cambios sin guardar.
 */
export default function SaveBar({ dirty, onSave, onCancel, saveLabel = 'Guardar cambios' }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-3 mt-4 -mx-2">
      <div className="bg-white border border-blue-300 shadow-lg rounded-lg py-2.5 px-3 flex items-center gap-3 mx-2">
        <span className="text-[11px] text-blue-600 font-semibold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          Tenés cambios sin guardar
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            className="py-1.5 px-3 text-[12px] text-gray-600 hover:text-gray-800 bg-transparent border border-gray-200 hover:border-gray-300 rounded-md cursor-pointer font-sans"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="py-1.5 px-3 text-[12px] font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none rounded-md cursor-pointer font-sans"
            onClick={onSave}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
