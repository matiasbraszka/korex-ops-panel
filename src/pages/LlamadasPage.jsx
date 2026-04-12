import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Phone, ExternalLink, ChevronDown, ChevronUp, Clock, Users as UsersIcon, Calendar, Search, Trash2 } from 'lucide-react';
import CallDetailExpanded from '../components/CallDetailExpanded';

const CAT_CONFIG = {
  cliente:  { bg: '#EFF6FF', text: '#1D4ED8', label: 'Cliente' },
  equipo:   { bg: '#F0FDF4', text: '#166534', label: 'Equipo' },
  mentoria: { bg: '#FDF4FF', text: '#7E22CE', label: 'Mentoria' },
  ventas:   { bg: '#FFF7ED', text: '#C2410C', label: 'Ventas' },
};

function fmtFecha(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

export default function LlamadasPage() {
  const { llamadas, updateLlamada, deleteLlamada, createTask, clients, tasks, currentUser } = useApp();
  const [expandedId, setExpandedId] = useState(null);
  const [catFilter, setCatFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [search, setSearch] = useState('');

  const canEdit = currentUser?.role === 'COO' || currentUser?.canAccessSettings === true;

  // Filter
  let filtered = [...(llamadas || [])];
  if (catFilter !== 'all') filtered = filtered.filter(l => l.categoria === catFilter);
  if (clientFilter !== 'all') filtered = filtered.filter(l => l.cliente_id === clientFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(l => (l.titulo || '').toLowerCase().includes(q) || (l.resumen || '').toLowerCase().includes(q));
  }

  // Clients that have calls (for filter dropdown)
  const clientsWithCalls = [...new Set((llamadas || []).map(l => l.cliente_id).filter(Boolean))];
  const clientOptions = clientsWithCalls.map(id => {
    const c = clients?.find(cl => cl.id === id);
    return { id, name: c?.name || id };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const handleDelete = async (id) => {
    if (!confirm('Eliminar esta llamada?')) return;
    await deleteLlamada(id);
    if (expandedId === id) setExpandedId(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold text-gray-800 flex items-center gap-2">
          <Phone size={20} className="text-blue-500" /> Llamadas
        </h1>
        <p className="text-xs text-gray-400 mt-0.5">
          Llamadas procesadas automaticamente desde Fathom. {filtered.length} llamada{filtered.length !== 1 ? 's' : ''}.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Category pills */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
          <button
            onClick={() => setCatFilter('all')}
            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border-none cursor-pointer font-sans transition-colors ${catFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-transparent text-gray-500 hover:bg-gray-100'}`}
          >Todas</button>
          {Object.entries(CAT_CONFIG).map(([key, cfg]) => (
            <button key={key}
              onClick={() => setCatFilter(catFilter === key ? 'all' : key)}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border-none cursor-pointer font-sans transition-colors ${catFilter === key ? 'text-white' : 'bg-transparent hover:bg-gray-100'}`}
              style={catFilter === key ? { background: cfg.text, color: 'white' } : { color: cfg.text }}
            >{cfg.label}</button>
          ))}
        </div>

        {/* Client dropdown */}
        {clientOptions.length > 0 && (
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            className="text-[11px] border border-gray-200 rounded-lg py-1.5 px-2.5 font-sans outline-none focus:border-blue-400 bg-white text-gray-700"
          >
            <option value="all">Todos los clientes</option>
            {clientOptions.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}

        {/* Search */}
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="text-[11px] border border-gray-200 rounded-lg py-1.5 pl-7 pr-3 font-sans outline-none focus:border-blue-400 bg-white text-gray-700 w-[180px]"
          />
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
          <Phone size={40} className="text-gray-300 mx-auto mb-3" />
          <div className="text-[14px] text-gray-500 font-medium">
            {(llamadas || []).length === 0 ? 'Sin llamadas procesadas' : 'Sin resultados para estos filtros'}
          </div>
          <div className="text-[12px] text-gray-400 mt-1">
            {(llamadas || []).length === 0 ? 'Cuando proceses llamadas con /procesa-llamadas apareceran aca.' : 'Proba cambiar los filtros.'}
          </div>
        </div>
      )}

      {/* Call cards */}
      <div className="space-y-2">
        {filtered.map(l => {
          const expanded = expandedId === l.id;
          const cat = CAT_CONFIG[l.categoria] || CAT_CONFIG.equipo;
          const clientName = l.cliente_id ? clients?.find(c => c.id === l.cliente_id)?.name : null;
          const participantes = Array.isArray(l.participantes) ? l.participantes.join(', ') : '';

          return (
            <div key={l.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {/* Card header */}
              <div
                className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                onClick={() => setExpandedId(expanded ? null : l.id)}
              >
                {/* Category badge */}
                <span className="text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0 mt-0.5 uppercase tracking-wide"
                  style={{ background: cat.bg, color: cat.text }}>{cat.label}</span>

                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <div className="text-[13px] font-semibold text-gray-800 truncate">{l.titulo}</div>
                  {/* Meta */}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {l.fecha && (
                      <span className="flex items-center gap-1 text-[11px] text-gray-400">
                        <Calendar size={11} /> {fmtFecha(l.fecha)}
                      </span>
                    )}
                    {l.duracion_min && (
                      <span className="flex items-center gap-1 text-[11px] text-gray-400">
                        <Clock size={11} /> {l.duracion_min}min
                      </span>
                    )}
                    {participantes && (
                      <span className="flex items-center gap-1 text-[11px] text-gray-400">
                        <UsersIcon size={11} /> {participantes}
                      </span>
                    )}
                    {clientName && (
                      <span className="text-[11px] text-blue-500 font-medium">{clientName}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {l.recording_url && (
                    <a
                      href={l.recording_url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 no-underline bg-blue-50 rounded-md px-2 py-1 font-semibold"
                    >
                      <ExternalLink size={11} /> Ver
                    </a>
                  )}
                  {canEdit && (
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(l.id); }}
                      className="p-1.5 text-gray-300 hover:text-red-400 bg-transparent border-none cursor-pointer"
                      title="Eliminar llamada"
                    ><Trash2 size={13} /></button>
                  )}
                  {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </div>
              </div>

              {/* Expanded detail */}
              {expanded && (
                <CallDetailExpanded
                  llamada={l}
                  onUpdate={updateLlamada}
                  onCreateTask={createTask}
                  clients={clients}
                  tasks={tasks}
                  onToggleRetro={(id) => {
                    updateLlamada(id, { usar_como_contexto: !l.usar_como_contexto });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
