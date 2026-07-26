// ─────────────────────────────────────────────────────────────────────────────
// Datos de DEMO (cliente piloto: Sergio Cánovas).
//
// Se usan SOLO como fallback cuando las RPCs `portal_cliente_*` todavía no están
// desplegadas en Supabase (o cuando entras en "modo demo" sin sesión). Apenas las
// RPCs existan, portalApi.js usa los datos reales y esto queda ignorado.
//
// La FORMA de estos objetos ES el contrato que deben devolver las RPCs. Si cambiás
// algo aquí, reflejalo en migrations/portal_cliente_v2_rpcs.sql (y viceversa).
// ─────────────────────────────────────────────────────────────────────────────

export const MOCK_CLIENT = { id: 'demo-sergio', name: 'Sergio Cánovas', company: 'Sergio Cánovas' };

export const MOCK_HOME = {
  clientName: 'Sergio Cánovas',
  guionesTotal: 5,
  guionesGrabados: 2,
  videoSrc: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  pendingResources: [
    { id: 'autoridad', nombre: 'Fotos de Autoridad', subido: false, folderKey: 'autoridad' },
    { id: 'branding', nombre: 'Branding (colores, logo)', subido: false, folderKey: 'branding' },
    { id: 'productos', nombre: 'Foto de productos', subido: true, folderKey: 'productos' },
  ],
  pipelineNext: { fase: 'Edición de anuncios', fecha: '28/07/2026' },
};

