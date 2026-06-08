import { useEffect, useState, useMemo, useCallback } from 'react';
import { Timeline } from './Timeline.jsx';
import { NuevoEventoPanel } from './NuevoEventoPanel.jsx';
import { ResumenEditorModal } from './ResumenEditorModal.jsx';
import { listEventos, createEvento, createEventosBulk, deleteEvento, dismissEvento, updateEvento } from './api.js';
import { useHistorialConfig, getClienteFaseId } from './useHistorialConfig.js';
import { buildImportEvents, normText } from './historialImport.js';
import { useApp } from '../../context/AppContext';
import Modal from '../../components/Modal';
import { T } from './tokens.js';

function diasDesdeFecha(iso) {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// Convierte una llamada del cliente en un "evento sintetico" para el timeline.
// Se marca con __synthetic = true para que el card sepa que no se puede editar/borrar
// (se manejan desde el tab Llamadas) y para esconderlo del resumen de tiempo Korex.
function llamadaToEvento(l) {
  const isoFecha = l.fecha ? new Date(l.fecha) : null;
  const fechaStr = isoFecha && !isNaN(isoFecha.getTime())
    ? isoFecha.toISOString().slice(0, 10)
    : '';
  const horaStr = isoFecha && !isNaN(isoFecha.getTime())
    ? isoFecha.toISOString().slice(11, 16)
    : '';
  return {
    id: 'call_' + l.id,
    __synthetic: true,
    __llamada: l,
    tipo: 'llamada',
    titulo: l.titulo || 'Llamada',
    descripcion: l.resumen || '',
    fecha: fechaStr,
    hora: horaStr,
    tiempo: l.duracion_min || 0,
    responsable: '',
    fase: null,
    autor: '',
    links: l.recording_url ? [{ url: l.recording_url, title: 'Grabación' }] : [],
  };
}

export function HistorialTab({ cliente }) {
  const { fases, tipos } = useHistorialConfig(cliente);
  const { currentUser, llamadas, teamReports, teamMembers } = useApp();
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPanel, setShowPanel] = useState(false);
  const [editingEvento, setEditingEvento] = useState(null);
  const [showResumen, setShowResumen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const refresh = useCallback(async () => {
    if (!cliente?.id) return;
    setLoading(true);
    const list = await listEventos(cliente.id);
    // Auto-importar avances/entregables nuevos de los informes diarios,
    // SIN duplicar: ni por bullet ya importado, ni por texto ya presente
    // (otro evento del historial con el mismo título) ni entre candidatos.
    const tipoKeys = (tipos || []).map(t => t.key);
    const existingBulletIds = new Set(list.filter(e => e.source_bullet_id).map(e => e.source_bullet_id));
    const existingTexts = new Set(list.filter(e => e.dismissed !== true).map(e => normText(e.titulo)));
    const byText = new Map();
    buildImportEvents(teamReports, cliente.id, teamMembers, tipoKeys)
      .filter(ev => !existingBulletIds.has(ev.source_bullet_id))
      .forEach(ev => {
        const k = normText(ev.titulo);
        if (!k || existingTexts.has(k)) return;
        const prev = byText.get(k);
        if (!prev || (ev.tiempo || 0) > (prev.tiempo || 0)) byText.set(k, ev);
      });
    const candidates = [...byText.values()];
    let all = list;
    if (candidates.length) {
      const creados = await createEventosBulk(cliente.id, candidates);
      all = creados.length ? [...creados, ...list] : await listEventos(cliente.id);
    }
    setEventos(all);
    setLoading(false);
  }, [cliente?.id, teamReports, teamMembers, tipos]);

  useEffect(() => { refresh(); }, [refresh]);

  const faseActualId = useMemo(
    () => getClienteFaseId(cliente, fases),
    [cliente, fases]
  );
  const diasProyecto = useMemo(
    () => diasDesdeFecha(cliente?.startDate),
    [cliente?.startDate]
  );

  // Mezclamos los eventos manuales con las llamadas del cliente (categoria='cliente')
  // y ordenamos por fecha desc. Las llamadas se renderizan como cards colapsables.
  const eventosConLlamadas = useMemo(() => {
    const calls = (llamadas || [])
      .filter(l => l.cliente_id === cliente?.id && l.categoria === 'cliente')
      .map(llamadaToEvento);
    const visibles = eventos.filter(e => e.dismissed !== true);
    return [...visibles, ...calls].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [eventos, llamadas, cliente?.id]);

  const openNuevo = () => { setEditingEvento(null); setShowPanel(true); };
  const openEdit = (evento) => { setEditingEvento(evento); setShowPanel(true); };
  const closePanel = () => { setShowPanel(false); setEditingEvento(null); };

  const handleSaveEvento = async (evento) => {
    if (evento.id) {
      // Edit: actualizar optimistic + persistir
      setEventos(prev => prev.map(e => e.id === evento.id ? { ...e, ...evento } : e));
      const updated = await updateEvento(evento.id, evento, cliente.id);
      if (updated) {
        setEventos(prev => prev.map(e => e.id === updated.id ? updated : e));
      } else {
        refresh(); // fallback si falla
      }
    } else {
      // Create
      const nuevo = await createEvento(cliente.id, evento);
      if (nuevo) setEventos(prev => [nuevo, ...prev]);
      else refresh();
    }
  };

  const handleDeleteEvento = (evento) => setConfirmDelete(evento);

  const confirmarEliminar = async () => {
    if (!confirmDelete?.id) { setConfirmDelete(null); return; }
    const ev = confirmDelete;
    setConfirmDelete(null);
    if (ev.source_bullet_id) {
      // Auto-importado: soft-delete (marcar dismissed) para que no reaparezca.
      setEventos(prev => prev.map(e => e.id === ev.id ? { ...e, dismissed: true } : e));
      await dismissEvento(ev.id);
    } else {
      // Manual: borrado real.
      setEventos(prev => prev.filter(e => e.id !== ev.id));
      await deleteEvento(ev.id);
    }
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
          cliente={cliente}
          eventos={eventosConLlamadas}
          faseActual={faseActualId}
          diasProyecto={diasProyecto}
          onGenerarResumen={() => setShowResumen(true)}
          onNuevoEvento={openNuevo}
          onDeleteEvento={handleDeleteEvento}
          onEditEvento={openEdit}
          onUpdateTiempo={async (id, mins) => {
            setEventos(prev => prev.map(e => e.id === id ? { ...e, tiempo: mins } : e));
            await updateEvento(id, { tiempo: mins }, cliente.id);
          }}
        />
      )}
      <NuevoEventoPanel
        open={showPanel}
        onClose={closePanel}
        onSave={handleSaveEvento}
        cliente={cliente}
        clienteNombre={cliente?.name}
        faseActualClienteId={faseActualId}
        currentUser={currentUser}
        eventoExistente={editingEvento}
      />
      <ResumenEditorModal
        open={showResumen}
        onClose={() => setShowResumen(false)}
        eventos={eventos.filter(e => e.dismissed !== true)}
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
