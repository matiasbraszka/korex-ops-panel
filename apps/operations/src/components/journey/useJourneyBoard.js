// useJourneyBoard — estado + persistencia de la pizarra Customer Journey.
//
// Lee el tablero desde appSettings.customer_journey (blob JSON en la tabla
// app_settings, fila global). Si no existe, siembra el default del v3. Toda
// mutación actualiza el estado local y persiste con debounce vía
// updateAppSettings — compartido para todo el equipo, sin migración.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { buildDefaultBoard, migrateSpacing, ensureMinutes, BOARD_VERSION, DEFAULT_ROLES, uid } from './journeyData';

const SAVE_DEBOUNCE_MS = 800;

export default function useJourneyBoard() {
  const { appSettings, updateAppSettings, teamMembers } = useApp();
  const [board, setBoard] = useState(null); // null = todavía cargando
  const initedRef = useRef(false);
  const saveTimer = useRef(null);
  const boardRef = useRef(null);

  // Carga inicial (una sola vez, cuando appSettings llega de Supabase).
  useEffect(() => {
    if (initedRef.current) return;
    if (appSettings === null) return; // aún cargando settings
    const saved = appSettings?.customer_journey;
    // Solo reutilizamos el guardado si es de la versión actual del modelo.
    // Una versión vieja (sin flechas ni casuísticas) se regenera desde el v3.
    if (saved && Array.isArray(saved.nodes) && saved.version === BOARD_VERSION) {
      const roles = Array.isArray(saved.roles) && saved.roles.length ? saved.roles : DEFAULT_ROLES.map((r) => ({ ...r }));
      // migrateSpacing: si el tablero es de un espaciado viejo, corre las
      // tarjetas hacia abajo para acompañar las bandas más altas (sin perder nada).
      const next = ensureMinutes(migrateSpacing({ ...saved, roles, connections: Array.isArray(saved.connections) ? saved.connections : [] }));
      setBoard(next);
      boardRef.current = next;
      if (next.spacing !== saved.spacing || next.minutesReady !== saved.minutesReady) scheduleSave(next, 0); // persistir migraciones
    } else {
      const seed = buildDefaultBoard();
      setBoard(seed);
      boardRef.current = seed;
      // Persistimos la semilla para que quede fija en el próximo reload.
      scheduleSave(seed, 0);
    }
    initedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  // Persistencia con debounce.
  const scheduleSave = useCallback((next, delay = SAVE_DEBOUNCE_MS) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateAppSettings({ customer_journey: { ...next, updatedAt: new Date().toISOString() } });
    }, delay);
  }, [updateAppSettings]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // Aplica un cambio: actualiza estado local + agenda guardado.
  const commit = useCallback((updater) => {
    setBoard((prev) => {
      if (!prev) return prev;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      boardRef.current = next;
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const mapNodes = useCallback((prev, fn) => ({ ...prev, nodes: prev.nodes.map(fn) }), []);

  // ── Nodos (tarjetas) ──────────────────────────────────────────────────────
  const addNode = useCallback((partial = {}) => {
    const node = {
      id: uid('n'), title: 'Nueva tarjeta', subtitle: '', lane: 'A',
      kind: 'normal', x: 80, y: 80, note: '', items: [], ...partial,
    };
    commit((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
    return node.id;
  }, [commit]);

  const updateNode = useCallback((id, patch) => {
    commit((prev) => mapNodes(prev, (n) => (n.id === id ? { ...n, ...patch } : n)));
  }, [commit, mapNodes]);

  // Movimiento en vivo (sin guardar en cada pixel); el guardado se agenda igual
  // por debounce, así que al soltar ya queda persistido.
  const moveNode = useCallback((id, x, y) => {
    commit((prev) => mapNodes(prev, (n) => (n.id === id ? { ...n, x, y } : n)));
  }, [commit, mapNodes]);

  const deleteNode = useCallback((id) => {
    commit((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== id),
      // Se van también las flechas que entraban o salían de esa tarjeta.
      connections: (prev.connections || []).filter((c) => c.from !== id && c.to !== id),
    }));
  }, [commit]);

  // ── Ítems de checklist ────────────────────────────────────────────────────
  const addItem = useCallback((nodeId) => {
    const item = { id: uid('i'), text: '', done: false, roleId: null, personId: null, time: '', minutes: null };
    commit((prev) => mapNodes(prev, (n) => (n.id === nodeId ? { ...n, items: [...n.items, item] } : n)));
    return item.id;
  }, [commit, mapNodes]);

  const updateItem = useCallback((nodeId, itemId, patch) => {
    commit((prev) => mapNodes(prev, (n) => (
      n.id === nodeId ? { ...n, items: n.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) } : n
    )));
  }, [commit, mapNodes]);

  const deleteItem = useCallback((nodeId, itemId) => {
    commit((prev) => mapNodes(prev, (n) => (
      n.id === nodeId ? { ...n, items: n.items.filter((it) => it.id !== itemId) } : n
    )));
  }, [commit, mapNodes]);

  const toggleItem = useCallback((nodeId, itemId) => {
    commit((prev) => mapNodes(prev, (n) => (
      n.id === nodeId ? { ...n, items: n.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)) } : n
    )));
  }, [commit, mapNodes]);

  // ── Catálogo de roles ─────────────────────────────────────────────────────
  const addRole = useCallback((label, color) => {
    const role = { id: uid('r'), label: label || 'Nuevo rol', color: color || '#94A3B8' };
    commit((prev) => ({ ...prev, roles: [...(prev.roles || []), role] }));
    return role.id;
  }, [commit]);

  const updateRole = useCallback((id, patch) => {
    commit((prev) => ({ ...prev, roles: (prev.roles || []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  }, [commit]);

  const deleteRole = useCallback((id) => {
    commit((prev) => ({
      ...prev,
      roles: (prev.roles || []).filter((r) => r.id !== id),
      // Limpia referencias colgadas en los ítems.
      nodes: prev.nodes.map((n) => ({ ...n, items: n.items.map((it) => (it.roleId === id ? { ...it, roleId: null } : it)) })),
    }));
  }, [commit]);

  // Reordenar ítems dentro de una tarjeta (dir: -1 sube, +1 baja).
  const moveItem = useCallback((nodeId, itemId, dir) => {
    commit((prev) => mapNodes(prev, (n) => {
      if (n.id !== nodeId) return n;
      const i = n.items.findIndex((it) => it.id === itemId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= n.items.length) return n;
      const items = n.items.slice();
      [items[i], items[j]] = [items[j], items[i]];
      return { ...n, items };
    }));
  }, [commit, mapNodes]);

  // ── Fases (columnas de tiempo) ────────────────────────────────────────────
  const updatePhase = useCallback((id, patch) => {
    commit((prev) => ({ ...prev, phases: (prev.phases || []).map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }, [commit]);

  // ── Conexiones (flechas) ──────────────────────────────────────────────────
  const addConnection = useCallback((from, to) => {
    if (!from || !to || from === to) return;
    commit((prev) => {
      const list = prev.connections || [];
      if (list.some((c) => c.from === from && c.to === to)) return prev; // sin duplicados
      return { ...prev, connections: [...list, { id: uid('w'), from, to, kind: 'flow' }] };
    });
  }, [commit]);

  const deleteConnection = useCallback((id) => {
    commit((prev) => ({ ...prev, connections: (prev.connections || []).filter((c) => c.id !== id) }));
  }, [commit]);

  // ── Ramas de decisión (casuísticas) ───────────────────────────────────────
  const mapBranches = (n, fn) => ({ ...n, branches: (n.branches || []).map(fn) });

  const addBranch = useCallback((nodeId) => {
    const branch = { id: uid('b'), cond: 'Si pasa…', ok: false, delayKind: 'dwarn', delayText: '', chain: [] };
    commit((prev) => mapNodes(prev, (n) => (n.id === nodeId ? { ...n, branches: [...(n.branches || []), branch] } : n)));
  }, [commit, mapNodes]);

  const updateBranch = useCallback((nodeId, branchId, patch) => {
    commit((prev) => mapNodes(prev, (n) => (n.id === nodeId ? mapBranches(n, (b) => (b.id === branchId ? { ...b, ...patch } : b)) : n)));
  }, [commit, mapNodes]);

  const deleteBranch = useCallback((nodeId, branchId) => {
    commit((prev) => mapNodes(prev, (n) => (n.id === nodeId ? { ...n, branches: (n.branches || []).filter((b) => b.id !== branchId) } : n)));
  }, [commit, mapNodes]);

  const addChainLine = useCallback((nodeId, branchId, type = 'action') => {
    const line = { id: uid('c'), type, text: '' };
    commit((prev) => mapNodes(prev, (n) => (n.id === nodeId ? mapBranches(n, (b) => (b.id === branchId ? { ...b, chain: [...(b.chain || []), line] } : b)) : n)));
  }, [commit, mapNodes]);

  const updateChainLine = useCallback((nodeId, branchId, lineId, patch) => {
    commit((prev) => mapNodes(prev, (n) => (n.id === nodeId ? mapBranches(n, (b) => (b.id === branchId ? { ...b, chain: b.chain.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) } : b)) : n)));
  }, [commit, mapNodes]);

  const deleteChainLine = useCallback((nodeId, branchId, lineId) => {
    commit((prev) => mapNodes(prev, (n) => (n.id === nodeId ? mapBranches(n, (b) => (b.id === branchId ? { ...b, chain: b.chain.filter((l) => l.id !== lineId) } : b)) : n)));
  }, [commit, mapNodes]);

  const resetBoard = useCallback(() => {
    const seed = buildDefaultBoard();
    boardRef.current = seed;
    setBoard(seed);
    scheduleSave(seed, 0);
  }, [scheduleSave]);

  // Crear una tarjeta de decisión vacía «si pasa esto → hacé esto».
  const addDecision = useCallback((partial = {}) => {
    const node = {
      id: uid('d'), title: 'Nueva casuística', subtitle: '', lane: 'DEC',
      kind: 'decision', nodeType: 'decision', x: 120, y: 120, items: [],
      branches: [
        { id: uid('b'), cond: 'Si sale bien', ok: true, delayKind: 'd0', delayText: '0 días', chain: [] },
        { id: uid('b'), cond: 'Si pasa X', ok: false, delayKind: 'dwarn', delayText: '', chain: [{ id: uid('c'), type: 'action', text: 'Qué hacemos…' }] },
      ],
      ...partial,
    };
    commit((prev) => ({ ...prev, nodes: [...prev.nodes, node] }));
    return node.id;
  }, [commit]);

  return {
    board,
    roles: board?.roles || [],
    connections: board?.connections || [],
    phases: board?.phases || [],
    teamMembers: teamMembers || [],
    addNode, updateNode, moveNode, deleteNode,
    addItem, updateItem, deleteItem, toggleItem, moveItem,
    addConnection, deleteConnection,
    updatePhase,
    addDecision, addBranch, updateBranch, deleteBranch,
    addChainLine, updateChainLine, deleteChainLine,
    addRole, updateRole, deleteRole,
    resetBoard,
  };
}
