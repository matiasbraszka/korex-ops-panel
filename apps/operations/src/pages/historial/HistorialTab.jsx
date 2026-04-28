import { useEffect, useState, useMemo } from 'react';
import { Timeline, FabAdd } from './Timeline.jsx';
import { NuevoEventoPanel } from './NuevoEventoPanel.jsx';
import { ResumenEditorModal } from './ResumenEditorModal.jsx';
import { loadEventos, saveEvento, seedDemoIfEmpty } from './storage.js';
import { KOREX_FASES } from './tokens.js';

// Mapea la fase legacy del cliente (string como 'pre-onboarding', 'onboarding',
// 'primera-entrega', 'lanzamiento', 'auditoria') a la fase numérica 1-11 del Método Korex.
function mapFaseLegacyToNum(faseLegacy) {
  const map = {
    'pre-onboarding': 1,
    'onboarding': 2,
    'primera-entrega': 5,
    'lanzamiento': 8,
    'auditoria': 10,
    'escalado': 11,
  };
  if (typeof faseLegacy === 'number') return Math.max(1, Math.min(11, faseLegacy));
  return map[faseLegacy] || 1;
}

function diasDesdeFecha(iso) {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 0;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function HistorialTab({ cliente }) {
  const [eventos, setEventos] = useState([]);
  const [showPanel, setShowPanel] = useState(false);
  const [showResumen, setShowResumen] = useState(false);

  useEffect(() => {
    if (!cliente?.id) return;
    setEventos(seedDemoIfEmpty(cliente.id, cliente.name));
  }, [cliente?.id, cliente?.name]);

  const faseActual = useMemo(
    () => mapFaseLegacyToNum(cliente?.faseNum || cliente?.phase || cliente?.fase),
    [cliente]
  );
  const diasProyecto = useMemo(
    () => diasDesdeFecha(cliente?.startDate),
    [cliente?.startDate]
  );

  const handleSaveEvento = (evento) => {
    saveEvento(cliente.id, evento);
    setEventos(loadEventos(cliente.id));
  };

  return (
    <>
      <Timeline
        eventos={eventos}
        faseActual={faseActual}
        diasProyecto={diasProyecto}
        onGenerarResumen={() => setShowResumen(true)}
        onNuevoEvento={() => setShowPanel(true)}
      />
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
    </>
  );
}