export const MOCK_GUIONES = [
  { id: 'a1', tipo: 'Anuncio', avatar: 'Avatar 1 · Emprendedor', dur: '~45 seg', fecha: '18/07/2026', grabado: false, titulo: 'Deja de perseguir contactos', bloques: [
    { marca: '0-3s', label: 'Hook', texto: 'Si estás cansado de perseguir a amigos y familiares para que se sumen a tu negocio, quédate 30 segundos.' },
    { marca: '3-15s', label: 'Identificación', texto: 'Sé lo que se siente: mandar mensajes todos los días y que casi nadie te conteste. No es tu culpa, es el método que te enseñaron.' },
    { marca: '15-35s', label: 'Mecanismo', texto: 'Armé un sistema que muestra mi presentación a personas nuevas cada día, de forma automática. Yo hablo solo con las que ya la vieron.' },
    { marca: '35-45s', label: 'Cierre', texto: 'Toca el botón de aquí abajo y mira cómo funciona.' },
  ]},
  { id: 'a2', tipo: 'Anuncio', avatar: 'Avatar 1 · Emprendedor', dur: '~50 seg', fecha: '18/07/2026', grabado: true, titulo: 'Mi historia', bloques: [
    { marca: '0-4s', label: 'Hook', texto: 'Hace un año yo también le escribea a toda mi lista de contactos… y me sentía un vendedor pesado.' },
    { marca: '4-20s', label: 'Historia', texto: 'Todo cambió cuando dejé de perseguir gente y armé un sistema que trabaja por mí, incluso mientras duermo.' },
    { marca: '20-40s', label: 'Prueba', texto: 'Hoy hablo solo con personas que ya vieron mi presentación y quieren dar el paso.' },
    { marca: '40-50s', label: 'Cierre', texto: 'Mira el video para saber exactamente cómo lo hago.' },
  ]},
  { id: 'a3', tipo: 'Anuncio', avatar: 'Avatar 2 · Mamá emprendedora', dur: '~40 seg', fecha: '20/07/2026', grabado: false, titulo: 'La invitación', bloques: [
    { marca: '0-4s', label: 'Hook', texto: 'Si sos mamá y buscás un ingreso extra desde casa, sin descuidar a tus hijos, esto es para vos.' },
    { marca: '4-25s', label: 'Oferta', texto: 'Nada de vender a las amigas ni insistir en el grupo del cole. La gente llega ya interesada, desde tu celular.' },
    { marca: '25-40s', label: 'Cierre', texto: 'Registrate abajo y accedé a la presentación completa gratis.' },
  ]},
  { id: 'v1', tipo: 'VSL', avatar: 'Avatar 1 · Emprendedor', dur: '~6 min', fecha: '20/07/2026', grabado: false, titulo: 'VSL Principal · La oportunidad', bloques: [
    { marca: 'Bloque 1', label: 'Hook', texto: 'En los próximos minutos te voy a mostrar cómo construir un ingreso sin perseguir a tu familia ni a tus amigos.' },
    { marca: 'Bloque 2', label: 'Identificación', texto: 'Si ya probaste el multinivel de la forma tradicional, sabés lo agotador que es. Mensajes que nadie responde, gente que te evita. Te entiendo perfectamente.' },
    { marca: 'Bloque 3', label: 'Tu historia', texto: 'Cuenta en 30 segundos de dónde venís, qué probaste antes y qué te frenaba. Sé honesto, la gente conecta con lo real.' },
    { marca: 'Bloque 4', label: 'El problema real', texto: 'El problema no sos vos. Es que te enseñaron a vender a fuerza de insistir, cuando lo que funciona es que la gente llegue ya convencida.' },
    { marca: 'Bloque 5', label: 'El sistema', texto: 'Yo uso un sistema simple: un video que presenta la oportunidad, y publicidad que lo pone frente a personas nuevas cada día. Ellas deciden si quieren saber más.' },
    { marca: 'Bloque 6', label: 'Cómo funciona', texto: 'Paso uno: ven el video. Paso dos: las que se interesan dejan sus datos. Paso tres: yo hablo solo con esas. Nada de perseguir.' },
    { marca: 'Bloque 7', label: 'Prueba', texto: 'Cuenta un resultado concreto tuyo o de tu equipo. Un número, un caso real, algo que se pueda creer.' },
    { marca: 'Bloque 8', label: 'Cierre', texto: 'Si quieres que te muestre cómo armar esto en tu negocio, deja tus datos abajo y agendamos una llamada. Sin compromiso.' },
  ]},
  { id: 'v2', tipo: 'VSL', avatar: 'Avatar 2 · Mamá emprendedora', dur: '~5 min', fecha: '20/07/2026', grabado: false, titulo: 'VSL Principal · Para mamás', bloques: [
    { marca: 'Bloque 1', label: 'Hook', texto: 'En los próximos minutos te voy a mostrar cómo generar un ingreso desde casa, con tu celular, sin descuidar a tu familia.' },
    { marca: 'Bloque 2', label: 'Identificación', texto: 'Sé lo que es querer aportar en casa y sentir que no te alcanza el tiempo ni la plata. No estás sola.' },
    { marca: 'Bloque 3', label: 'Tu historia', texto: 'Cuenta tu situación real: por qué empezaste a buscar algo propio y qué quieres lograr para tu familia.' },
    { marca: 'Bloque 4', label: 'El problema real', texto: 'No necesitás vender a tus amigas ni llenar el grupo de WhatsApp. Eso cansa y no funciona.' },
    { marca: 'Bloque 5', label: 'El sistema', texto: 'Con un video y publicidad, personas nuevas ven la oportunidad cada día. Vos solo hablás con las que ya se interesaron.' },
    { marca: 'Bloque 6', label: 'Cómo funciona', texto: 'Ellas ven el video, dejan sus datos si les interesa, y vos las contactás. Todo desde el celular, en los ratos libres.' },
    { marca: 'Bloque 7', label: 'Cierre', texto: 'Si quieres que te muestre cómo empezar, deja tus datos abajo. Te acompaño paso a paso.' },
  ]},
// El texto que ve el cliente es el DEL COMPLETO, tal cual (sin fragmentar). En demo
// lo componemos a partir de los bloques; con datos reales viene de del_sections.text.
].map((g) => ({
  ...g,
  texto: g.texto || (g.bloques || []).map((b) => `${b.label}${b.marca ? ` (${b.marca})` : ''}\n${b.texto}`).join('\n\n'),
}));

