import { useMemo } from 'react';
import TeamAvatar from '../TeamAvatar';
import { Check, X as XIcon } from 'lucide-react';
import { today } from '../../utils/helpers';

// Devuelve el lunes (string YYYY-MM-DD) de la semana de la fecha pasada
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function SemanaTracker({ teamMembers, teamReports, mode = 'daily', onClickCell }) {
  const todayStr = today();
  const monday = mondayOf(todayStr);

  // Solo días laborales lun-sáb (6 días para diario; viernes/sábado para semanal)
  const days = useMemo(() => {
    if (mode === 'daily') {
      return Array.from({ length: 6 }, (_, i) => ({
        date: addDays(monday, i),
        label: DAY_LABELS[i],
      }));
    }
    // Para semanal: solo viernes/sábado de la semana son los esperables
    return [
      { date: addDays(monday, 4), label: 'Viernes' },
      { date: addDays(monday, 5), label: 'Sábado' },
    ];
  }, [monday, mode]);

  // Filtrar reports relevantes (del tipo correcto)
  const reportsByUserDate = useMemo(() => {
    const map = {};
    (teamReports || []).forEach(r => {
      if (mode === 'daily' && r.report_type !== 'daily') return;
      if (mode === 'weekly' && r.report_type !== 'weekly') return;
      const key = r.user_id + '|' + r.report_date;
      map[key] = r;
    });
    return map;
  }, [teamReports, mode]);

  // Para semanal, considerar el informe como "subido" si existe un weekly con report_date dentro de esta semana
  const hasWeeklyReportForUser = (userId) => {
    if (mode !== 'weekly') return null;
    return (teamReports || []).find(r => r.report_type === 'weekly' && r.user_id === userId && r.report_date === monday);
  };

  const sortedTeam = useMemo(
    () => [...(teamMembers || [])].sort((a, b) => (a.position || 0) - (b.position || 0)),
    [teamMembers]
  );

  if (sortedTeam.length === 0) {
    return (
      <div className="text-center text-text3 text-xs py-6">Sin miembros en el equipo.</div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
        <span className="text-[12px] font-bold text-gray-700">
          {mode === 'daily' ? 'Esta semana — Informes diarios' : 'Esta semana — Informe semanal'}
        </span>
        <span className="text-[10px] text-gray-400">
          (semana del {new Date(monday + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })})
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 font-semibold text-gray-500 sticky left-0 bg-gray-50 z-10">Persona</th>
              {days.map(d => (
                <th key={d.date} className="text-center px-2 py-2 font-semibold text-gray-500 whitespace-nowrap">
                  {d.label}
                  <div className="text-[9px] text-gray-400 font-normal">
                    {new Date(d.date + 'T00:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTeam.map(m => {
              if (mode === 'weekly') {
                const r = hasWeeklyReportForUser(m.id);
                const isFutureWeek = false; // semana actual siempre relevante
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-3 py-2 sticky left-0 bg-white z-10">
                      <div className="flex items-center gap-2">
                        <TeamAvatar member={{ ...m, avatar: m.avatar_url || m.avatar }} size={22} />
                        <span className="font-medium text-gray-700">{m.name}</span>
                      </div>
                    </td>
                    {days.map(d => {
                      const isPast = d.date <= todayStr;
                      const cellReport = r && d.date === days[0].date ? r : null;
                      return (
                        <td key={d.date} className="text-center px-2 py-2">
                          <button
                            type="button"
                            onClick={() => onClickCell && onClickCell({ user: m, date: d.date, type: 'weekly', report: r })}
                            className={`w-7 h-7 rounded-full inline-flex items-center justify-center cursor-pointer border transition-colors ${
                              r ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                                : isPast ? 'bg-red-50 text-red-500 border-red-100 hover:bg-red-100'
                                : 'bg-gray-50 text-gray-300 border-gray-100'
                            }`}
                            title={r ? 'Informe semanal subido' : isPast ? 'Falta informe semanal' : 'Día futuro'}
                          >
                            {r ? <Check size={14} /> : isPast ? <XIcon size={12} /> : null}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              return (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-3 py-2 sticky left-0 bg-white z-10">
                    <div className="flex items-center gap-2">
                      <TeamAvatar member={{ ...m, avatar: m.avatar_url || m.avatar }} size={22} />
                      <span className="font-medium text-gray-700">{m.name}</span>
                    </div>
                  </td>
                  {days.map(d => {
                    const r = reportsByUserDate[m.id + '|' + d.date];
                    const isPast = d.date <= todayStr;
                    const isToday = d.date === todayStr;
                    return (
                      <td key={d.date} className="text-center px-2 py-2">
                        <button
                          type="button"
                          onClick={() => onClickCell && onClickCell({ user: m, date: d.date, type: 'daily', report: r })}
                          className={`w-7 h-7 rounded-full inline-flex items-center justify-center cursor-pointer border transition-colors ${
                            r ? 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200'
                              : isPast ? 'bg-red-50 text-red-500 border-red-100 hover:bg-red-100'
                              : isToday ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
                              : 'bg-gray-50 text-gray-300 border-gray-100'
                          }`}
                          title={r ? 'Informe subido' : isPast ? 'Falta informe' : isToday ? 'Hoy — pendiente' : 'Día futuro'}
                        >
                          {r ? <Check size={14} /> : isPast ? <XIcon size={12} /> : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
