import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, RefreshCw, Search, Eye, Users2 } from 'lucide-react';
import { useAuth } from '@korex/auth';
import { fetchSeguimiento, patchConversation, fetchTeamMembers } from '../lib/api.js';
import { COLUMNAS } from '../lib/kanban.js';
import ColumnaSeguimiento from '../components/seguimiento/ColumnaSeguimiento.jsx';

// Tablero de seguimiento de contactos.
//
// Responde una sola pregunta: ¿a quién le debemos una respuesta y hace cuánto?
// Los datos salen de wa_conversations_seguimiento, que calcula la columna en la
// base a partir de quién mandó el último mensaje y cuándo. Nada de esto
// interpreta el contenido de los mensajes: por eso no se equivoca.
//
// Lo único que se escribe desde acá es wa_conversations.estado (+ la fecha del
// seguimiento). Las etiquetas NO se tocan.

const FILTROS_INICIALES = {
  soloVivas: true,       // 30 dias. Sin esto, 239 clientes cerrados hace meses inflan el tablero.
  verInternos: false,    // equipo interno y proveedores no son soporte (§8.3)
  soloSinVer: false,
  clientId: '',
  dueno: '',
  search: '',
};

export default function SeguimientoPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [filas, setFilas] = useState(null);
  const [equipo, setEquipo] = useState([]);
  const [err, setErr] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [f, setF] = useState(FILTROS_INICIALES);
  const [colMobile, setColMobile] = useState(COLUMNAS[0].k);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [rows, team] = await Promise.all([fetchSeguimiento(), fetchTeamMembers()]);
      setFilas(rows);
      setEquipo(team);
      setErr(null);
    } catch (e) {
      setErr(e?.message || 'No pude traer el tablero');
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const nombrePorMiembro = useMemo(
    () => Object.fromEntries((equipo || []).map((m) => [m.id, m.name])),
    [equipo],
  );

  // Clientes presentes en el tablero, para el desplegable.
  const clientes = useMemo(() => {
    const map = new Map();
    for (const r of filas || []) if (r.client_id && r.cliente_nombre) map.set(r.client_id, r.cliente_nombre);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [filas]);

  const visibles = useMemo(() => {
    const q = f.search.trim().toLowerCase();
    return (filas || []).filter((r) => {
      if (f.soloVivas && !r.vivo) return false;
      if (!f.verInternos && r.interno) return false;
      if (f.soloSinVer && !r.nunca_abierta) return false;
      if (f.clientId && r.client_id !== f.clientId) return false;
      if (f.dueno && r.assigned_to !== f.dueno) return false;
      if (q) {
        const heno = `${r.custom_name || ''} ${r.wa_profile_name || ''} ${r.cliente_nombre || ''} ${r.wa_jid || ''}`.toLowerCase();
        if (!heno.includes(q)) return false;
      }
      return true;
    });
  }, [filas, f]);

  // Dentro de cada columna: el que espera hace más va arriba. La vista ya viene
  // ordenada por last_message_at ascendente, así que alcanza con agrupar.
  const porColumna = useMemo(() => {
    const out = Object.fromEntries(COLUMNAS.map((c) => [c.k, []]));
    for (const r of visibles) if (out[r.columna_kanban]) out[r.columna_kanban].push(r);
    return out;
  }, [visibles]);

  const sinVer = visibles.filter((r) => r.nunca_abierta).length;

  // Marcar = escribir estado. NO pone el candado (estado es flujo de trabajo,
  // no identidad), así que la vinculación automática sigue funcionando.
  const marcar = useCallback(async (convId, estado, fecha) => {
    const patch = { estado, seguimiento_fecha: estado === 'seguimiento' ? fecha : null };
    setFilas((prev) => (prev || []).map((r) => (r.id === convId ? { ...r, ...patch } : r)));
    try {
      await patchConversation(convId, patch);
      await cargar(); // la columna la recalcula la base, no nosotros
    } catch (e) {
      setErr(e?.message || 'No pude guardar el cambio');
      cargar();
    }
  }, [cargar]);

  const abrirChat = useCallback((convId) => {
    navigate(`/soporte/inbox?conv=${convId}`);
  }, [navigate]);

  if (cargando && !filas) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-text3">
        <Loader2 size={15} className="animate-spin" />Armando el tablero…
      </div>
    );
  }

  if (err && !filas) {
    return (
      <div className="rounded-xl border border-[#F5C2C2] bg-[#FEF2F2] text-[#B91C1C] p-4 text-[12.5px]">
        <div className="font-semibold mb-1 flex items-center gap-1.5"><AlertCircle size={14} />No pude traer el tablero</div>
        <div className="text-[11.5px] opacity-90">{err}</div>
        <div className="text-[11.5px] mt-1.5 opacity-75">
          Si dice que no existe <code className="font-mono">wa_conversations_seguimiento</code>, falta aplicar{' '}
          <code className="font-mono">soporte_v34_vista_seguimiento.sql</code>.
        </div>
      </div>
    );
  }

  const chip = 'text-[11px] font-semibold px-2 py-1 rounded-lg border cursor-pointer transition-colors';

  return (
    <div className="h-full min-h-0 flex flex-col gap-2.5">
      {/* Barra de filtros y contadores */}
      <div className="flex items-center gap-2 flex-wrap shrink-0 rounded-xl border border-border bg-white px-3 py-2">
        <span className="text-[11px] font-bold text-text2">
          {visibles.length} conversaciones
        </span>
        <span className="w-px h-3.5 bg-border" />
        <span className="text-[11px] font-semibold text-text3">
          Sin responder <b className="text-[#DC2626]">{porColumna.SIN_RESPONDER.length}</b>
        </span>
        <span className="text-[11px] font-semibold text-text3">
          Sin ver <b className="text-[#DC2626]">{sinVer}</b>
        </span>
        <span className="w-px h-3.5 bg-border" />

        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text3" />
          <input
            value={f.search}
            onChange={(e) => setF((p) => ({ ...p, search: e.target.value }))}
            placeholder="Buscar nombre o cliente…"
            className="text-[11.5px] pl-6 pr-2 py-1 rounded-lg border border-border bg-surface2/60 outline-none focus:border-[#F59E0B] w-[172px]"
          />
        </div>

        <select value={f.clientId} onChange={(e) => setF((p) => ({ ...p, clientId: e.target.value }))}
                className="text-[11.5px] py-1 px-1.5 rounded-lg border border-border bg-white text-text2 max-w-[150px]">
          <option value="">Todos los clientes</option>
          {clientes.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
        </select>

        <select value={f.dueno} onChange={(e) => setF((p) => ({ ...p, dueno: e.target.value }))}
                className="text-[11.5px] py-1 px-1.5 rounded-lg border border-border bg-white text-text2 max-w-[140px]">
          <option value="">Cualquier dueño</option>
          {equipo.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        <button onClick={() => setF((p) => ({ ...p, soloVivas: !p.soloVivas }))}
                title="Solo conversaciones con actividad en los últimos 30 días. Apagarlo muestra también clientes cerrados hace meses."
                className={chip + (f.soloVivas ? ' border-[#F59E0B] bg-[#FFFBF2] text-[#B45309]' : ' border-border bg-white text-text3')}>
          Solo activas (30 d)
        </button>

        <button onClick={() => setF((p) => ({ ...p, soloSinVer: !p.soloSinVer }))}
                className={chip + ' inline-flex items-center gap-1' + (f.soloSinVer ? ' border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]' : ' border-border bg-white text-text3')}>
          <Eye size={11} /> Nunca abiertas
        </button>

        <button onClick={() => setF((p) => ({ ...p, verInternos: !p.verInternos }))}
                title="El equipo interno y los proveedores no son soporte: se esconden por defecto."
                className={chip + ' inline-flex items-center gap-1' + (f.verInternos ? ' border-[#8B5CF6] bg-[#F5F3FF] text-[#7C3AED]' : ' border-border bg-white text-text3')}>
          <Users2 size={11} /> Ver internos
        </button>

        <button onClick={cargar} title="Volver a traer"
                className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-semibold text-text3 hover:text-[#F59E0B] bg-transparent border-0 cursor-pointer">
          <RefreshCw size={11} className={cargando ? 'animate-spin' : ''} />Actualizar
        </button>
      </div>

      {err && (
        <div className="shrink-0 rounded-lg border border-[#F5C2C2] bg-[#FEF2F2] text-[#B91C1C] px-3 py-1.5 text-[11.5px]">
          {err}
        </div>
      )}

      {/* Mobile: una columna por vez */}
      <div className="hidden max-md:flex gap-1.5 overflow-x-auto shrink-0 pb-0.5">
        {COLUMNAS.map((c) => (
          <button key={c.k} onClick={() => setColMobile(c.k)}
                  className={`shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border cursor-pointer inline-flex items-center gap-1.5 ${
                    colMobile === c.k ? 'border-[#F59E0B] bg-[#FFFBF2] text-[#B45309]' : 'border-border bg-white text-text3'}`}>
            <span className="w-[6px] h-[6px] rounded-full" style={{ background: c.dot }} />
            {c.label} <b>{porColumna[c.k].length}</b>
          </button>
        ))}
      </div>

      {/* 5 columnas en escritorio; en mobile una sola, la elegida arriba. */}
      <div className="flex-1 min-h-0 grid gap-2.5 items-stretch grid-cols-1 md:grid-cols-5">
        {COLUMNAS.map((c) => (
          <div key={c.k} className={`min-h-0 ${colMobile === c.k ? '' : 'max-md:hidden'}`}>
            <ColumnaSeguimiento
              col={c}
              filas={porColumna[c.k]}
              isAdmin={isAdmin}
              nombrePorMiembro={nombrePorMiembro}
              onAbrirChat={abrirChat}
              onMarcar={marcar}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
