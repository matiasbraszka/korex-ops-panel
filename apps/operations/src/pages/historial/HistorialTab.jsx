import { useEffect, useState, useMemo, useCallback } from 'react';
import { Timeline, FabAdd } from './Timeline.jsx';
import { NuevoEventoPanel } from './NuevoEventoPanel.jsx';
import { ResumenEditorModal } from './ResumenEditorModal.jsx';
import { listEventos, createEvento, deleteEvento } from './api.js';
import { useHistorialConfig, mapFaseLegacyToNum } from './useHistorialConfig.js';
import Modal from '../../components/Modal';
import { T } from './tokens.js';

function diasDesdeFecha(iso) {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function HistorialTab({ cliente }) {
  const { total } = useHistorialConfig();
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const [showResumen, setShowResumen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // evento a eliminar

  const refresh = useCallback(async () => {
    if (!cliente?.id) return;
    setLoading(true);
    const list = await listEventos(cliente.id);
    setEventos(list);
    setLoading(false);
  }, [cliente?.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const faseActual = useMemo(
    () => mapFaseLegacyToNum(cliente?.faseNum || cliente?.phase || cliente?.fase, total),
    [cliente, total]
  );
  const diasProyecto = useMemo(
    () => diasDesdeFecha(cliente?.startDate),
    [cliente?.startDate]
  );

  const handleSaveEvento = async (evento) => {
    const nuevo = await createEvento(cliente.id, evento);
    if (nuevo) {
      // Optimistic: agrego el nuevo al frente y refresco después
      setEventos(prev => [nuevo, ...prev]);
    } else {
      // Fallback: refrescar de DB
      refresh();
    }
  };

  const handleDeleteEvento = (evento) => {
    setConfirmDelete(evento);
  };

  const confirmarEliminar = async () => {
    if (!confirmDelete?.id) { setConfirmDelete(null); return; }
    const id = confirmDelete.id;
    setConfirmDelete(null);
    setEventos(prev => prev.filter(e => e.id !== id));
    await deleteEvento(id);
  };

  return (
    <>
      {loading && eventos.length === 0 ? (
        <div style={{
          background: '#fff', border: `1px dashed ${T.border}`,
          borderRadius: 10, padding: 28, textAlign: 'center',
          color: T.text3, fontSize: 13, marginBottom: 16,
        }}>Cargando historial…</div>
      ) : (
        <Timeline
          eventos={eventos}
          faseActual={faseActual}
          diasProyecto={diasProyecto}
          onGenerarResumen={() => setShowResumen(true)}
          onNuevoEvento={() => setShowPanel(true)}
          onDeleteEvento={handleDeleteEvento}
        />
      )}
      <FabAdd onClick={() => setShowPanel(true)} />
      <NuevoEventoPanel
        open={showPanel}
        onClose={() => setShowPanel(false)}
        onSave={handleSaveEvento}
        clienteNombre={cliente?.name}
        faseActualCliente={faseActual}
      />
      <ResumenEditorModal
        open={showResumen}
        onClose={() => setShowResumen(false)}
        eventos={eventos}
        cliente={cliente}
      />
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Eliminar evento"
        footer={<>
          <button
            className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2"
            onClick={() => setConfirmDelete(null)}
          >Cancelar</button>
          <button
            className="py-2 px-4 rounded-md border-none bg-red-500 text-white text-[13px] cursor-pointer font-sans hover:bg-red-600"
            onClick={confirmarEliminar}
          >Eliminar</button>
        </>}
      >
        <div className="text-[13px] text-text2">
          ¿Seguro que querés eliminar este evento del historial?
          {confirmDelete && (
            <div className="mt-3 p-3 rounded-md bg-surface2 text-text font-medium text-sm">
              {confirmDelete.titulo}
              <div className="text-[11px] text-text3 mt-1 font-normal">{confirmDelete.fecha}{confirmDelete.hora ? ' · ' + confirmDelete.hora : ''}</div>
            </div>
          )}
          <div className="text-[11px] text-text3 mt-3">Esta acción no se puede deshacer.</div>
        </div>
      </Modal>
    </>
  );
}
