import { describe, it, expect } from 'vitest';
import {
  today,
  initials,
  daysBetween,
  mondayOf,
  weekDatesOf,
  getBullets,
  ensureBulletIds,
  serializeBullets,
  isTaskEnabled,
  isTimerRunning,
  userOwnsTask,
  recomputeStartedDates,
  normalizeName,
  assigneeMatches,
  computeStatusDurations,
} from './helpers';

const isoDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

describe('today', () => {
  it('devuelve YYYY-MM-DD en hora local', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const d = new Date();
    expect(today()).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
  });
});

describe('initials', () => {
  it('toma las primeras letras de las dos primeras palabras', () => {
    expect(initials('Matias Braszka')).toBe('MB');
    expect(initials('Ana')).toBe('A');
    expect(initials('maria jesus del rey')).toBe('MJ');
  });
});

describe('daysBetween', () => {
  it('cuenta dias entre fechas ISO', () => {
    expect(daysBetween('2026-06-01', '2026-06-12')).toBe(11);
    expect(daysBetween('2026-06-12', '2026-06-01')).toBe(-11);
    expect(daysBetween('2026-06-12', '2026-06-12')).toBe(0);
  });
  it('devuelve null si falta una fecha', () => {
    expect(daysBetween(null, '2026-06-12')).toBeNull();
    expect(daysBetween('2026-06-12', '')).toBeNull();
  });
});

describe('mondayOf', () => {
  it('un miercoles cae al lunes de esa semana', () => {
    // 2026-06-10 es miercoles → lunes 2026-06-08
    expect(mondayOf('2026-06-10')).toBe('2026-06-08');
  });
  it('un lunes se devuelve a si mismo', () => {
    expect(mondayOf('2026-06-08')).toBe('2026-06-08');
  });
  it('un domingo cae al lunes ANTERIOR (semana ISO)', () => {
    // 2026-06-14 es domingo → lunes 2026-06-08
    expect(mondayOf('2026-06-14')).toBe('2026-06-08');
  });
  it('cruza limites de mes', () => {
    // 2026-07-01 es miercoles → lunes 2026-06-29
    expect(mondayOf('2026-07-01')).toBe('2026-06-29');
  });
});

describe('weekDatesOf', () => {
  it('devuelve los 7 dias Lun→Dom', () => {
    const week = weekDatesOf('2026-06-08');
    expect(week).toHaveLength(7);
    expect(week[0]).toBe('2026-06-08');
    expect(week[6]).toBe('2026-06-14');
  });
  it('cruza limites de mes', () => {
    const week = weekDatesOf('2026-06-29');
    expect(week[0]).toBe('2026-06-29');
    expect(week[2]).toBe('2026-07-01');
  });
});

describe('getBullets', () => {
  it('formato nuevo: devuelve bullets con categoria validada', () => {
    const item = {
      client_id: 'c1',
      bullets: [
        { id: 'b1', text: 'Hice X', category: 'entregable' },
        { id: 'b2', text: 'Avance Y', category: 'avance' },
        { id: 'b3', text: 'Otra cosa', category: 'inventada' },
      ],
    };
    const out = getBullets(item);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ id: 'b1', text: 'Hice X', category: 'entregable' });
    expect(out[2].category).toBeNull(); // categoria desconocida → null
  });
  it('formato legacy: parsea lineas de `text` como bullets sin categoria', () => {
    const item = { client_id: 'c1', text: '- hice una cosa\n• otra cosa\n\n' };
    const out = getBullets(item);
    expect(out).toHaveLength(2);
    expect(out[0].text).toBe('hice una cosa');
    expect(out[1].text).toBe('otra cosa');
    expect(out[0].category).toBeNull();
    expect(out[0].id).toMatch(/^bx_/); // id deterministico de fallback
  });
  it('item vacio o null devuelve []', () => {
    expect(getBullets(null)).toEqual([]);
    expect(getBullets({})).toEqual([]);
  });
});

