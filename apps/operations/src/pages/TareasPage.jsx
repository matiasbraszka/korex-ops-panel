import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { TAREAS_LAYOUT } from '../utils/constants';
import ViewToggle from '../components/tareas/ViewToggle';
import FiltersBar from '../components/tareas/FiltersBar';
import TareasToolbar from '../components/tareas/TareasToolbar';
import RoadmapView from '../components/tareas/RoadmapView';
import TimelineView from '../components/tareas/TimelineView';
import WeeklyTodoView from '../components/tareas/WeeklyTodoView';
import ObjetivosView from '../components/tareas/ObjetivosView';
import SprintBoardView from '../components/tareas/SprintBoardView';
import CalendarView from '../components/tareas/CalendarView';
import RendimientoView from '../components/tareas/RendimientoView';
import TasksPage from './TasksPage';

const VIEW_KEY = 'tareas_current_view';

const SPRINT_VIEWS = [
  { id: 'rendimiento', label: 'Rendimiento' },
  { id: 'objetivos', label: 'Objetivos' },
  { id: 'sprint', label: 'Tablero Sprint' },
  { id: 'calendario', label: 'Calendario' },
  // La pestaña "Lista" se ELIMINÓ (2026-07-03): no se usaba y era repetitiva con
  // el Tablero Sprint. El layout legacy conserva su propia "Lista" (TasksPage).
  { id: 'todo', label: 'To-Do diario' },
];
const LEGACY_VIEWS = [
  { id: 'roadmap', label: 'Roadmap', icon: 'objetivos' },
  { id: 'timeline', label: 'Timeline', icon: 'rendimiento' },
  { id: 'lista', label: 'Lista', icon: 'todo' },
  { id: 'mi-semana', label: 'To-Do List', icon: 'todo' },
];

export default function TareasPage() {
  const { setTaskClientFilter, currentUser } = useApp();
  const isSprint = TAREAS_LAYOUT === 'sprint';
  const isGuest = !!currentUser?.isGuest;
  // Invitado: solo Objetivos + Tablero Sprint (sin Rendimiento ni To-Do diario).
  const sprintViews = isGuest ? SPRINT_VIEWS.filter(v => v.id === 'objetivos' || v.id === 'sprint') : SPRINT_VIEWS;
  const VIEWS = isSprint ? sprintViews : LEGACY_VIEWS;
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
  // Filtro "solo en el sprint" (Objetivos). El antiguo alcance Clientes/Internos
  // se quitó: el filtro de cliente ya cubre lo interno (eligiendo Korex/Empresa).
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
    // En modo sprint la vista Lista está oculta → llevamos al Tablero Sprint.
    setView(isSprint ? 'sprint' : 'lista');
  };

  return (
    <div className="space-y-4">
      {/* Sprint: toolbar unificado (pestañas + filtros en una sola fila).
          Legacy: pestañas + barra de filtros vieja. */}
      {isSprint ? (
        <TareasToolbar view={view} setView={setView} views={VIEWS} onlySprint={onlySprint} setOnlySprint={setOnlySprint} />
      ) : (
        <ViewToggle value={view} onChange={setView} views={VIEWS} />
      )}
      {/* Layout legacy usa la barra de filtros vieja */}
      {!isSprint && view !== 'mi-semana' && <FiltersBar />}

      {/* Vistas sprint */}
      {isSprint && view === 'rendimiento' && <RendimientoView />}
      {isSprint && view === 'objetivos' && <ObjetivosView onlySprint={onlySprint} />}
      {isSprint && view === 'sprint' && <SprintBoardView />}
      {isSprint && view === 'calendario' && <CalendarView onlySprint={onlySprint} />}
      {isSprint && view === 'todo' && <WeeklyTodoView />}

      {/* Vistas legacy */}
      {!isSprint && view === 'roadmap' && <RoadmapView />}
      {!isSprint && view === 'timeline' && <TimelineView onGoToTaskList={handleGoToTaskList} />}
      {!isSprint && view === 'lista' && <TasksPage embedded />}
      {!isSprint && view === 'mi-semana' && <WeeklyTodoView />}
    </div>
  );
}