// Carpetas: grabaciones (donde sube el cliente) + recursos del cliente.
export const MOCK_CARPETAS = [
  { key: 'sec-gr-anuncios', label: 'Grabaciones · Anuncios', labelColor: 'var(--color-blue-ink)', items: [
    { id: 'gr-an-av1', cardLabel: 'Avatar 1 · Emprendedor', group: 'grabacion', iconKey: 'film', count: 0, needed: true },
    { id: 'gr-an-av2', cardLabel: 'Avatar 2 · Mamá emprendedora', group: 'grabacion', iconKey: 'film', count: 0, needed: true },
  ]},
  { key: 'sec-gr-vsl', label: 'Grabaciones · VSL', labelColor: 'var(--color-purple)', items: [
    { id: 'gr-vsl-av1', cardLabel: 'Avatar 1 · Emprendedor', group: 'grabacion', iconKey: 'film', count: 0, needed: true },
    { id: 'gr-vsl-av2', cardLabel: 'Avatar 2 · Mamá emprendedora', group: 'grabacion', iconKey: 'film', count: 0, needed: true },
  ]},
  { key: 'sec-recursos', label: 'Recursos del cliente', labelColor: 'var(--color-text3)', items: [
    { id: 'autoridad', cardLabel: 'Fotos de Autoridad', group: 'recurso', iconKey: 'image', count: 0, needed: true },
    { id: 'estilo', cardLabel: 'Fotos Estilo de vida', group: 'recurso', iconKey: 'folder', count: 0 },
    { id: 'branding', cardLabel: 'Branding (colores, logo)', group: 'recurso', iconKey: 'folder', count: 0, needed: true },
    { id: 'productos', cardLabel: 'Foto de productos', group: 'recurso', iconKey: 'folder', count: 3, needed: true },
    { id: 'empresa', cardLabel: 'Material de la empresa', group: 'recurso', iconKey: 'folder', count: 0 },
    { id: 'ediciones', cardLabel: 'Ediciones (lo que te devolvemos)', group: 'ediciones', iconKey: 'sparkle', count: 2 },
  ]},
];

// Video de "cómo usar la plataforma" (se puede cambiar por un Loom/Bunny real).
export const INTRO_VIDEO = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

// Carpetas de recursos: SIEMPRE habilitadas, segmentadas con títulos bonitos.
// Cada una con su color e ícono propio (sin repetir) para dar jerarquía visual.
// `required: true` = importante; si está vacía se marca "Falta" para que el cliente
// se dé cuenta (branding, testimonios y accesos son los que más avisamos).
export const RECURSO_SECTIONS = [
  {
    titulo: 'Grabaciones', sub: 'Sube los videos que grabaste', iconKey: 'video', color: '#5B7CF5', bg: '#EEF2FF',
    items: [
      { id: 'grab-anuncios', label: 'Grabaciones · Anuncios', iconKey: 'camera', color: '#2E69E0', bg: '#EEF2FF', required: true },
      { id: 'grab-vsl', label: 'Grabaciones · VSL', iconKey: 'film', color: '#8B5CF6', bg: '#F5F3FF', required: true },
    ],
  },
  {
    titulo: 'Materiales', sub: 'Fotos y recursos de tu marca', iconKey: 'sparkles', color: '#DB2777', bg: '#FCE7F3',
    items: [
      { id: 'branding', label: 'Branding (colores, logo)', iconKey: 'palette', color: '#7C3AED', bg: '#EDE9FE', required: true },
      { id: 'testimonios', label: 'Testimonios', iconKey: 'quote', color: '#0891B2', bg: '#CFFAFE', required: true },
      { id: 'autoridad', label: 'Fotos de Autoridad', iconKey: 'award', color: '#D97706', bg: '#FEF3C7' },
      { id: 'productos', label: 'Foto de productos', iconKey: 'package', color: '#059669', bg: '#D1FAE5' },
      { id: 'estilo', label: 'Fotos Estilo de vida', iconKey: 'sun', color: '#E11D48', bg: '#FFE4E6' },
      { id: 'empresa', label: 'Material de la empresa', iconKey: 'building', color: '#0D9488', bg: '#CCFBF1' },
    ],
  },
  {
    titulo: 'Accesos', sub: 'Lo que necesitamos para publicar', iconKey: 'key', color: '#4338CA', bg: '#E0E7FF',
    items: [
      { id: 'accesos', label: 'Accesos (Meta, dominio, etc.)', iconKey: 'key', color: '#4338CA', bg: '#E0E7FF', required: true },
    ],
  },
];

