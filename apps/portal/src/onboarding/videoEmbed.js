// Convierte el link que uno copia de la barra del navegador en el que acepta un
// <iframe>. Loom, YouTube, Vimeo, Drive y Bunny publican dos URLs distintas: la de
// COMPARTIR y la de INCRUSTAR. La de compartir se niega a mostrarse dentro de otra
// página, así que pegarla dejaba un recuadro con error y no había forma de saber por qué.
//
// Se resuelve al MOSTRAR y no al guardar a propósito: así también quedan arregladas
// las que ya estaban cargadas mal, sin que nadie tenga que volver a pegarlas.
//
// Si no reconoce el servicio, devuelve la URL tal cual: un embed propio (Bunny,
// Wistia, lo que sea) tiene que seguir funcionando.
export function urlEmbed(url) {
  const u = String(url || '').trim();
  if (!u) return '';

  // Loom:  /share/<id>  →  /embed/<id>
  let m = u.match(/loom\.com\/share\/([A-Za-z0-9]+)/);
  if (m) return `https://www.loom.com/embed/${m[1]}`;

  // YouTube:  watch?v=<id>  ·  youtu.be/<id>  ·  /shorts/<id>  →  /embed/<id>
  m = u.match(/youtube\.com\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{6,})/)
    || u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/)
    || u.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;

  // Vimeo:  vimeo.com/<id>  →  player.vimeo.com/video/<id>
  m = u.match(/^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;

  // Drive:  /file/d/<id>/view  →  /file/d/<id>/preview
  m = u.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/);
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;

  // Bunny:  /play/<lib>/<guid>  →  /embed/<lib>/<guid>
  m = u.match(/iframe\.mediadelivery\.net\/play\/(\d+)\/([A-Za-z0-9-]+)/);
  if (m) return `https://iframe.mediadelivery.net/embed/${m[1]}/${m[2]}`;

  return u;
}