describe('ensureBulletIds', () => {
  it('asigna id a bullets que no lo tienen y respeta los existentes', () => {
    const input = [
      { client_id: 'c1', bullets: [{ id: 'b1', text: 'a' }, { text: 'b' }] },
    ];
    const out = ensureBulletIds(input);
    expect(out[0].bullets[0].id).toBe('b1');
    expect(out[0].bullets[1].id).toMatch(/^b_/);
  });
  it('no rompe con input no-array', () => {
    expect(ensureBulletIds(null)).toBeNull();
    expect(ensureBulletIds(undefined)).toBeUndefined();
  });
});

describe('serializeBullets', () => {
  it('arma el texto legacy con guiones', () => {
    expect(serializeBullets([{ text: 'uno' }, { text: ' dos ' }, { text: '' }])).toBe('- uno\n- dos');
    expect(serializeBullets(null)).toBe('');
  });
});

describe('isTaskEnabled / isTimerRunning', () => {
  const dep = { id: 't1', templateId: 'tpl1', status: 'in-progress' };
  const depDone = { id: 't1', templateId: 'tpl1', status: 'done' };

  it('bloqueada nunca esta habilitada', () => {
    expect(isTaskEnabled({ status: 'blocked' }, [])).toBe(false);
  });
  it('con dependencia sin terminar no esta habilitada (por id o templateId)', () => {
    expect(isTaskEnabled({ status: 'backlog', dependsOn: ['t1'] }, [dep])).toBe(false);
    expect(isTaskEnabled({ status: 'backlog', dependsOn: ['tpl1'] }, [dep])).toBe(false);
    expect(isTaskEnabled({ status: 'backlog', dependsOn: ['t1'] }, [depDone])).toBe(true);
  });
  it('el timer no corre en done ni en estados que pausan', () => {
    expect(isTimerRunning({ status: 'done' }, [])).toBe(false);
    expect(isTimerRunning({ status: 'blocked' }, [])).toBe(false);
    expect(isTimerRunning({ status: 'in-progress' }, [])).toBe(true);
  });
});

describe('userOwnsTask', () => {
  const user = { id: 'u1', name: 'Matias Braszka' };
  it('matchea por nombre completo, primer nombre o id (CSV)', () => {
    expect(userOwnsTask({ assignee: 'Matias Braszka' }, user)).toBe(true);
    expect(userOwnsTask({ assignee: 'matias' }, user)).toBe(true);
    expect(userOwnsTask({ assignee: 'Ana, u1' }, user)).toBe(true);
    expect(userOwnsTask({ assignee: 'Ana, Pedro' }, user)).toBe(false);
  });
  it('sin assignee o sin usuario devuelve false', () => {
    expect(userOwnsTask({ assignee: '' }, user)).toBe(false);
    expect(userOwnsTask({ assignee: 'matias' }, null)).toBe(false);
  });
  it('ignora acentos y espacios extra en el nombre', () => {
    const u = { id: 'u2', name: 'Matías Braszka' };
    expect(userOwnsTask({ assignee: 'Matias Braszka' }, u)).toBe(true);   // sin acento
    expect(userOwnsTask({ assignee: '  matías  ' }, u)).toBe(true);        // espacios + acento
    expect(userOwnsTask({ assignee: 'Ana, Matías' }, { id: 'x', name: 'matias' })).toBe(true);
  });
});