// Estado de ejemplo (demo): qué carpetas ya tienen archivos. Con datos reales viene
// del funnel (conteo de funnel_resources por carpeta).
export const MOCK_RECURSO_COUNTS = { productos: 3 };
// Lista plana (para resolver el título en la pantalla de subida).
export const RECURSO_FOLDERS = RECURSO_SECTIONS.flatMap((s) => s.items);

export const MOCK_TUTORIALES = [
  { id: 't1', titulo: 'Cómo grabarte con el celular', dur: '2 min', url: '' },
  { id: 't2', titulo: 'Luz y encuadre en 1 minuto', dur: '1 min', url: '' },
  { id: 't3', titulo: 'Cómo subir tus archivos aquí', dur: '90 seg', url: '' },
  { id: 't4', titulo: 'Tips para hablar natural a cámara', dur: '3 min', url: '' },
];

// ── Funnels (el eje de todo) ─────────────────────────────────────────────────
// La Home lista los funnels en construcción; al entrar a uno se ven sus guiones
// (pestañas del DEL) y lo que tiene pendiente.
// `etapa` (1-4): en qué punto del pipeline está el funnel → Guion · Grabación · Edición · Publicado
export const MOCK_FUNNELS = [
  { id: 'f_reclu', name: 'Reclutamiento', status: 'borrador', estadoLabel: 'En construcción', guionesTotal: 4, guionesGrabados: 0, pendientes: 2, startDate: '2026-06-04', etapa: 2 },
  { id: 'f_abril', name: 'Reclutamiento · Abril 2026', status: 'activa', estadoLabel: 'Activo', guionesTotal: 3, guionesGrabados: 1, pendientes: 0, startDate: null, etapa: 4 },
  { id: 'f_tribu', name: 'Tribu Crecimiento Networkers', status: 'activa', estadoLabel: 'Activo', guionesTotal: 2, guionesGrabados: 0, pendientes: 0, startDate: null, etapa: 4 },
];

const FUNNEL_EXTRA = {
  f_reclu: {
    guiones: MOCK_GUIONES.slice(0, 4),
    pendientes: [
      { label: 'Imágenes nuevas', ok: false },
      { label: 'Respuesta de preguntas para Marketing', ok: false },
    ],
    folders: [
      { label: 'Anuncios (Audiovisuales)', url: '#' },
      { label: 'VSL (Audiovisuales)', url: '#' },
    ],
  },
  f_abril: {
    guiones: MOCK_GUIONES.slice(0, 3).map((g, i) => ({ ...g, grabado: i === 1 })),
    pendientes: [],
    folders: [],
  },
  f_tribu: {
    guiones: MOCK_GUIONES.slice(3, 5),
    pendientes: [],
    folders: [],
  },
};

// Avatares del funnel demo: alimentan las carpetas de grabación SEGMENTADAS
// (una carpeta de anuncios por avatar; el VSL es una sola por funnel).
export const MOCK_AVATARS = [
  { id: 'av1', name: 'Avatar 1 · Emprendedor' },
  { id: 'av2', name: 'Avatar 2 · Mamá emprendedora' },
];

export function mockFunnel(id) {
  const base = MOCK_FUNNELS.find((f) => f.id === id) || MOCK_FUNNELS[0];
  const extra = FUNNEL_EXTRA[id] || FUNNEL_EXTRA.f_reclu;
  return { ...base, ...extra, avatars: MOCK_AVATARS, recursos: MOCK_RECURSO_COUNTS };
}

export function mockGuion(id) {
  return MOCK_GUIONES.find((g) => String(g.id) === String(id)) || null;
}

// Tareas asignadas al cliente (contrato de portal_cliente_tareas): con funnel,
// prioridad y días desde que se creó. Al validarse en ops, desaparecen.
export const MOCK_TAREAS = [
  { id: 'mt1', titulo: 'Grabar los 3 anuncios del Avatar 1', prioridad: 'alta', dias: 4, funnel: 'Reclutamiento', funnelId: 'f_reclu', vence: null },
  { id: 'mt2', titulo: 'Revisar el borrador de tu página y dejar comentarios', prioridad: 'normal', dias: 2, funnel: 'Reclutamiento', funnelId: 'f_reclu', vence: null },
];

