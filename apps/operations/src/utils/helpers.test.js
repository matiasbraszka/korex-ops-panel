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
  userSeesTask,
  isReviewerOf,
  recomputeStartedDates,
  normalizeName,
  assigneeMatches,
  computeStatusDurations,
  getActiveSprint,
  sprintStubForMonday,
  upcomingSprintStubs,
  computeSprintDurations,
  departmentForAssignee,
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
  it('fallback NO infla el primer estado con createdDate viejo (roadmap)', () => {
    // Tarea creada hace 200 días (onboarding del cliente) con UN evento reciente.
    const task = { id: 'k6', status: 'in-progress', createdDate: isoDaysAgo(200) };
    const comments = [{ task_id: 'k6', kind: 'system', created_at: new Date(Date.now() - 3 * 864e5).toISOString(), event_meta: { field: 'status', from: 'priorizado', to: 'in-progress' } }];
    const { byStatus, current } = computeStatusDurations(task, comments);
    expect(byStatus['priorizado'] || 0).toBeLessThan(1); // NO ~197 días falsos
    expect(current.days).toBeLessThan(4);                 // ~3 días en curso
  });
});

describe('getActiveSprint (ignora sprints planned)', () => {
  const s27 = { id: 'sp_2026_27', startDate: '2026-06-29', status: 'active' };
  const s28 = { id: 'sp_2026_28', startDate: '2026-07-06', status: 'planned' };
  const s29 = { id: 'sp_2026_29', startDate: '2026-07-13', status: 'planned' };
  it('devuelve el active aunque un planned tenga fecha posterior', () => {
    expect(getActiveSprint([s29, s28, s27]).id).toBe('sp_2026_27');
  });
  it('en el fallback (sin active) nunca elige un planned', () => {
    const s26 = { id: 'sp_2026_26', startDate: '2026-06-22', status: 'closed' };
    expect(getActiveSprint([s29, s28, s26]).id).toBe('sp_2026_26'); // el closed más reciente, no un planned
  });
});

describe('sprintStubForMonday / upcomingSprintStubs', () => {
  it('arma el id sp_AAAA_SS, la semana ISO y las fechas correctas', () => {
    const s = sprintStubForMonday('2026-07-06'); // lunes de la semana 28
    expect(s.id).toBe('sp_2026_28');
    expect(s.number).toBe(28);
    expect(s.name).toBe('Sprint 28');
    expect(s.startDate).toBe('2026-07-06');
    expect(s.endDate).toBe('2026-07-12'); // +6 = domingo
    expect(s.status).toBe('active');
  });
  it('acepta status planned', () => {
    expect(sprintStubForMonday('2026-07-06', 'planned').status).toBe('planned');
  });
  it('devuelve los 2 sprints siguientes como planned', () => {
    const active = { id: 'sp_2026_27', startDate: '2026-06-29', endDate: '2026-07-05' };
    const next = upcomingSprintStubs(active, 2);
    expect(next.map(s => s.id)).toEqual(['sp_2026_28', 'sp_2026_29']);
    expect(next.every(s => s.status === 'planned')).toBe(true);
    expect(next[0].startDate).toBe('2026-07-06'); // lunes siguiente
    expect(next[1].startDate).toBe('2026-07-13');
  });
});

describe('computeSprintDurations (paso por sprints)', () => {
  const sprints = [
    { id: 'sp_2026_27', name: 'Sprint 27' },
    { id: 'sp_2026_28', name: 'Sprint 28' },
  ];
  it('mide el tiempo por sprint con eventos {sprint, at} y marca el actual', () => {
    const task = {
      id: 't1', status: 'in-progress', sprintId: 'sp_2026_28',
      sprintEvents: [
        { sprint: 'sp_2026_27', at: new Date(Date.now() - 10 * 864e5).toISOString() },
        { sprint: 'sp_2026_28', at: new Date(Date.now() - 3 * 864e5).toISOString() },
      ],
    };
    const { rows, current, hasHistory } = computeSprintDurations(task, sprints);
    expect(hasHistory).toBe(true);
    expect(rows.map(r => r.id)).toEqual(['sp_2026_27', 'sp_2026_28']);
    const r27 = rows.find(r => r.id === 'sp_2026_27');
    const r28 = rows.find(r => r.id === 'sp_2026_28');
    expect(r27.days).toBeGreaterThan(6); // ~7 días en sprint 27
    expect(r27.days).toBeLessThan(8);
    expect(r28.isCurrent).toBe(true);
    expect(r28.days).toBeGreaterThan(2); // ~3 días en curso en sprint 28
    expect(current.id).toBe('sp_2026_28');
    expect(current.name).toBe('Sprint 28');
  });
  it('una entrada con sprint:null cierra el segmento (no cuenta tras salir)', () => {
    const task = {
      id: 't2', status: 'backlog', sprintId: null,
      sprintEvents: [
        { sprint: 'sp_2026_27', at: new Date(Date.now() - 10 * 864e5).toISOString() },
        { sprint: null, at: new Date(Date.now() - 7 * 864e5).toISOString() },
      ],
    };
    const { rows, current } = computeSprintDurations(task, sprints);
    const r27 = rows.find(r => r.id === 'sp_2026_27');
    expect(r27.days).toBeGreaterThan(2); // ~3 días (de 10 a 7 atrás), NO 10
    expect(r27.days).toBeLessThan(4);
    expect(current).toBe(null); // ya no está en ningún sprint
  });
  it('tarea done: mide hasta la validación, no hasta ahora', () => {
    const task = {
      id: 't3', status: 'done', sprintId: 'sp_2026_27',
      validatedAt: new Date(Date.now() - 5 * 864e5).toISOString(),
      sprintEvents: [{ sprint: 'sp_2026_27', at: new Date(Date.now() - 12 * 864e5).toISOString() }],
    };
    const { rows } = computeSprintDurations(task, sprints);
    const r27 = rows.find(r => r.id === 'sp_2026_27');
    expect(r27.days).toBeGreaterThan(6); // ~7 días (de 12 a 5 atrás)
    expect(r27.days).toBeLessThan(8);
  });
  it('tarea vieja sin eventos: lista el sprint (sprintHistory) pero sin tiempo', () => {
    const task = { id: 't4', status: 'in-progress', sprintId: 'sp_2026_27', sprintHistory: ['sp_2026_27'], sprintEvents: [] };
    const { rows, hasHistory } = computeSprintDurations(task, sprints);
    expect(hasHistory).toBe(false);
    expect(rows.map(r => r.id)).toEqual(['sp_2026_27']);
    expect(rows[0].measured).toBe(false);
    expect(rows[0].isCurrent).toBe(true);
  });
  it('sin sprint ni historial devuelve rows vacío', () => {
    const { rows, current, hasHistory } = computeSprintDurations({ id: 't5', status: 'backlog', sprintId: null }, sprints);
    expect(rows).toEqual([]);
    expect(current).toBe(null);
    expect(hasHistory).toBe(false);
  });
});