describe('computeStatusDurations (tiempo en el estado actual)', () => {
  it('sin log de cambios, una tarea in-progress mide desde startedDate, NO desde la creación', () => {
    const task = { id: 'k1', status: 'in-progress', createdDate: isoDaysAgo(30), startedDate: isoDaysAgo(5) };
    const { current } = computeStatusDurations(task, []);
    // ~5 días (desde startedDate), no ~30 (desde createdDate).
    expect(current.days).toBeLessThan(10);
    expect(current.days).toBeGreaterThan(3);
  });
  it('sin log, una tarea en backlog sí mide desde la creación', () => {
    const task = { id: 'k2', status: 'backlog', createdDate: isoDaysAgo(8), startedDate: null };
    const { current } = computeStatusDurations(task, []);
    expect(current.days).toBeGreaterThan(6);
  });
  it('usa status_history (fuente nueva): tiempo por estado real + estado actual', () => {
    const task = {
      id: 'k4', status: 'in-progress', createdDate: isoDaysAgo(40),
      statusHistory: [
        { status: 'priorizado', at: new Date(Date.now() - 10 * 864e5).toISOString() },
        { status: 'in-progress', at: new Date(Date.now() - 3 * 864e5).toISOString() },
      ],
    };
    const { current, byStatus, hasHistory } = computeStatusDurations(task, []);
    expect(hasHistory).toBe(true);
    expect(current.days).toBeGreaterThan(2);
    expect(current.days).toBeLessThan(4); // ~3 días en curso, NO 40
    expect(byStatus['priorizado']).toBeGreaterThan(6); // ~7 días priorizado
  });
  it('sin historial devuelve hasHistory=false', () => {
    const { hasHistory } = computeStatusDurations({ id: 'k5', status: 'in-progress', createdDate: isoDaysAgo(5), startedDate: isoDaysAgo(2) }, []);
    expect(hasHistory).toBe(false);
  });
  it('con log de cambios, mide desde el último evento de estado', () => {
    const task = { id: 'k3', status: 'in-progress', createdDate: isoDaysAgo(30), startedDate: isoDaysAgo(20) };
    const comments = [{ task_id: 'k3', kind: 'system', created_at: new Date(Date.now() - 2 * 864e5).toISOString(), event_meta: { field: 'status', from: 'priorizado', to: 'in-progress' } }];
    const { current } = computeStatusDurations(task, comments);
    expect(current.days).toBeLessThan(4); // ~2 días desde el evento
  });
});

describe('normalizeName', () => {
  it('minúsculas, sin acentos, espacios colapsados', () => {
    expect(normalizeName('  Matías   Braszka ')).toBe('matias braszka');
    expect(normalizeName('JOSÉ')).toBe('jose');
    expect(normalizeName(null)).toBe('');
  });
});

describe('assigneeMatches', () => {
  it('all/vacío matchea todo; compara sin acentos', () => {
    expect(assigneeMatches('Ana', 'all')).toBe(true);
    expect(assigneeMatches('Ana', '')).toBe(true);
    expect(assigneeMatches('Matías, Ana', 'matias')).toBe(true);
    expect(assigneeMatches('Ana, Pedro', 'matias')).toBe(false);
    expect(assigneeMatches('', 'ana')).toBe(false);
  });
});

describe('recomputeStartedDates', () => {
  it('habilitada sin startedDate arranca hoy y calcula dueDate desde daysFromUnblock', () => {
    const tasks = [
      { id: 't1', clientId: 'c1', status: 'backlog', startedDate: null, dueDate: null, daysFromUnblock: 3, dependsOn: [] },
    ];
    const out = recomputeStartedDates(tasks);
    expect(out[0].startedDate).toBe(today());
    expect(out[0].dueDate).not.toBeNull();
    expect(daysBetween(out[0].startedDate, out[0].dueDate)).toBe(3);
  });
  it('no habilitada con startedDate la limpia; done no se toca', () => {
    const dep = { id: 'd1', clientId: 'c1', status: 'in-progress' };
    const tasks = [
      dep,
      { id: 't2', clientId: 'c1', status: 'backlog', startedDate: '2026-06-01', dependsOn: ['d1'] },
      { id: 't3', clientId: 'c1', status: 'done', startedDate: '2026-05-01', completedDate: '2026-05-05', dependsOn: [] },
    ];
    const out = recomputeStartedDates(tasks);
    expect(out[1].startedDate).toBeNull();
    expect(out[2].startedDate).toBe('2026-05-01');
  });
});