// Conteo de archivos por carpeta a nivel cliente (contrato de portal_cliente_recursos).
export const MOCK_RECURSOS = { productos: 3, autoridad: 12 };

// ── Portal v2 (diseño nuevo) — contratos de las RPCs v10 ─────────────────────
export const MOCK_INICIO = {
  name: 'Sergio Cánovas',
  progreso: 45,
  todosTerminados: false,
  whatsapp: '5491100000000',
  pendientes: [
    { tipo: 'grabacion_ads', titulo: 'Graba tus anuncios', descripcion: 'Los guiones ya están escritos en tu documento del embudo Reclutamiento. Cada uno dura menos de un minuto.', dias: 6, bloqueante: false, estado: 'pendiente', strategyId: 'f_reclu', docTipo: 'ads', target: null, subidos: 0, bucket: 'ad_rec' },
    { id: 'pp1', tipo: 'fotos', titulo: '5 fotos tuyas de autoridad', descripcion: 'De frente y mirando a cámara: son las que van en tu página y en tus anuncios. Con fotos del celular alcanza.', dias: 12, bloqueante: false, estado: 'pendiente', target: 5, subidos: 3, bucket: 'autoridad', strategyId: null },
    { id: 'pp4', tipo: 'fotos', titulo: 'Fotos de tu estilo de vida', descripcion: 'Tu día a día: trabajando, de viaje, con tu familia o tu equipo. Le dan vida real a tu marca. Hasta 10.', dias: 12, bloqueante: false, estado: 'pendiente', target: 10, subidos: 0, bucket: 'estilo_vida', strategyId: null },
    { id: 'pp2', tipo: 'acceso_meta', titulo: 'Danos acceso a Meta', descripcion: 'Sin esto no podemos publicar tus anuncios. Te dejamos el paso a paso con capturas.', dias: 9, bloqueante: true, estado: 'pendiente', target: null, subidos: 0, bucket: null, strategyId: null },
  ],
  completados: [{ titulo: 'Tu logo y tus colores' }],
};

export const MOCK_META = { partnerId: '1284 5590 3311', whatsapp: '5491100000000', agenda: '', estado: 'pendiente' };

// "Tus guiones para grabar" (contrato de portal_cliente_guiones v14).
export const MOCK_GUIONES_LISTA = [
  { id: 'g1', strategyId: 'f_reclu', docTipo: 'ads', funnel: 'Reclutamiento', titulo: 'Deja de perseguir contactos', snippet: 'Si estás cansado de perseguir a amigos y familiares para que se sumen a tu negocio, quédate 30 segundos.', palabras: 110, grabado: false, entregado: false },
  { id: 'g2', strategyId: 'f_reclu', docTipo: 'ads', funnel: 'Reclutamiento', titulo: 'El domingo por la noche', snippet: '¿Te pasa que los domingos a la noche te preguntas si esta es la vida que querías? Tienes capacidad, ganas y años de trabajo encima.', palabras: 95, grabado: false, entregado: false },
  { id: 'g3', strategyId: 'f_reclu', docTipo: 'vsl', funnel: 'Reclutamiento', titulo: 'VSL Avatar 1', snippet: 'En los próximos 6 minutos te voy a mostrar el sistema que uso para hablar solo con personas que ya vieron mi presentación completa.', palabras: 360, grabado: false, entregado: true },
];

