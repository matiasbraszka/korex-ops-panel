// Fechas de una auditoría del DEL, escritas como las diría una persona.
// Van en su propio archivo (y no dentro de AuditoriaHeader.jsx) para no romper el
// refresco en caliente del editor: un archivo de componentes solo exporta componentes.

// 'YYYY-MM-DD' → Date local. new Date('2026-07-01') se interpreta como medianoche
// UTC y en Argentina se ve como el 30 de junio: hay que partir la cadena a mano.
export const aFecha = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
};

// 1 de julio
export const diaMes = (s) => aFecha(s)?.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) || '';
// 1 jul
export const diaMesCorto = (s) => aFecha(s)?.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) || '';

// "Del 1 al 31 de julio" cuando el período cae en un mismo mes; "Del 28 de junio al
// 4 de julio" cuando lo cruza. Con un solo extremo cargado, lo dice como puede.
export function textoPeriodo(desde, hasta) {
  const d = aFecha(desde); const h = aFecha(hasta);
  if (!d && !h) return '';
  if (d && !h) return `Desde el ${diaMes(desde)}`;
  if (!d && h) return `Hasta el ${diaMes(hasta)}`;
  const mismoMes = d.getMonth() === h.getMonth() && d.getFullYear() === h.getFullYear();
  return mismoMes ? `Del ${d.getDate()} al ${diaMes(hasta)}` : `Del ${diaMes(desde)} al ${diaMes(hasta)}`;
}

// Título por defecto de una auditoría nueva. En el índice lateral se distinguen por
// cuándo se hicieron, así que la fecha va en el nombre.
export const tituloAuditoria = (fecha) =>
  `Auditoría · ${diaMesCorto(fecha) || new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`;
