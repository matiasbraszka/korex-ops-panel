import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { TAREAS_LAYOUT } from '../utils/constants';
import ViewToggle from '../components/tareas/ViewToggle';
import FiltersBar from '../components/tareas/FiltersBar';
import TareasBar from '../components/tareas/TareasBar';
import RoadmapView from '../components/tareas/RoadmapView';
import TimelineView from '../components/tareas/TimelineView';
import WeeklyTodoView from '../components/tareas/WeeklyTodoView';
import ObjetivosView from '../components/tareas/ObjetivosView';
import SprintBoardView from '../components/tareas/SprintBoardView';
import ListaView from '../components/tareas/ListaView';
import RendimientoView from '../components/tareas/RendimientoView';
import TasksPage from './TasksPage';

const VIEW_KEY = 'tareas_current_view';

const SPRINT_VIEWS = [
  { id: 'rendimiento', label: 'Rendimiento' },
  { id: 'objetivos', label: 'Objetivos' },
  { id: 'sprint', label: 'Tablero Sprint' },
  // Vista "Lista" oculta: resultaba repetitiva con el Tablero Sprint.
  // El componente sigue disponible (ListaView) por si se quiere reactivar.
  { id: 'todo', label: 'To-Do diario' },
];
const LEGACY_VIEWS = [
  { id: 'roadmap', label: 'Roadmap', icon: 'objetivos' },
  { id: 'timeline', label: 'Timeline', icon: 'rendimiento' },
  { id: 'lista', label: 'Lista', icon: 'todo' },
  { id: 'mi-semana', label: 'To-Do List', icon: 'todo' },
];

export default function TareasPage() {
  const { setTaskClientFilter } = useApp();
  const isSprint = TAREAS_LAYOUT === 'sprint';
  const VIEWS = isSprint ? SPRINT_VIEWS : LEGACY_VIEWS;
  const DEFAULT_VIEW = isSprint ? 'objetivos' : 'roadmap';
  const validIds = VIEWS.map(v => v.id);

  const [view, setView] = useState(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      return saved && validIds.includes(saved) ? saved : DEFAULT_VIEW;
    } catch {
      return DEFAULT_VIEW;
    }
  });
  // Filtros del diseño: alcance (Clientes/Internos) y "solo en el sprint".
  const [scope, setScope] = useState('cli');
  const [onlySprint, setOnlySprint] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ }
  }, [view]);

  useEffect(() => {
    const handler = () => setView(isSprint ? 'sprint' : 'lista');
    window.addEventListener('tareas:gotoTask', handler);
    return () => window.removeEventListener('tareas:gotoTask', handler);
  }, [isSprint]);

  const handleGoToTaskList = (clientId, taskId) => {
    if (clientId) setTaskClientFilter(clientId);
    if (taskId) {
      try { localStorage.setItem('tareas_highlight_task', taskId); } catch { /* ignore */ }
    }
    setView('lista');
  };

  const showBar = isSprint && (view === 'objetivos' || view === 'sprint' || view === 'lista');

  return (
    <div className="space-y-4">
      <ViewToggle value={view} onChange={setView} views={VIEWS} />

      {/* Barra de contexto del diseño (Objetivos + Sprint) */}
      {showBar && (
        <TareasBar view={view} scope={scope} setScope={setScope} onlySprint={onlySprint} setOnlySprint={setOnlySprint} />
      )}
      {/* Layout legacy usa la barra de filtros vieja */}
      {!isSprint && view !== 'mi-semana' && <FiltersBar />}

      {/* Vistas sprint */}
      {isSprint && view === 'rendimiento' && <RendimientoView />}
      {isSprint && view === 'objetivos' && <ObjetivosView scope={scope} onlySprint={onlySprint} />}
      {isSprint && view === 'sprint' && <SprintBoardView scope={scope} />}
      {isSprint && view === 'lista' && <ListaView scope={scope} />}
      {isSprint && view === 'todo' && <WeeklyTodoView />}

      {/* Vistas legacy */}
      {!isSprint && view === 'roadmap' && <RoadmapView />}
      {!isSprint && view === 'timeline' && <TimelineView onGoToTaskList={handleGoToTaskList} />}
      {!isSprint && view === 'lista' && <TasksPage embedded />}
      {!isSprint && view === 'mi-semana' && <WeeklyTodoView />}
    </div>
  );
}
