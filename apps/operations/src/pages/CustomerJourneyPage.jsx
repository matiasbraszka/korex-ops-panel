// CustomerJourneyPage — pizarra editable del paso a paso de entrega al cliente.
//
// Lienzo infinito tipo Miro (Administración → Customer Journey). Arranca con el
// camino v3 ya cargado; el equipo edita tarjetas, checklists, roles, personas y
// tiempos. Por ahora es 100% visual — se guarda en app_settings (compartido).

import { useMemo, useRef, useState } from 'react';
import { Plus, Tags, RotateCcw, GitBranch } from 'lucide-react';
import useJourneyBoard from '../components/journey/useJourneyBoard';
import JourneyCanvas from '../components/journey/JourneyCanvas';
import RolesCatalogEditor from '../components/journey/RolesCatalogEditor';
import { formatMinutes } from '../components/journey/journeyData';

export default function CustomerJourneyPage() {
  const jb = useJourneyBoard();
  const canvasRef = useRef(null);
  const [rolesOpen, setRolesOpen] = useState(false);

  // Acciones que consume el lienzo/tarjetas (subconjunto del hook).
  const actions = useMemo(() => ({
    moveNode: jb.moveNode,
    updateNode: jb.updateNode,
    deleteNode: jb.deleteNode,
    addItem: jb.addItem,
    updateItem: jb.updateItem,
    deleteItem: jb.deleteItem,
    toggleItem: jb.toggleItem,
    moveItem: jb.moveItem,
    addConnection: jb.addConnection,
    deleteConnection: jb.deleteConnection,
    updatePhase: jb.updatePhase,
    addBranch: jb.addBranch,
    updateBranch: jb.updateBranch,
    deleteBranch: jb.deleteBranch,
    addChainLine: jb.addChainLine,
    updateChainLine: jb.updateChainLine,
    deleteChainLine: jb.deleteChainLine,
  }), [jb.moveNode, jb.updateNode, jb.deleteNode, jb.addItem, jb.updateItem, jb.deleteItem, jb.toggleItem, jb.moveItem, jb.addConnection, jb.deleteConnection, jb.updatePhase, jb.addBranch, jb.updateBranch, jb.deleteBranch, jb.addChainLine, jb.updateChainLine, jb.deleteChainLine]);

  const addCard = () => {
    const c = canvasRef.current?.centerWorld?.() || { x: 200, y: 200 };
    jb.addNode({ x: Math.round(c.x - 165), y: Math.round(c.y - 60) });
  };

  const addDecision = () => {
    const c = canvasRef.current?.centerWorld?.() || { x: 200, y: 200 };
    jb.addDecision({ x: Math.round(c.x - 210), y: Math.round(c.y - 80) });
  };

  // Tiempo neto total del proceso (solo tarjetas de tareas, no casuísticas).
  const totals = useMemo(() => {
    let minutes = 0, missing = 0;
    for (const n of (jb.board?.nodes || [])) {
      if (n.nodeType === 'decision') continue;
      for (const it of (n.items || [])) {
        if (it.minutes == null || it.minutes === '') missing += 1;
        else minutes += Number(it.minutes) || 0;
      }
    }
    return { minutes, missing };
  }, [jb.board]);

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      {/* Barra de herramientas */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <button onClick={addCard} className="flex items-center gap-1.5 bg-purple text-white rounded-lg px-3 py-1.5 text-[12.5px] font-semibold cursor-pointer hover:opacity-90">
          <Plus size={15} /> Agregar tarjeta
        </button>
        <button onClick={addDecision} className="flex items-center gap-1.5 bg-surface border border-border text-text2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium cursor-pointer hover:border-purple hover:text-purple">
          <GitBranch size={15} /> Casuística
        </button>
        <button onClick={() => setRolesOpen(true)} className="flex items-center gap-1.5 bg-surface border border-border text-text2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium cursor-pointer hover:border-purple hover:text-purple">
          <Tags size={15} /> Roles
        </button>
        <button
          onClick={() => { if (confirm('¿Restablecer la pizarra al camino v3 original? Se pierden los cambios actuales.')) jb.resetBoard(); }}
          className="flex items-center gap-1.5 bg-surface border border-border text-text2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium cursor-pointer hover:border-red hover:text-red"
        >
          <RotateCcw size={14} /> Restablecer v3
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-bg border border-purple/30 px-2.5 py-1.5 text-[12px] font-semibold text-purple">
            ⏱ Tiempo neto: {formatMinutes(totals.minutes)}
            {totals.missing > 0 && <span className="text-red font-medium">· {totals.missing} sin cargar</span>}
          </span>
          <span className="text-[11px] text-text3 max-lg:hidden">
            Tirá del punto violeta para unir · clic en una flecha para borrarla · se guarda solo
          </span>
        </div>
      </div>

      {/* Lienzo */}
      <div className="flex-1 min-h-0 rounded-xl border border-border overflow-hidden relative bg-bg">
        {jb.board ? (
          <JourneyCanvas
            ref={canvasRef}
            board={jb.board}
            roles={jb.roles}
            teamMembers={jb.teamMembers}
            connections={jb.connections}
            actions={actions}
          />
        ) : (
          <div className="h-full grid place-items-center text-text3 text-[13px]">Cargando la pizarra…</div>
        )}
      </div>

      {rolesOpen && (
        <RolesCatalogEditor
          roles={jb.roles}
          addRole={jb.addRole}
          updateRole={jb.updateRole}
          deleteRole={jb.deleteRole}
          onClose={() => setRolesOpen(false)}
        />
      )}
    </div>
  );
}
