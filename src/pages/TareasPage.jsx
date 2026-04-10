import { useState, useEffect } from 'react';
import ViewToggle from '../components/tareas/ViewToggle';
import FiltersBar from '../components/tareas/FiltersBar';
import RoadmapView from '../components/tareas/RoadmapView';
import TimelineView from '../components/tareas/TimelineView';
import TasksPage from './TasksPage';

const VIEW_KEY = 'tareas_current_view';

export default function TareasPage() {
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

  return (
    <div className="space-y-3">
      {/* View toggle */}
      <ViewToggle value={view} onChange={setView} />

      {/* Unified filters bar — applies to all three views */}
      <FiltersBar />

      {/* Active view */}
      {view === 'roadmap' && <RoadmapView />}
      {view === 'timeline' && <TimelineView />}
      {view === 'lista' && <TasksPage embedded />}
    </div>
  );
}
