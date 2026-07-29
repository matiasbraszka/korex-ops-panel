import { useEffect, useState, useCallback } from 'react';
import { Calendar } from 'lucide-react';
import { fetchSeguimiento, patchConversation, fetchTeamMembers } from '../lib/api.js';
import { fmtPhone, convName } from '../lib/format.js';
import { useSoporte } from '../context/SoporteContext.jsx';
import { useAuth } from '@korex/auth';

const COLUMNAS = ['SIN RESPONDER', 'A RESPONDER HOY', 'ESPERANDO AL CONTACTO', 'SEGUIMIENTO', 'CERRADO'];
const COLUMNAS_EDITABLES = new Set(['A RESPONDER HOY', 'SEGUIMIENTO']);

export default function SeguimientoPage() {
  const { selectConversation } = useSoporte();
  const { isAdmin } = useAuth();
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ client_id: '', assigned_to: '', tags: [] });
  const [team, setTeam] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null);
  const [seguimientoDatePicker, setSeguimientoDatePicker] = useState(null);

  useEffect(() => {
    (async () => {
      const [convs, teamData] = await Promise.all([
        fetchSeguimiento(filters),
        fetchTeamMembers(),
      ]);
      const byColumna = {};
      COLUMNAS.forEach(c => byColumna[c] = []);
      for (const conv of convs) {
        if (conv.columna_kanban && byColumna[conv.columna_kanban] !== undefined) {
          byColumna[conv.columna_kanban].push(conv);
        }
      }
      setData(byColumna);
      setTeam(teamData);
      setLoading(false);
    })();
  }, [filters]);

  const handleDragStart = (e, conv, columna) => {
    if (!COLUMNAS_EDITABLES.has(columna)) return;
    setDraggedItem({ conv, fromColumna: columna });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e, toColumna) => {
    e.preventDefault();
    if (!draggedItem || !COLUMNAS_EDITABLES.has(toColumna)) return;

    const { conv, fromColumna } = draggedItem;
    if (fromColumna === toColumna) {
      setDraggedItem(null);
      return;
    }

    let patch = {};
    if (toColumna === 'A RESPONDER HOY') {
      patch = { estado: 'responder_hoy', seguimiento_fecha: null };
    } else if (toColumna === 'SEGUIMIENTO') {
      setSeguimientoDatePicker({ convId: conv.id, fromColumna });
      setDraggedItem(null);
      return;
    }

    if (Object.keys(patch).length) {
      await patchConversation(conv.id, patch);
      const updated = await fetchSeguimiento(filters);
      const byColumna = {};
      COLUMNAS.forEach(c => byColumna[c] = []);
      for (const c of updated) {
        if (c.columna_kanban && byColumna[c.columna_kanban] !== undefined) {
          byColumna[c.columna_kanban].push(c);
        }
      }
      setData(byColumna);
    }
    setDraggedItem(null);
  };

  const handleSeguimientoDate = async (date) => {
    if (!seguimientoDatePicker || !date) {
      setSeguimientoDatePicker(null);
      return;
    }
    const patch = { estado: 'seguimiento', seguimiento_fecha: date };
    await patchConversation(seguimientoDatePicker.convId, patch);
    const updated = await fetchSeguimiento(filters);
    const byColumna = {};
    COLUMNAS.forEach(c => byColumna[c] = []);
    for (const c of updated) {
      if (c.columna_kanban && byColumna[c.columna_kanban] !== undefined) {
        byColumna[c.columna_kanban].push(c);
      }
    }
    setData(byColumna);
    setSeguimientoDatePicker(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-text3">Cargando seguimiento…</div>;
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Filtros */}
      <div className="border-b border-border bg-white px-4 py-3 shrink-0 flex gap-3 items-center">
        <input
          type="text"
          placeholder="Filtrar por cliente…"
          value={filters.client_id}
          onChange={(e) => setFilters({ ...filters, client_id: e.target.value })}
          className="px-2 py-1 border border-border rounded text-[13px] bg-white"
        />
        <select
          value={filters.assigned_to}
          onChange={(e) => setFilters({ ...filters, assigned_to: e.target.value })}
          className="px-2 py-1 border border-border rounded text-[13px] bg-white"
        >
          <option value="">Todos los asignados</option>
          {team.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto bg-surface2 px-4 py-4 gap-4 flex min-h-0">
        {COLUMNAS.map((columna) => (
          <div
            key={columna}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, columna)}
            className="w-80 shrink-0 bg-white rounded-lg border border-border flex flex-col"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border font-semibold text-[13px] text-text2">
              {columna} ({data[columna]?.length || 0})
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
              {(data[columna] || []).map((conv) => (
                <KanbanCard
                  key={conv.id}
                  conv={conv}
                  columna={columna}
                  editable={COLUMNAS_EDITABLES.has(columna)}
                  onDragStart={(e) => handleDragStart(e, conv, columna)}
                  onSelect={() => selectConversation(conv.id)}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Date picker modal para Seguimiento */}
      {seguimientoDatePicker && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="font-semibold mb-4">Agendar seguimiento</h3>
            <input
              type="date"
              onBlur={(e) => handleSeguimientoDate(e.target.value)}
              autoFocus
              defaultValue={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-border rounded mb-4"
            />
            <button
              onClick={() => setSeguimientoDatePicker(null)}
              className="w-full px-4 py-2 border border-border rounded text-[13px] text-text2 hover:bg-surface2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KanbanCard({ conv, columna, editable, onDragStart, onSelect, isAdmin }) {
  const name = convName(conv, !isAdmin);
  const color = colorFromString(conv.wa_jid);

  return (
    <div
      draggable={editable}
      onDragStart={onDragStart}
      onClick={onSelect}
      className={`p-3 rounded-lg border border-border bg-white cursor-pointer hover:shadow-sm transition-shadow ${
        editable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
      <div className="flex items-start gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0"
          style={{ background: color + '1d', color }}
        >
          {conv.is_group ? '+' : name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-text truncate">{name}</div>
          {conv.client?.name && (
            <div className="text-[11px] text-text3">{conv.client.name}</div>
          )}
        </div>
      </div>
      {conv.notes && (
        <div className="text-[12px] text-text3 mb-2 line-clamp-2">{conv.notes}</div>
      )}
      <div className="text-[11px] text-text3">{fmtPhone(conv.wa_phone)}</div>
    </div>
  );
}

function colorFromString(str) {
  const hash = str.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const colors = ['#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E', '#10B981', '#06B6D4', '#0EA5E9', '#3B82F6', '#8B5CF6'];
  return colors[hash % colors.length];
}
