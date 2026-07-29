// Sanitizado mínimo del HTML que escribe el equipo (guías del DEL). No es una
// barrera contra un atacante —lo escribe el equipo, no el cliente— sino contra
// un copiar/pegar desde una web con basura adentro: sin scripts, iframes,
// handlers ni javascript: en los links.
//
// Vive acá y no dentro de una pantalla porque lo usan dos: el documento de un
// guion (las guías al principio) y la hoja de Guías del perfil.
export const limpiarHtml = (h) => String(h || '')
  .replace(/<\/(?:script|style|iframe|object|embed)>/gi, '')
  .replace(/<(?:script|style|iframe|object|embed)[^>]*>/gi, '')
  .replace(/\son\w+="[^"]*"/gi, '').replace(/\son\w+='[^']*'/gi, '')
  .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');

export default limpiarHtml;
