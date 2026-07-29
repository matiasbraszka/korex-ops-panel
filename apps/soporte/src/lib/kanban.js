// Las 5 columnas del tablero de seguimiento.
//
// La clave (k) la calcula la vista wa_conversations_seguimiento en la base; acá
// solo vive como se ve. Mismo molde que SPRINT_COLUMNS en operations.
//
// auto:true  -> la columna es MECANICA: sale de quien mando el ultimo mensaje y
//               hace cuanto. No se puede "mover" una conversacion ahi: pasa sola.
// auto:false -> es una marca manual (wa_conversations.estado). Esas dos son las
//               unicas que escribe una persona.
export const COLUMNAS = [
  {
    k: 'SIN_RESPONDER', label: 'Sin responder', dot: '#EF4444', auto: true,
    ayuda: 'El ultimo mensaje es del contacto y nadie contesto todavia. Sale sola al responder.',
  },
  {
    k: 'A_RESPONDER_HOY', label: 'A responder hoy', dot: '#F59E0B', auto: false, estado: 'responder_hoy',
    ayuda: 'Tu cola del dia. La marcas vos.',
  },
  {
    k: 'ESPERANDO_CONTACTO', label: 'Esperando al contacto', dot: '#3B82F6', auto: true,
    ayuda: 'Respondimos y falta que conteste. Aca el reloj del tiempo de respuesta se pausa.',
  },
  {
    k: 'SEGUIMIENTO', label: 'Seguimiento', dot: '#8B5CF6', auto: false, estado: 'seguimiento',
    ayuda: 'Agendada para una fecha. Cuando llega el dia vuelve sola a "A responder hoy".',
  },
  {
    k: 'CERRADO', label: 'Cerrado', dot: '#9CA3AF', auto: true, estado: 'cerrado',
    ayuda: 'Sin actividad hace 7 dias, o cerrada a mano. Reabre sola con un mensaje nuevo.',
  },
];

// Acciones del menu de cada tarjeta: que se escribe en wa_conversations.
// null = sacar la marca y volver a lo automatico.
export const ACCIONES = [
  { estado: 'responder_hoy', label: 'A responder hoy', dot: '#F59E0B' },
  { estado: 'seguimiento', label: 'Seguimiento…', dot: '#8B5CF6', pideFecha: true },
  { estado: 'cerrado', label: 'Cerrar', dot: '#9CA3AF' },
  { estado: null, label: 'Sacar la marca', dot: '#D1D5DB' },
];

// "3 h" / "2 d" / "5 sem" — el dato que manda en la columna Sin responder.
export function fmtEspera(horas) {
  if (horas == null) return '';
  if (horas < 1) return 'recién';
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 14) return `${dias} d`;
  return `${Math.floor(dias / 7)} sem`;
}

// Rojo cuando ya pasa de un dia sin responder: el p90 del canal es 33 h y ese
// es justamente el numero que hay que bajar.
export function colorEspera(horas, columna) {
  if (columna !== 'SIN_RESPONDER' || horas == null) return '#9098A4';
  if (horas >= 24) return '#DC2626';
  if (horas >= 4) return '#B45309';
  return '#9098A4';
}
