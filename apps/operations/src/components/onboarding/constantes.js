/**
 * Las listas cerradas del constructor del onboarding.
 *
 * Están acá y no en la base a propósito: son la contraparte de lo que el código
 * sabe hacer. Un tipo de pregunta que el portal no sabe renderizar, o una
 * columna que `onboarding_writeback` no sabe escribir, no tienen por qué poder
 * elegirse desde un desplegable.
 */

export const TIPOS = [
  { value: 'abierta',     label: 'Respuesta larga (con micrófono)' },
  { value: 'corta',       label: 'Una línea' },
  { value: 'opciones',    label: 'Elegir una opción' },
  { value: 'chips_multi', label: 'Elegir varias (pastillas)' },
  { value: 'archivos',    label: 'Subir archivos' },
  { value: 'presupuesto', label: 'Presupuesto (USD/mes)' },
  { value: 'agenda',      label: 'Agenda' },
  { value: 'info',        label: 'Tarjeta informativa (no se responde)' },
  { value: 'resumen',     label: 'Control de calidad final' },
];

/**
 * La lista blanca de destinos.
 *
 * Tiene que coincidir con el `case` que está dentro de
 * `onboarding_writeback()`: el mapeo es dato editable, pero las columnas
 * escribibles son código. Si esto fuera texto libre, el editor de preguntas
 * sería un permiso de escritura arbitraria sobre la tabla `clients`.
 */
export const COLUMNAS_DESTINO = [
  { kind: 'clients',        col: 'company',            label: 'Cliente · Empresa' },
  { kind: 'clients',        col: 'niche',              label: 'Cliente · Nicho' },
  { kind: 'clients',        col: 'team_name',          label: 'Cliente · Nombre del equipo' },
  { kind: 'clients',        col: 'country',            label: 'Cliente · País' },
  { kind: 'clients',        col: 'phone',              label: 'Cliente · Teléfono' },
  { kind: 'clients',        col: 'brand_font',         label: 'Cliente · Tipografía de marca' },
  { kind: 'clients',        col: 'brand_colors',       label: 'Cliente · Colores de marca' },
  { kind: 'clients',        col: 'ads_budget_monthly', label: 'Cliente · Presupuesto mensual' },
  { kind: 'strategy_pages', col: 'tipo',               label: 'Funnel · Tipo (producto/reclutamiento/mixto)' },
  { kind: 'strategy_pages', col: 'punto_dif',          label: 'Funnel · Punto diferencial' },
  { kind: 'strategy_pages', col: 'official_domain',    label: 'Funnel · Dominio' },
  { kind: 'strategy_pages', col: 'whatsapp_leads',     label: 'Funnel · WhatsApp de leads' },
];

/** Las carpetas de recursos del cliente. Son las que ya usa el panel. */
export const BUCKETS = [
  { value: 'autoridad',   label: 'Fotos de autoridad' },
  { value: 'estilo_vida', label: 'Estilo de vida' },
  { value: 'productos',   label: 'Productos' },
  { value: 'empresa',     label: 'Material de la empresa' },
  { value: 'testimonios', label: 'Testimonios' },
  { value: 'branding',    label: 'Branding' },
  { value: 'sin_clasif',  label: 'Sin clasificar' },
];

/** Los íconos de portada. Son los paths del prototipo, con nombre en castellano. */
export const ICONOS = [
  { nombre: 'Calendario',   path: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
  { nombre: 'Persona',      path: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { nombre: 'Objetivo',     path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11.6a.4.4 0 1 0 0 .8.4.4 0 0 0 0-.8z' },
  { nombre: 'Maletín',      path: 'M4 7h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 12h20' },
  { nombre: 'Equipo',       path: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  { nombre: 'Caja',         path: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v9' },
  { nombre: 'Crecimiento',  path: 'M22 7l-8.5 8.5-4-4L2 19M16 7h6v6' },
  { nombre: 'Bifurcación',  path: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15 6H9a3 3 0 0 0-3 3v3' },
  { nombre: 'Megáfono',     path: 'M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6' },
  { nombre: 'Terreno',      path: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7' },
  { nombre: 'Micrófono',    path: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3' },
  { nombre: 'Embudo',       path: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z' },
  { nombre: 'Historial',    path: 'M12 8v4l3 2M3.05 11a9 9 0 1 1 .5 4M3 4v5h5' },
  { nombre: 'Base de datos', path: 'M12 3c4.97 0 9 1.34 9 3s-4.03 3-9 3-9-1.34-9-3 4.03-3 9-3zM3 6v12c0 1.66 4.03 3 9 3s9-1.34 9-3V6M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3' },
  { nombre: 'Gráfico',      path: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' },
  { nombre: 'Globo',        path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.6 5.5 3.6 9s-1.1 6.5-3.6 9c-2.5-2.5-3.6-5.5-3.6-9S9.5 5.5 12 3z' },
  { nombre: 'WhatsApp',     path: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' },
  { nombre: 'Llave',        path: 'M21 2l-2 2M11.4 11.6a5 5 0 1 1-7.1 7.1 5 5 0 0 1 7.1-7.1zM11.4 11.6L15.5 7.5M15.5 7.5l3 3L22 7l-3-3-3.5 3.5z' },
  { nombre: 'Escudo',       path: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4' },
  { nombre: 'Subir',        path: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12' },
  { nombre: 'Delegado',     path: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM16 11l2 2 4-4' },
  { nombre: 'Cámara',       path: 'M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z' },
  { nombre: 'Verificado',   path: 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4l-10 10-3-3' },
];

/** Deja un texto listo para ser una clave: sin acentos, sin espacios. */
export const slugQkey = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  .slice(0, 40);

/** Una pregunta nueva, con los valores por defecto de la tabla. */
export const vacia = (skey, pantalla, orden) => ({
  skey, pantalla, orden,
  label: '', sublabel: '', cabecera: '', cabecera_sub: '',
  ayuda_md: '', ejemplo: '', placeholder: '',
  chips: [], qtype: 'corta', opciones: [],
  voz: false, requerida: true, min_chars: 0, largo_objetivo: 0,
  max_opciones: null, input_mode: '', min_altura: null,
  info_kicker: '', info_titulo: '', info_cuerpo: '',
  archivo_cta: '', archivo_hint: '', archivo_accept: '', archivo_multiple: true,
  solo_dia: false, dias_minimos: 7, visible_si: null,
  bucket_key: null, target_count: null,
  target_kind: null, target_column: null, target_mode: 'fill',
  peso: 1, minutos: 1, plantilla_ord: 999, plantilla_ref: '',
  video_url: null, checklist_previa: null, activa: true,
});

export const vacioPaso = (bkey, orden) => ({
  bkey, orden, badge: '', eyebrow: '', titulo: 'Paso nuevo', subtitulo: '',
  para_que: '', icono: '', una_por_pantalla: false, minutos: 3,
  checkpoint: false, promesa: '', intro_md: '', video_url: null, activa: true,
});

export const vacioBloque = (bkey, orden) => ({
  bkey, orden, nombre: 'Fase nueva', corto: 'NUEVA', titulo: '', descripcion: '', activa: true,
});