export function mockDocumento(strategyId, tipo) {
  const t = ['vsl', 'avatar', 'estrategia'].includes(tipo) ? tipo : 'ads';
  const docs = {
    ads: { existe: true, titulo: 'Anuncios', pendiente: true, listo: false },
    vsl: { existe: true, titulo: 'VSL', pendiente: false, listo: true },
    avatar: { existe: true, titulo: 'Avatar 1 — Emprendedores' },
    estrategia: { existe: true },
  };
  const otros = [{ id: 'f_tribu', name: 'Tribu Networkers' }, { id: 'f_abril', name: 'Reclutamiento · Abril' }];
  const base = { funnel: { id: strategyId || 'f_reclu', name: 'Reclutamiento' }, tipo: t, avatars: MOCK_AVATARS, docs, otros };

  if (t === 'avatar') {
    return {
      ...base, titulo: 'Avatar 1 — Emprendedores', bucket: null, comentarios: [], subidas: { count: 0, items: [] }, siguiente: null,
      secciones: [{ id: 'sec_av1', titulo: 'Avatar 1 — Emprendedores', grabado: false, avatar: '', texto: 'DOLORES EXTERNOS\nTrabajan o tienen autoempleo que les consume muchas horas. Sus ingresos cubren las facturas pero no permiten construir la vida que realmente quieren.\nDOLORES INTERNOS\nSensación de estancamiento crónico. Frustración de saber que tienen capacidad pero no encontrar el vehículo correcto.\nMIEDOS\nMiedo a equivocarse otra vez y enfocarse en el proyecto incorrecto.' }],
    };
  }
  if (t === 'estrategia') {
    return {
      ...base, titulo: 'Embudo Reclutamiento', bucket: null, comentarios: [], subidas: { count: 0, items: [] }, siguiente: null,
      secciones: [{ id: 'sec_es1', titulo: 'Estrategia del embudo', grabado: false, avatar: '', texto: 'PROMESA CENTRAL\nHablas solo con personas que ya vieron tu presentación completa. Nada de perseguir amigos ni contactos en frío.\nRECORRIDO\nAnuncio en Meta → pre-landing con tu historia → VSL de 6 minutos → formulario de calificación → tu llamada.\nQUÉ NECESITAMOS DE TI\nLos videos de tus anuncios, el VSL grabado, 5 fotos y el acceso a tu Meta. Con eso lanzamos.' }],
    };
  }
  const guiones = MOCK_GUIONES.filter((g) => (t === 'vsl' ? g.tipo === 'VSL' : g.tipo !== 'VSL'));
  return {
    ...base,
    titulo: t === 'vsl' ? 'VSL — Reclutamiento' : 'Anuncios — Reclutamiento',
    bucket: t === 'vsl' ? 'vsl_rec' : 'ad_rec',
    secciones: guiones.map((g, i) => ({ id: g.id, titulo: g.titulo, texto: g.texto, html: '', grabado: i === 1, avatar: g.avatar })),
    comentarios: [
      { id: 'c1', sectionId: guiones[0]?.id, body: 'Aquí prefiero decir el sistema que te enseñaron', quote: 'No es tu culpa, es el método que te enseñaron.', parentId: null, resolved: false, authorName: 'Sergio Cánovas', isTeam: false, isCliente: true, createdAt: new Date().toISOString() },
    ],
    subidas: t === 'vsl' ? { count: 1, items: [{ titulo: 'vsl-toma-final.mp4', fecha: '22/07' }] } : { count: 0, items: [] },
    siguiente: t === 'vsl' ? null : { strategyId: strategyId || 'f_reclu', tipo: 'vsl', label: 'VSL · Reclutamiento' },
  };
}

export const MOCK_EMBUDOS = [
  { id: 'f_reclu', name: 'Reclutamiento', etapa: 2, progreso: 40, etiqueta: 'te_toca', razon: 'Esperando tus grabaciones', grabPendiente: { pend: true, dias: 6 }, pagina: null, startDate: '2026-07-02' },
  { id: 'f_tribu', name: 'Tribu Networkers', etapa: 4, progreso: 100, etiqueta: 'al_aire', razon: 'Publicado y corriendo', grabPendiente: { pend: false, dias: 0 }, pagina: 'canovasteam.com/tribu', startDate: '2026-05-12' },
  { id: 'f_abril', name: 'Reclutamiento · Abril', etapa: 4, progreso: 100, etiqueta: 'al_aire', razon: 'Publicado y corriendo', grabPendiente: { pend: false, dias: 0 }, pagina: 'canovasteam.com/oportunidad', startDate: '2026-04-04' },
];