describe('departmentForAssignee (área según responsable)', () => {
  const team = [
    { name: 'Marcos del Rey', department: 'programacion' },
    { name: 'Cristian Fernandez', department: 'ventas' },
    { name: 'Zil Oliveros', department: 'operaciones' },
    { name: 'Jose Martin', department: 'marketing' },
  ];
  it('resuelve por nombre completo', () => {
    expect(departmentForAssignee('Cristian Fernandez', team)).toBe('ventas');
  });
  it('resuelve por nombre de pila (apodo) y sin acento', () => {
    expect(departmentForAssignee('Zil', team)).toBe('operaciones');
    expect(departmentForAssignee('marcos', team)).toBe('programacion');
  });
  it('toma el PRIMER responsable si hay varios (CSV)', () => {
    expect(departmentForAssignee('Jose Martin, Cristian Fernandez', team)).toBe('marketing');
  });
  it('devuelve null si no hay responsable o no tiene área', () => {
    expect(departmentForAssignee('', team)).toBe(null);
    expect(departmentForAssignee('Cliente', team)).toBe(null);
    expect(departmentForAssignee('Alberto', team)).toBe(null);
  });
});

describe('normalizeName', () => {
  it('minúsculas, sin acentos, espacios colapsados', () => {
    expect(normalizeName('  Matías   Braszka ')).toBe('matias braszka');
    expect(normalizeName('JOSÉ')).toBe('jose');
    expect(normalizeName(null)).toBe('');
  });
});

describe('isReviewerOf (revisor ve la tarea solo en-revisión)', () => {
  it('matchea al revisor (nombre completo, sin acento) solo cuando está en-revisión', () => {
    const task = { status: 'en-revision', reviewer: 'Matías Braszka', assignee: 'Ana' };
    expect(isReviewerOf(task, 'Matias Braszka')).toBe(true);       // filtro sin acento
    expect(isReviewerOf({ ...task, status: 'in-progress' }, 'Matias Braszka')).toBe(false); // otro estado
  });
  it('no matchea si no es el revisor, o sin revisor, o filtro all/vacío', () => {
    const task = { status: 'en-revision', reviewer: 'Matías Braszka', assignee: 'Ana' };
    expect(isReviewerOf(task, 'Ana')).toBe(false);         // ana es responsable, no revisor
    expect(isReviewerOf({ status: 'en-revision', reviewer: null }, 'matias')).toBe(false);
    expect(isReviewerOf(task, 'all')).toBe(false);
    expect(isReviewerOf(task, '')).toBe(false);
  });
});

describe('userSeesTask (responsable o revisor en-revisión)', () => {
  const rev = { id: 'u9', name: 'Matías Braszka' };
  it('el responsable siempre la ve', () => {
    expect(userSeesTask({ assignee: 'Matias Braszka', status: 'backlog' }, rev)).toBe(true);
  });
  it('el revisor la ve solo cuando está en-revisión', () => {
    expect(userSeesTask({ assignee: 'Ana', reviewer: 'Matías Braszka', status: 'en-revision' }, rev)).toBe(true);
    expect(userSeesTask({ assignee: 'Ana', reviewer: 'Matías Braszka', status: 'in-progress' }, rev)).toBe(false);
  });
  it('sin relación, no la ve', () => {
    expect(userSeesTask({ assignee: 'Ana', reviewer: 'Pedro', status: 'en-revision' }, rev)).toBe(false);
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
