import { describe, it, expect } from 'vitest';
import { parseAssignees, diffTaskFields, diffBulletsByTaskLink, bulletsToComplete } from './taskActivity';

describe('parseAssignees', () => {
  it('parsea CSV con espacios y vacios', () => {
    expect(parseAssignees('Ana, Pedro ,, ')).toEqual(['Ana', 'Pedro']);
    expect(parseAssignees('')).toEqual([]);
    expect(parseAssignees(null)).toEqual([]);
  });
});

describe('diffTaskFields', () => {
  const base = { status: 'backlog', dueDate: '2026-06-15', phase: 'setup', assignee: 'Ana' };

  it('sin cambios devuelve []', () => {
    expect(diffTaskFields(base, { ...base })).toEqual([]);
  });
  it('detecta cambio de status y dueDate', () => {
    const events = diffTaskFields(base, { ...base, status: 'in-progress', dueDate: '2026-06-20' });
    expect(events).toContainEqual({ field: 'status', from: 'backlog', to: 'in-progress' });
    expect(events).toContainEqual({ field: 'dueDate', from: '2026-06-15', to: '2026-06-20' });
  });
  it('assignee se desarma en add/remove por persona', () => {
    const events = diffTaskFields(base, { ...base, assignee: 'Pedro, Ana, Juan' });
    expect(events).toContainEqual({ field: 'assignee', op: 'add', value: 'Pedro' });
    expect(events).toContainEqual({ field: 'assignee', op: 'add', value: 'Juan' });
    expect(events.filter((e) => e.op === 'remove')).toEqual([]);
  });
  it('normaliza undefined/null como sin cambio', () => {
    expect(diffTaskFields({ ...base, dueDate: undefined }, { ...base, dueDate: null })).toEqual([]);
  });
  it('prev o next faltante devuelve []', () => {
    expect(diffTaskFields(null, base)).toEqual([]);
    expect(diffTaskFields(base, null)).toEqual([]);
  });
});

describe('diffBulletsByTaskLink', () => {
  it('emite bullets nuevos con task_id y cambios de task_id', () => {
    const prev = [{ bullets: [{ id: 'b1', text: 'a', task_id: 't1' }, { id: 'b2', text: 'b' }] }];
    const next = [{
      bullets: [
        { id: 'b1', text: 'a', task_id: 't1' },        // sin cambio → no emite
        { id: 'b2', text: 'b', task_id: 't2' },        // gano task_id → emite
        { id: 'b3', text: 'c', task_id: 't3' },        // nuevo con task_id → emite
        { id: 'b4', text: 'd' },                        // nuevo sin task_id → no emite
      ],
    }];
    const out = diffBulletsByTaskLink(prev, next);
    expect(out.map((b) => b.id)).toEqual(['b2', 'b3']);
  });
});

describe('bulletsToComplete', () => {
  it('solo entregables con complete_task=true nuevos o recien marcados', () => {
    const prev = [{ bullets: [{ id: 'b1', task_id: 't1', category: 'entregable', complete_task: true }] }];
    const next = [{
      bullets: [
        { id: 'b1', task_id: 't1', category: 'entregable', complete_task: true },  // ya estaba → no
        { id: 'b2', task_id: 't2', category: 'entregable', complete_task: true },  // nuevo → si
        { id: 'b3', task_id: 't3', category: 'avance', complete_task: true },      // no entregable → no
        { id: 'b4', task_id: 't4', category: 'entregable' },                        // sin flag → no
      ],
    }];
    expect(bulletsToComplete(prev, next).map((b) => b.id)).toEqual(['b2']);
  });
});