export const MOCK_MATERIAL = {
  grabaciones: [
    { funnel: 'Reclutamiento', strategyId: 'f_reclu', tipo: 'ads', titulo: 'Anuncios grabados', subidos: 0, estado: 'falta', dias: 6, ultimo: null },
    { funnel: 'Reclutamiento', strategyId: 'f_reclu', tipo: 'vsl', titulo: 'VSL grabado', subidos: 1, estado: 'subido', dias: 6, ultimo: 'vsl-toma-final.mp4' },
    { funnel: 'Tribu Networkers', strategyId: 'f_tribu', tipo: 'ads', titulo: 'Anuncios grabados', subidos: 4, estado: 'subido', dias: 0, ultimo: 'ad-4.mp4' },
  ],
  marca: [
    { id: 'pp1', tipo: 'fotos', titulo: '5 fotos tuyas de autoridad', bucket: 'autoridad', target: 5, subidos: 3, dias: 12, bloqueante: false, estado: 'pendiente' },
    { id: 'pp3', tipo: 'logo', titulo: 'Tu logo y tus colores', bucket: 'branding', target: null, subidos: 4, dias: 20, bloqueante: false, estado: 'completo' },
  ],
  accesoMeta: 'pendiente',
  devoluciones: [
    { funnel: 'Reclutamiento', strategyId: 'f_reclu', count: 3, ultimo: '23/07', nuevo: true, items: [
      { titulo: 'Deja de perseguir contactos', url: '', kind: 'video', bucket: 'ad_edit', fecha: '23/07' },
      { titulo: 'El domingo por la noche', url: '', kind: 'video', bucket: 'ad_edit', fecha: '23/07' },
      { titulo: 'VSL Avatar 1', url: '', kind: 'video', bucket: 'vsl_edit', fecha: '23/07' },
    ] },
  ],
  paginas: [{ funnel: 'Reclutamiento · Abril', url: 'canovasteam.com/oportunidad' }],
};

// Accesos del cliente (contrato de portal_cliente_accesos).
export const MOCK_ACCESOS = [
  { label: 'CRM Korex', url: 'https://metodokorex.com', email: 'demo@cliente.com', password: 'demo1234', notes: '' },
];

// Historial de movimientos (contrato de portal_cliente_movimientos).
export const MOCK_MOVIMIENTOS = [
  { texto: 'Guion listo para grabar: VSL Principal', fecha: '20/07/2026', tipo: 'guion' },
  { texto: 'Subiste "VSL P01.mp4"', fecha: '21/07/2026', tipo: 'subida' },
  { texto: 'Te devolvimos "Anuncio 1 · editado"', fecha: '22/07/2026', tipo: 'devolucion' },
];

export const MOCK_PIPELINE = {
  progreso: 45,
  todosTerminados: false,
  fases: [
    { id: 'f1', nombre: 'Onboarding y estrategia', estado: 'hecho', fecha: '10/07/2026', detalle: 'Reunión inicial y definición de avatares.' },
    { id: 'f2', nombre: 'Guiones listos', estado: 'hecho', fecha: '20/07/2026', detalle: 'VSL y anuncios escritos y aprobados.' },
    { id: 'f3', nombre: 'Grabación (tú)', estado: 'en_curso', fecha: '26/07/2026', detalle: 'Grabas los guiones y subes los videos aquí.' },
    { id: 'f4', nombre: 'Edición de anuncios', estado: 'pendiente', fecha: '28/07/2026', detalle: 'Editamos tus grabaciones y te las devolvemos.' },
    { id: 'f5', nombre: 'Armado del funnel', estado: 'pendiente', fecha: '02/08/2026', detalle: 'Landing, formulario y páginas listas.' },
    { id: 'f6', nombre: 'Publicación y ads', estado: 'pendiente', fecha: '05/08/2026', detalle: 'Salimos a publicidad y empezamos a medir.' },
  ],
  // Historial de operaciones (contrato: eventos de historial_eventos con incluir_resumen).
  eventos: [
    { fecha: '22/07/2026', titulo: 'Ajustamos la segmentación de los anuncios del Avatar 1', descripcion: '', tipo: 'tarea', estado: 'completado' },
    { fecha: '20/07/2026', titulo: 'Llamada de seguimiento: revisamos los guiones y quedaron aprobados', descripcion: '', tipo: 'llamada', estado: 'completado' },
    { fecha: '15/07/2026', titulo: 'Arrancamos el armado de tu funnel de reclutamiento', descripcion: 'Estructura de páginas y primer borrador del VSL.', tipo: 'hito', estado: 'completado' },
  ],
};
