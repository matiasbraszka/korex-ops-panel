import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import ViewToggle from '../components/tareas/ViewToggle';
import FiltersBar from '../components/tareas/FiltersBar';
import RoadmapView from '../components/tareas/RoadmapView';
import TimelineView from '../components/tareas/TimelineView';
import TasksPage from './TasksPage';

const VIEW_KEY = 'tareas_current_view';

export default function TareasPage() {
  const { setTaskClientFilter } = useApp();

  const [view, setView] = useState(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      return saved && ['roadmap', 'timeline', 'lista'].includes(saved) ? saved : 'roadmap';
    } catch {
      return 'roadmap';
    }
  });

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, view); } catch {}
  }, [view]);

  // Called from TimelineView when user clicks a task title.
  // Switches to Lista view with the task's client pre-filtered,
  // and stores the task id so ListaView can highlight/scroll to it.
  const handleGoToTaskList = (clientId, taskId) => {
    if (clientId) setTaskClientFilter(clientId);
    if (taskId) {
      try { localStorage.setItem('tareas_highlight_task', taskId); } catch {}
    }
    setView('lista');
  };

  return (
    <div className="space-y-3">
      {/* View toggle */}
      <ViewToggle value={view} onChange={setView} />

      {/* Unified filters bar — applies to all three views */}
      <FiltersBar />

      {/* Active view */}
      {view === 'roadmap' && <RoadmapView />}
      {view === 'timeline' && <TimelineView onGoToTaskList={handleGoToTaskList} />}
      {view === 'lista' && <TasksPage embedded />}
    </div>
  );
}
