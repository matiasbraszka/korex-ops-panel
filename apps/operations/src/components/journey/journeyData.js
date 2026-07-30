// journeyData.js — datos semilla de la pizarra "Customer Journey".
//
// Porta el contenido del HTML suelto `Pizarra_Entrega_Korex_v3.html` (fases,
// carriles, gates y checklists) a un modelo de tarjetas libres para el lienzo
// tipo Miro. El equipo edita todo desde el panel; esto es solo el punto de
// partida la PRIMERA vez (después vive en app_settings.customer_journey).

export const BOARD_VERSION = 2;

// id corto y único sin depender de librerías.
let _seq = 0;
export function uid(prefix = 'n') {
  _seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${_seq.toString(36)}`;
}

// ── Catálogo de roles funcionales (editable) ────────────────────────────────
// Mismos roles y colores del diagrama v3. `id` es estable (se referencia desde
// los ítems); `label`/`color` son editables desde el panel.
export const DEFAULT_ROLES = [
  { id: 'AM',  label: 'AM',        color: '#3B82F6' },
  { id: 'CLI', label: 'Cliente',   color: '#F87171' },
  { id: 'PRG', label: 'Programador', color: '#22D3EE' },
  { id: 'DIS', label: 'Diseñador', color: '#C084FC' },
  { id: 'EDI', label: 'Editor',    color: '#F472B6' },
  { id: 'SIS', label: 'Sistema',   color: '#34D399' },
  { id: 'COM', label: 'Comercial', color: '#FBBF24' },
  { id: 'DIR', label: 'Director',  color: '#94A3B8' },
];

// Un `who` del v3 puede venir combinado ("AM+CLI"). Tomamos el primer rol como
// rol principal del ítem (el resto queda implícito en el texto).
function primaryRole(who) {
  if (!who) return null;
  const first = String(who).split('+')[0].trim();
  return DEFAULT_ROLES.some((r) => r.id === first) ? first : null;
}

// ── Carriles ────────────────────────────────────────────────────────────────
export const LANES = {
  A: { label: 'Cliente',          color: '#F87171' },
  B: { label: 'Estrategia + Copy', color: '#C084FC' },
  C: { label: 'Build + QA',       color: '#22D3EE' },
  D: { label: 'Tráfico + Finanzas', color: '#34D399' },
  G: { label: 'Gate / Hito',      color: '#FBBF24' },
};

// Bandas horizontales visibles detrás de las tarjetas (los 4 carriles del v3 +
// una franja para las casuísticas). y/h son coordenadas del "mundo": coinciden
// con dónde se siembran las tarjetas de cada carril.
export const LANE_BANDS = [
  { key: 'A',   label: 'Cliente',           sub: 'camino crítico',        color: '#F87171', y: 20,   h: 1400 },
  { key: 'B',   label: 'Estrategia + Copy', sub: 'termina el día 3-4',    color: '#C084FC', y: 1460, h: 1300 },
  { key: 'C',   label: 'Build + QA',        sub: 'listo esperando video', color: '#22D3EE', y: 2800, h: 1400 },
  { key: 'D',   label: 'Tráfico + Finanzas', sub: 'dos encendidos',       color: '#34D399', y: 4240, h: 1300 },
  { key: 'DEC', label: 'Casuísticas',       sub: 'si pasa esto → hacé esto', color: '#C084FC', y: 5580, h: 1900 },
];

// Versión de espaciado vertical: si sube, se migran los tableros guardados
// (se desplazan las tarjetas para acompañar las bandas más altas, sin perder nada).
export const SPACING_VERSION = 2;
const SPACING_SHIFT = { A: 0, B: 540, C: 1100, D: 1540, G: 0, DEC: 1940 };

export function migrateSpacing(board) {
  if (!board || board.spacing === SPACING_VERSION) return board;
  const nodes = (board.nodes || []).map((n) => ({ ...n, y: (n.y || 0) + (SPACING_SHIFT[n.lane] ?? 0) }));
  return { ...board, nodes, spacing: SPACING_VERSION };
}

// ── Contenido del v3 (fiel al HTML) ─────────────────────────────────────────
// Cada fase tiene celdas por carril; cada celda es una tarjeta con checklist.
// item = [texto, quién, tiempo]. Gates son tarjetas especiales (kind:'gate').
const PHASES = [
  {
    t: 'ALTA', sub: 'antes del Día 0',
    cells: {
      A: [{ t: 'Preparación del arranque', who: 'AM', m: [
        ['Asignar el AM responsable', 'DIR', '5 min'],
        ['Enviar el acuerdo + alarma de vencimiento', 'AM', '15 min'],
        ['Agendar la sesión de arranque del Día 0', 'AM', '10 min'],
        ['Firmar el acuerdo (gate del cobro)', 'CLI', '0-2 días'],
      ] }],
      D: [
        { t: 'Cierre y carga de la venta', who: 'COM', m: [
          ['Confirmar el pago acreditado (Mercury/Stripe/PST)', 'COM', '10 min'],
          ['Vincular el pago al client_id', 'COM', '5 min'],
          ['Completar el formulario de venta', 'COM', '10 min'],
        ] },
        { t: 'Disparo automático 24/7', who: 'SIS', m: [
          ['Cliente + factura + tareas + estrategia en el panel', 'SIS', 'auto'],
          ['Carpetas en Drive + doc de onboarding', 'SIS', 'auto'],
          ['Canal privado de Slack + equipo invitado', 'SIS', 'auto'],
          ['Aviso en #onboarding-clientes', 'SIS', 'auto'],
        ] },
      ],
    },
  },
  {
    t: 'GATE 1 · Día 0', sub: '19 prerrequisitos — no arranca el reloj sin esto', kind: 'gate', lane: 'G',
    m: [
      ['Pago verificado con client_id'], ['Acuerdo firmado + alarma'],
      ['Firmante = operador (o representación escrita)'],
      ['Formulario de onboarding enviado + sesión de iniciación a 48 h'],
      ['Interlocutor único + suplente (si comité)'], ['Kit de marca aprobado (si marca MLM)'],
      ['Dominio verificado + URL CONGELADA'], ['Pixel/dataset + Clarity + CAPI creados'],
      ['Chequeo del estado de la cuenta Meta (alternativa si ban)'],
      ['Nº WhatsApp Business confirmado con dueño'],
      ['Fecha FIRME de grabación + plan B pactado'],
      ['Checklist de recursos: dueño + fecha + plan B por ítem'],
      ['KPI comercial + modelo tiempo-a-hito FIRMADOS'],
      ['Lista de exclusión de audiencia cargada'], ['Tabla de claims del nicho relevada'],
      ['Alta operativa completa (canal, grupo, carpetas, ficha)'],
      ['Promesa de plazo en el log de compromisos'],
      ['Regla financiera activa (P2; pool → regla 9 + piloto)'],
      ['Lanzamiento rápido definido: 11 preguntas + agendamiento + expectativa de TESTEO por escrito'],
    ],
    rule: 'Un ítem en ⚠ pasa igual si sale con dueño + fecha + plan B escrito. 3+ ítems del cliente sin fecha → el Director decide si el reloj de la promesa arranca.',
  },
  {
    t: 'DÍA 0 · ARRANQUE', sub: 'todo lo congelable se congela hoy',
    cells: {
      A: [
        { t: 'Bienvenida y canal', who: 'AM', m: [
          ['Grupo «NOMBRE | EMPRESA | KOREX» con todos', 'AM', '10 min'],
          ['E-0: bienvenida + plan de 15 días — fija el EMAIL como canal legal (cl. 6.6)', 'AM', '10 min'],
          ['Cliente confirma proceso y plazos', 'CLI', '—'],
        ] },
        { t: 'Sesión de iniciación', who: 'AM+CLI', crit: true, m: [
          ['Formulario automatizado enviado (lo completa solo)', 'SIS', '5 min'],
          ['Sesión: mapa + paso a paso + expectativa de TESTEO', 'AM+CLI', '1,5-2 h'],
          ['Completar el formulario EN VIVO si llegó incompleto', 'AM', 'en sesión'],
          ['Fecha FIRME de grabación + plan B por escrito', 'AM+CLI', 'en sesión'],
          ['Checklist de recursos (dueño/fecha/plan B)', 'AM', 'en sesión'],
          ['Interlocutor único + kit de marca (si aplica)', 'AM+CLI', 'en sesión'],
          ['Grabar y archivar la sesión', 'AM', 'auto'],
        ] },
      ],
      B: [{ t: 'Avatar y oferta en borrador', who: 'AM', m: [
        ['Arrancar avatar + oferta con lo de la sesión', 'AM', '1-2 h'],
        ['Relevar la tabla de claims del nicho', 'AM', '1 h'],
      ] }],
      C: [
        { t: 'Infraestructura técnica', who: 'PRG', m: [
          ['Cuenta Korex + Supabase + fbclid + scoring', 'PRG', '0,5-1 día'],
          ['Accesos para el AM y el cliente', 'PRG', '15 min'],
        ] },
        { t: 'Dominio y activos digitales', who: 'AM', m: [
          ['Dominio registrado/verificado + URL CONGELADA', 'AM', '30-60 min'],
          ['FanPage del proyecto (identidad separada)', 'AM', '20 min'],
          ['Pixel/dataset + Clarity + CAPI + una CC por funnel', 'AM+PRG', '2-4 h'],
          ['Nº WhatsApp Business confirmado + conectado al BM', 'AM+CLI', '30 min'],
        ] },
        { t: 'Banco de respaldo', who: 'AM', m: [
          ['Branding básico si el cliente no tiene', 'AM+DIS', '1-2 h'],
          ['Búsqueda con IA de imágenes de él (Google/redes)', 'AM', '30-60 min'],
          ['Testimonios/reseñas públicas (Google/YouTube)', 'AM', '30 min'],
        ] },
      ],
      D: [
        { t: 'Cuenta y facturación', who: 'AM', m: [
          ['Cuenta de anuncios + tarjeta (PST.NET)', 'AM', '1-2 h'],
          ['Dominio verificado en Meta', 'AM', '15 min'],
          ['Chequeo del estado de la cuenta (ban/veto) + alternativa', 'AM', '1-2 h'],
        ] },
        { t: 'Reglas del juego firmadas', who: 'AM+CLI', m: [
          ['KPI comercial: cualificado, banda de CPL, criterio de corte', 'AM+CLI', '30 min'],
          ['Modelo tiempo-a-hito por gasto («a X/día tarda Y»)', 'AM+CLI', 'incluido'],
          ['Exclusión de audiencia propia cargada', 'AM', '30 min'],
          ['11 preguntas del formulario + link de agendamiento', 'AM+CLI', '30 min'],
          ['Expectativa de TESTEO por escrito', 'AM+CLI', '5 min'],
          ['Log de compromisos abierto con la promesa', 'AM', '10 min'],
        ] },
      ],
    },
  },
  {
    t: 'DÍAS 1-3', sub: 'producción en paralelo · copy congelado el día 3',
    cells: {
      A: [{ t: 'Revisión del paquete único', who: 'CLI', crit: true, m: [
        ['Recibir TODO junto el día 3 (guion VSL + ads + copy)', 'AM', 'día 3'],
        ['Leer y comentar EN el doc («SOLO LEER, no grabar»)', 'CLI', '48 h'],
        ['Corrección en una pasada + versión cerrada', 'AM', '1-2 h'],
      ] }],
      B: [
        { t: 'Guiones (el VSL primero)', who: 'AM', crit: true, m: [
          ['Guion del VSL — lo primero que se escribe', 'AM', '3-4 h'],
          ['Ads del FORMULARIO en formato selfie', 'AM', '1-2 h'],
          ['Ads de la LANDING VSL', 'AM', '1-2 h'],
          ['Todos por la tabla de claims antes de salir', 'AM', '30 min'],
        ] },
        { t: 'Copy del funnel — congelado día 3', who: 'AM', m: [
          ['Pre-landing (filtro de descarte) + landing + quiz + gracias', 'AM', '2-3 h'],
          ['CONGELAR: después, solo tickets de texto', 'AM', '—'],
        ] },
        { t: 'ENTREGA ÚNICA (día 3)', who: 'AM', kind: 'hito', m: [
          ['Paquete único: guion VSL + ads formulario + ads landing + copy', 'AM', '30 min'],
          ['Enviar con «SOLO LEER» + advertencia de costo', 'AM', '10 min'],
          ['E-2: este envío ACTIVA el reloj contractual de 10 días para grabar (cl. 6.4.a)', 'SIS', 'auto'],
          ['Agendar la revisión (ventana 48 h)', 'AM', '5 min'],
        ] },
      ],
      C: [
        { t: 'Checklist de material (día 2-3)', who: 'AM', kind: 'hito', m: [
          ['ANTES del diseño: con qué contamos (cliente o banco)', 'AM', '30 min'],
          ['Lo que falta queda con plan B decidido', 'AM', 'incluido'],
        ] },
        { t: 'Diseño + montaje de landing', who: 'DIS', m: [
          ['Diseñar con capacidad reservada', 'DIS', '1-2 días'],
          ['Montar: copy congelado + espacios provisorios + tracking', 'DIS+AM', '1 día'],
          ['QA por página al montarla', 'AM', '30 min/pág'],
        ] },
      ],
      D: [{ t: 'Campañas en borrador', who: 'AM', m: [
        ['Campañas VSL: CC por funnel, geo + avatar congelados', 'AM', '1-2 h'],
        ['Campaña de FORMULARIO: 11 preguntas → agendamiento', 'AM', '1 h'],
        ['Probar el formulario con un registro de prueba', 'AM', '15 min'],
        ['Captación orgánica con la lista del líder (desde el día 1)', 'AM+CLI', '1 h'],
      ] }],
    },
  },
  {
    t: 'DÍAS 3-5', sub: 'grabación (camino crítico) + primer encendido',
    cells: {
      A: [{ t: 'GRABACIÓN en bloque', who: 'CLI', crit: true, m: [
        ['Confirmar fecha 24 h antes + guía de grabación', 'AM', '10 min'],
        ['Grabar en bloque: VSL + ads landing + ads selfie', 'CLI', '1-2 días'],
        ['Subir todo a la carpeta', 'CLI', '—'],
      ] }],
      C: [
        { t: 'Recepción de grabaciones', who: 'AM', crit: true, kind: 'hito', m: [
          ['Checklist EL MISMO DÍA: calidad, audio, tomas', 'AM', '30 min'],
          ['Falla → regrabar SOLO el clip puntual', 'AM', '10 min'],
          ['Asignar edición (SLA 72 h hábiles + respaldo avisado)', 'AM', '10 min'],
        ] },
        { t: 'Edición ads selfie (prioridad)', who: 'EDI', m: [
          ['Los ads del formulario van PRIMERO en la cola', 'EDI', '72 h hábiles'],
        ] },
      ],
      D: [{ t: 'LANZAMIENTO RÁPIDO (día 4-6)', who: 'AM', kind: 'flash', m: [
        ['Verificar: cuenta + claims + formulario probado + agenda OK', 'AM', '30 min'],
        ['ENCENDER: anuncio selfie → formulario → agendamiento', 'AM', '15 min'],
        ['E-7: aviso de encendido + SLA de leads <1 día hábil (cl. 6.4.b)', 'AM', '10 min'],
        ['Saldo y facturación verificados', 'AM', '15 min'],
      ] }],
    },
  },
  {
    t: 'DÍAS 5-8', sub: 'ensamble + QA de punta a punta',
    cells: {
      A: [{ t: 'Revisión de diseño (1 ronda)', who: 'CLI', m: [
        ['Consolidar TODOS los cambios en una ronda', 'CLI', '1 día'],
        ['Falta material → V1 sin esa sección', 'AM', '—'],
      ] }],
      B: [{ t: 'Ajustes por dato de QA', who: 'AM', m: [
        ['Solo tickets de texto → no frenan el montaje', 'AM', 'según QA'],
      ] }],
      C: [
        { t: 'Edición VSL + ads landing', who: 'EDI', crit: true, m: [
          ['Editar el VSL (respaldo definido)', 'EDI', '72 h hábiles'],
          ['Editar los ads de landing', 'EDI', '72 h hábiles'],
          ['Versionar + copia de seguridad del VSL', 'AM', '10 min'],
        ] },
        { t: 'Ensamble + QA + lead de prueba', who: 'AM+PRG', crit: true, m: [
          ['Embeber el VSL final (reemplaza el provisorio)', 'AM', '30 min'],
          ['Pixel + CAPI deduplicados + Clarity sobre página VIVA', 'AM+PRG', '1 h'],
          ['QA de recorrido completo + QA móvil', 'AM', '1,5 h'],
          ['Lead de prueba hasta CRM + WhatsApp', 'AM', '30 min'],
          ['Integridad del panel (quiz, evento WA, duración VSL)', 'AM+PRG', '1 h'],
        ] },
      ],
      D: [{ t: 'Pre-encendido', who: 'AM', m: [
        ['Apuntar las campañas VSL a la URL final', 'AM', '30 min'],
        ['Re-verificar la exclusión tras el último cambio', 'AM', '10 min'],
      ] }],
    },
  },
  {
    t: 'GATE 2 · Lanzamiento', sub: '11 verificaciones — no se enciende sin esto (D7-9)', kind: 'gate', lane: 'G',
    m: [
      ['VSL final embebido (no provisorio)'],
      ['QA de recorrido: pre → landing → quiz → gracias → WhatsApp'],
      ['QA móvil: botón, nombres, fechas, precios'],
      ['Pixel + CAPI deduplicados · una CC por funnel'],
      ['Clarity registrando sesiones'],
      ['Lead de prueba de punta a punta hasta CRM + WhatsApp'],
      ['Integridad del panel verificada'],
      ['Cuenta activa, pago válido, dominio verificado'],
      ['Campañas: CC del funnel + geo/avatar/landing coherentes'],
      ['Exclusión verificada tras el ÚLTIMO cambio'],
      ['Presentación del sistema hecha + SLA de leads confirmado'],
    ],
    rule: 'Semáforo: VERDE = GO inmediato (el AM lanza sin pedir permiso) · ÁMBAR = GO condicionado con fecha · ROJO = NO GO + aviso proactivo ANTES de que el cliente pregunte.',
  },
  {
    t: 'DÍAS 8-10', sub: 'encendido del funnel VSL',
    cells: {
      A: [{ t: 'Presentación del sistema', who: 'AM+CLI', crit: true, m: [
        ['Reunión: funnel, CRM y métricas (nunca se pauta sin esto)', 'AM+CLI', '45-60 min'],
        ['SLA de respuesta confirmado con su equipo', 'AM+CLI', 'incluido'],
        ['Mensajes pre-armados + IA configurados', 'AM', '30 min'],
      ] }],
      C: [{ t: 'Monitoreo de eventos 48 h', who: 'AM', m: [
        ['Señal estable; caída = incidente el mismo día', 'AM', 'continuo'],
      ] }],
      D: [{ t: 'ENCENDIDO funnel VSL', who: 'AM', crit: true, m: [
        ['GO pre-autorizado: gate verde = se lanza', 'AM', '15 min'],
        ['Presupuesto según el modelo firmado (12-18 USD/día)', 'AM', 'incluido'],
        ['Verificar que los anuncios ENTREGAN (no solo activos)', 'AM', '30 min'],
        ['E-7 (funnel VSL) + registro en el log', 'AM', '10 min'],
      ] }],
    },
  },
  {
    t: 'DÍAS 10-15', sub: 'validación · una variable por vez',
    cells: {
      A: [{ t: 'El metro final', who: 'CLI', m: [
        ['Responder leads en SLA: Hyper <15 min · Qualif <2 h · Interes <24 h', 'CLI', 'continuo'],
        ['Auditar cualificados sin respuesta + reporte con datos', 'AM', '20 min/sem'],
      ] }],
      B: [{ t: 'Loop de copy', who: 'AM', m: [
        ['Objeciones del cerrador → copy y anuncios (quincenal)', 'AM', '1 h/quincena'],
      ] }],
      C: [{ t: 'Conciliación diaria', who: 'AM+SIS', m: [
        ['Leads Meta ↔ plataforma; desvío >10% = incidente', 'AM+SIS', '15 min/día'],
      ] }],
      D: [{ t: 'Optimización + informes', who: 'AM', m: [
        ['Diagnóstico diario: dónde se rompe el embudo, UNA variable', 'AM', '30 min/día'],
        ['Verificación post-cambio (Advantage+ deshace en silencio)', 'AM', '5 min/cambio'],
        ['El anuncio GANADOR del testeo pasa al funnel VSL', 'AM', '1 h'],
        ['E-8: informe diario (auto) + SEMANAL con formato fijo — sale siempre', 'AM', '30 min/sem'],
        ['Aviso proactivo ANTES de cualquier vencimiento', 'AM', '—'],
      ] }],
    },
  },
  {
    t: 'POR RESULTADO', sub: 'KPI → testimonio → red → ciclo N',
    cells: {
      A: [
        { t: 'KPI y conversión', who: 'AM', m: [
          ['KPI sobre panel íntegro (100 leads · ≥10% cualif · ≥20% interes)', 'AM', '1 h'],
          ['Acompañar la conversión lead → alta (el CPL es interno)', 'AM', 'continuo'],
        ] },
        { t: 'Testimonio y red', who: 'AM+CLI', m: [
          ['Testimonio en la primera venta (máxima motivación)', 'AM+CLI', '30 min'],
          ['Presentar a su red → sin cobrar antes de capacidad verificada', 'AM+CLI', '1 h'],
        ] },
      ],
      D: [{ t: 'Ciclo del networker', who: 'SIS+AM', m: [
        ['Alta 350 USD → recarga → reparto, con piloto validado', 'SIS+AM', '1-2 h'],
        ['Extractos semanales + conciliación del pool (descuadre = incidente)', 'SIS+AM', 'auto + 15 min'],
      ] }],
    },
  },
];

// ── Casuísticas «si pasa esto → hacé esto» (portadas del v3) ────────────────
// src = [índice de fase en PHASES, carril, índice dentro del carril] → tarjeta
// origen. Cada rama: cond (condición), ok (sigue el flujo o no), delay (chip de
// demora) y chain (cadena de acciones/escalada/mail/pregunta).
const TREES = [
  { id: 'C-01', src: [0, 'A', 0], br: [
    { c: 'Si firma en 48 h', ok: 1, d: ['d0', '0 días'], ch: [] },
    { c: 'Si NO firma', ok: 0, d: ['dwarn', 'el reloj NO arranca'], ch: [
      { m: 'E-1 por EMAIL (canal legal): día 1 recordatorio → día 2 llamada → día 5 aviso de no-arranque' },
      { a: 'Día 2: llamada + pantalla compartida (abogada si hace falta)' },
      { q: '¿Día 5 sin firma?' }, { e: 'Director · el cobro no se ejecuta' },
    ] },
  ] },
  { id: 'C-03', src: [2, 'A', 1], br: [
    { c: 'Si completa el formulario antes', ok: 1, d: ['d0', '0 días'], ch: [] },
    { c: 'Si llega incompleto', ok: 0, d: ['d0', '0 días — la sesión lo absorbe'], ch: [
      { a: 'Se completa JUNTOS en la sesión, sección por sección' },
      { q: '¿Quedan huecos igual?' }, { a: 'Responde por AUDIOS de WhatsApp a preguntas puntuales' },
    ] },
    { c: 'Si no hay forma de sacar la info', ok: 0, d: ['dbad', 'bloquea la estrategia'], ch: [
      { e: 'Director INMEDIATO — sin fundamento no se produce' },
    ] },
  ] },
  { id: 'C-06', src: [3, 'C', 0], br: [
    { c: 'Si los recursos llegan a fecha', ok: 1, d: ['d0', '0 días'], ch: [] },
    { c: 'Si NO llegan', ok: 0, d: ['d0', '0 días — NUNCA frena'], ch: [
      { a: 'Plan B sin volver a preguntar: banco de respaldo / espacio provisorio / V1 sin esa sección' },
      { a: 'El recurso pasa a V2 con recordatorio semanal' },
    ] },
    { c: 'Si faltan testimonios', ok: 0, d: ['d0', '0 días'], ch: [
      { a: 'MENÚ: grabados · fotos con cheques / como TOP / tamaño de su red · producto: YouTube + su red · mínimo 2-3 audios de 30 seg' },
      { a: 'Nada llega → V1 sin sección; V2 con los primeros resultados' },
    ] },
  ] },
  { id: 'C-07', src: [3, 'A', 0], br: [
    { c: 'Si revisa en 48 h', ok: 1, d: ['d0', '0 días'], ch: [{ a: 'Corrección en UNA pasada → se agenda la grabación' }] },
    { c: 'Si NO revisa', ok: 0, d: ['dwarn', '+1 a +3 días'], ch: [
      { a: 'Recordatorio + llamada' }, { m: 'Constancia por email si pasa de 48 h' },
      { a: 'Debate de posicionamiento → se resuelve por A/B test' },
      { q: '¿7 días sin revisar?' }, { e: 'Director · cláusula: 10 días sin avanzar habilita pausar' },
    ] },
  ] },
  { id: 'C-08', src: [4, 'A', 0], br: [
    { c: 'Si se graba en bloque', ok: 1, d: ['d0', '0 días'], ch: [] },
    { c: 'Si NO se graba', ok: 0, d: ['dwarn', '+2 a +4 días (SLA congelado)'], ch: [
      { a: 'Proponer bloque de 1-2 días con guiones pre-aprobados' },
      { m: 'E-3 (día +3) · E-4 (día +7) · E-5 (día +10: caducidad, cl. 6.4.a) — por EMAIL, automáticos' },
      { q: '¿Acepta fecha dentro de la ventana (7-10 días)?' }, { a: 'Fecha nueva al log + aviso proactivo al grupo' },
    ] },
    { c: 'Si no acepta y puede grabar su equipo', ok: 0, d: ['dwarn', '+1 a +2 días'], ch: [
      { a: 'Graba el DELEGADO (pactado en el onboarding); su versión entra como V2' },
    ] },
    { c: 'Si tiene que ser ÉL sí o sí', ok: 0, d: ['dwarn', '+2 a +3 días'], ch: [
      { a: 'VSL v0 con material EXISTENTE de él (redes, entrevistas) + anuncios de imagen del banco + reagenda express de 30-45 min solo para el gancho' },
      { q: '¿Vence la ventana igual?' },
      { m: 'Serie contractual E-6: 10 notificaciones por email · 6ª = Cliente Inactivo · 10ª = resolución (cl. 6.6)' },
      { e: 'Director + cláusula · reloj en pausa documentada' },
    ] },
  ] },
  { id: 'C-10', src: [5, 'A', 0], br: [
    { c: 'Si aprueba el diseño', ok: 1, d: ['d0', '0 días'], ch: [] },
    { c: 'Si pide cambios', ok: 0, d: ['dwarn', '+1 día'], ch: [
      { a: 'El interlocutor consolida TODOS los cambios en UNA ronda' },
      { q: '¿Sigue sin aprobar?' }, { a: '2ª ronda SOLO por error objetivo; lo subjetivo → A/B con datos' },
      { e: '5 días bloqueado → Director propone publicar V1' },
    ] },
  ] },
  { id: 'C-17', src: [2, 'D', 1], br: [
    { c: 'Si la cuenta está sana', ok: 1, d: ['d0', '0 días'], ch: [] },
    { c: 'Si hay ban / veto / herencia', ok: 0, d: ['dwarn', '+0 a +1 día (detectado HOY)'], ch: [
      { a: '1º cuenta de un tercero de confianza · 2º BM de respaldo + PST · 3º cuenta nueva con identidad separada' },
      { a: 'El desbloqueo de la original sigue EN PARALELO' },
    ] },
    { c: 'Si se descubre TARDE', ok: 0, d: ['dbad', '+1 a +3 semanas — por eso es tarea del Día 0'], ch: [
      { e: 'Misma escalera + recalibrar el plazo POR ESCRITO' },
    ] },
  ] },
  { id: 'C-19', src: [7, 'D', 0], br: [
    { c: 'Si Meta aprueba los anuncios', ok: 1, d: ['d0', '0 días'], ch: [] },
    { c: 'Si rechaza un anuncio', ok: 0, d: ['dwarn', '+0,5 a +1 día'], ch: [
      { a: 'Identificar la palabra gatillo → actualizar la tabla de claims (sirve para TODOS los clientes)' },
      { a: 'Ajustar, reenviar y revisar el resto del banco' },
      { q: '¿Rechazos repetidos?' }, { e: 'Tratar como cuenta marcada (escalera de C-17) antes del ban' },
    ] },
  ] },
  { id: 'C-20', src: [5, 'C', 1], br: [
    { c: 'Si la señal llega deduplicada', ok: 1, d: ['d0', '0 días'], ch: [] },
    { c: 'Si el pixel NO dispara', ok: 0, d: ['dwarn', '+0,5 a +1 día — el GO espera, el resto NO'], ch: [
      { a: 'Debug con el Programador: token, CAPI, fbclid' }, { a: 'Lead de prueba de punta a punta, de nuevo' },
      { e: 'Sin señal confirmada NO se enciende. Punto.' },
    ] },
  ] },
  { id: 'C-25', src: [5, 'C', 0], br: [
    { c: 'Si el editor entrega en SLA', ok: 1, d: ['d0', '0 días'], ch: [] },
    { c: 'Si está mudo 48 h', ok: 0, d: ['dwarn', '+1 a +2 días máx'], ch: [
      { a: 'Reasignación AUTOMÁTICA al respaldo — no se pregunta dos veces' },
      { a: 'El episodio queda registrado para la cartera de editores' },
    ] },
    { c: 'Si la grabación vino con fallas', ok: 0, d: ['dwarn', '+1 día'], ch: [
      { a: 'Se regraba SOLO el clip puntual (lo detectó el checklist de recepción)' },
    ] },
  ] },
  { id: 'C-29', src: [5, 'C', 1], br: [
    { c: 'Si el QA pasa limpio', ok: 1, d: ['d0', '0 días'], ch: [] },
    { c: 'Si aparece un bug', ok: 0, d: ['dwarn', '+0,5 a +1 día'], ch: [
      { a: 'Se reporta AL DETECTAR (nunca se acumula)' },
      { q: '¿Toca datos de usuarios o dinero?' }, { a: 'SÍ → pausa preventiva + fix prioritario · NO → ticket normal' },
      { a: 'No se cierra sin CASO DE VERIFICACIÓN (flujo real re-ejecutado)' },
    ] },
    { c: 'Si el bug REAPARECE', ok: 0, d: ['dbad', 'revisar causa estructural'], ch: [
      { e: 'Se reabre en el mismo incidente · 2 recaídas → Programador' },
    ] },
  ] },
  { id: 'C-11', src: [8, 'A', 0], br: [
    { c: 'Si responde dentro del SLA', ok: 1, d: ['d0', '0 días'], ch: [] },
    { c: 'Si NO responde los leads', ok: 0, d: ['dbad', 'no frena la entrega — quema VENTAS'], ch: [
      { a: 'IA + mensajes pre-armados cubren la primera respuesta' },
      { m: 'E-9: alerta por email con datos (cl. 6.4.b); la 3ª la firma Dirección' },
      { a: 'Reporte al líder CON DATOS: «X cualificados sin respuesta = Y ventas perdidas»' },
      { q: '¿2 reportes ignorados?' }, { e: 'Director interviene · se evalúa pausar pauta' },
    ] },
  ] },
  { id: 'C-40', src: [8, 'D', 0], br: [
    { c: 'Si entiende el testeo (se firmó Día 0)', ok: 1, d: ['d0', '0 días'], ch: [] },
    { c: 'Si presiona por resultados ya', ok: 0, d: ['d0', '0 días — se responde con el documento'], ch: [
      { a: 'Responder contra el modelo FIRMADO: banda de CPL, duración, tiempo-a-hito según SU gasto' },
      { m: 'E-8: informe semanal fijo — la vacuna contra la ansiedad' },
      { a: 'Informe fijo: qué se aprendió (anuncio ganador, costo por registro, agendamientos)' },
      { q: '¿Insiste en cortar?' }, { e: 'Director · si corta, firma que el test queda sin validez' },
    ] },
  ] },
];

function branchesFrom(tree) {
  return tree.br.map((b) => ({
    id: uid('b'),
    cond: b.c,
    ok: !!b.ok,
    delayKind: b.d[0],       // 'd0' | 'dwarn' | 'dbad'
    delayText: b.d[1],
    chain: (b.ch || []).map((c) => ({
      id: uid('c'),
      type: c.a ? 'action' : c.e ? 'esc' : c.m ? 'mail' : 'q',
      text: c.a || c.e || c.m || c.q || '',
    })),
  }));
}

// Orden vertical de los carriles en el lienzo.
const LANE_ORDER = ['A', 'B', 'C', 'D'];
// Geometría de la disposición inicial (todo movible después).
const COL_W = 460;   // ancho de columna por fase (deja lugar a las flechas)
const X0 = 60;
const LANE_Y = { A: 80, B: 1520, C: 2860, D: 4300 };
const GATE_Y = 40;
const DECISION_Y = 5640;   // banda inferior para las casuísticas
const CARD_BASE_H = 96;    // alto estimado de cabecera + padding
const ITEM_H = 40;         // alto estimado por ítem de checklist
const STACK_GAP = 34;

// Convierte el texto de tiempo del v3 a MINUTOS netos (mejor esfuerzo).
// Los ambiguos (días, continuo, SLA de horas hábiles, tasas «/día») quedan en
// null = "sin cargar", para que el equipo ponga el minutaje real.
export function parseMinutes(text) {
  if (text == null) return null;
  const t = String(text).toLowerCase().trim();
  if (!t || t === '—' || t === '-') return null;
  if (t.includes('auto')) return 0;
  if (/hábil|habil|continuo|incluido|sesión|sesion|día|dia|\/|semana|quincena|cambio/.test(t)) return null;
  const nums = (t.match(/\d+([.,]\d+)?/g) || []).map((n) => parseFloat(n.replace(',', '.')));
  if (!nums.length) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (t.includes('h')) return Math.round(avg * 60);
  return Math.round(avg); // "min" o número suelto
}

// Formatea minutos a texto legible: 90 -> "1 h 30 min".
export function formatMinutes(min) {
  if (min == null) return '—';
  if (min <= 0) return '0 min';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

// Migración: agrega `minutes` a los ítems que no lo tengan (una sola vez).
export function ensureMinutes(board) {
  if (!board || board.minutesReady) return board;
  const nodes = (board.nodes || []).map((n) => (
    n.items ? { ...n, items: n.items.map((it) => (it.minutes === undefined ? { ...it, minutes: parseMinutes(it.time) } : it)) } : n
  ));
  return { ...board, nodes, minutesReady: true };
}

function itemsFrom(m) {
  return (m || []).map(([text, who, time]) => ({
    id: uid('i'),
    text,
    done: false,
    roleId: primaryRole(who),
    personId: null,
    time: time && time !== '—' ? time : '',
    minutes: parseMinutes(time),
  }));
}

// Construye el estado inicial del tablero (nodos + conexiones + roles).
export function buildDefaultBoard() {
  const nodes = [];
  const connections = [];
  const srcMap = {};   // "pi:lane:idx" -> nodeId (primer nodo del carril)
  const gateMap = {};  // pi -> nodeId del gate
  const critById = {};
  const phaseX = [];
  let x = X0;
  const laneCursor = { A: LANE_Y.A, B: LANE_Y.B, C: LANE_Y.C, D: LANE_Y.D };

  PHASES.forEach((ph, pi) => {
    phaseX[pi] = x;
    if (ph.kind === 'gate') {
      const id = uid('g');
      nodes.push({ id, title: ph.t, subtitle: ph.sub, lane: 'G', kind: 'gate', nodeType: 'card', x, y: GATE_Y, note: ph.rule || '', items: itemsFrom(ph.m) });
      gateMap[pi] = id;
      x += COL_W;
      return;
    }
    for (const lane of LANE_ORDER) laneCursor[lane] = LANE_Y[lane];
    for (const lane of LANE_ORDER) {
      const cells = (ph.cells && ph.cells[lane]) || [];
      cells.forEach((cell, ni) => {
        const id = uid('n');
        const items = itemsFrom(cell.m);
        const kind = cell.kind || (cell.crit ? 'crit' : 'normal');
        if (cell.crit) critById[id] = true;
        nodes.push({ id, title: cell.t, subtitle: '', lane, kind, nodeType: 'card', x, y: laneCursor[lane], note: '', items });
        srcMap[`${pi}:${lane}:${ni}`] = id;
        laneCursor[lane] += CARD_BASE_H + items.length * ITEM_H + STACK_GAP;
      });
    }
    x += COL_W;
  });

  // Conexiones de flujo: por carril, del primer nodo de cada fase al de la
  // siguiente. Los gates actúan de eje entre todos los carriles (como en el v3).
  const firstOf = (pi, lane) => (PHASES[pi].kind === 'gate' ? gateMap[pi] : srcMap[`${pi}:${lane}:0`]);
  for (const lane of LANE_ORDER) {
    let prev = null, prevGate = false;
    PHASES.forEach((ph, pi) => {
      const cur = firstOf(pi, lane);
      if (!cur) return;
      const isGate = ph.kind === 'gate';
      if (prev) {
        const kind = (isGate || prevGate) ? 'gate' : ((critById[prev] && critById[cur]) ? 'crit' : 'flow');
        connections.push({ id: uid('w'), from: prev, to: cur, kind });
      }
      prev = cur; prevGate = isGate;
    });
  }

  // Casuísticas: una tarjeta de decisión por TREE, colgada de su tarjeta origen.
  const decStackByX = {};
  TREES.forEach((tree) => {
    const [pi, lane, idx] = tree.src;
    const srcId = srcMap[`${pi}:${lane}:${idx}`] || srcMap[`${pi}:${lane}:0`] || null;
    const colX = phaseX[pi] != null ? phaseX[pi] : X0;
    const stack = decStackByX[colX] || 0;
    const y = DECISION_Y + stack * 360;
    decStackByX[colX] = stack + 1;
    const id = uid('d');
    nodes.push({ id, title: tree.id, subtitle: '', lane: 'DEC', kind: 'decision', nodeType: 'decision', x: colX, y, branches: branchesFrom(tree), items: [] });
    if (srcId) connections.push({ id: uid('w'), from: srcId, to: id, kind: 'branch' });
  });

  return {
    version: BOARD_VERSION,
    spacing: SPACING_VERSION,
    minutesReady: true,
    roles: DEFAULT_ROLES.map((r) => ({ ...r })),
    nodes,
    connections,
    phases: PHASES.map((p, i) => ({ id: 'ph_' + i, t: p.t, sub: p.sub, x: phaseX[i], gate: p.kind === 'gate', res: p.t === 'POR RESULTADO' })),
    updatedAt: new Date().toISOString(),
  };
}

// Alto estimado de una tarjeta (para anclar flechas y auto-layout).
export function estimateNodeSize(node) {
  if (node.nodeType === 'decision') {
    const lines = (node.branches || []).reduce((a, b) => a + 1 + (b.chain?.length || 0), 0);
    return { w: 420, h: 70 + lines * 24 };
  }
  const base = node.kind === 'gate' ? 150 : 108;
  return { w: 330, h: base + (node.items?.length || 0) * 40 };
}
