// Emparejar videos de Voomly con un cliente/funnel.
//
// vsl_voomly NO tiene client_id: los videos vienen de la cuenta de Voomly sin ningún
// vínculo con el cliente, así que lo único que hay para relacionarlos es el NOMBRE.
// Por eso acá NO se filtra ni se esconde nada: se PUNTÚA y se ordena, y el equipo
// confirma cuál es. Esconder por coincidencia de nombre escondería el video correcto
// justo cuando el nombre no coincide, que es el caso en el que más ayuda haría.
//
// Vivía suelto adentro de FunnelsView; acá lo comparten las dos pantallas que lo usan
// (el selector de VSL del funnel y el picker de las carpetas de recursos).

// Normaliza un nombre de video/cliente para matchear (sin extensión, sin "vsl", sin acentos).
export function normVoomly(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\.(mp4|mov|webm|m4v)$/i, '').replace(/\bvsl\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Ordena una lista de vsl_voomly dejando arriba lo que más se parece al cliente/funnel.
// Cada fila vuelve con `_match` en true si tuvo alguna coincidencia de nombre.
export function ordenarVoomlyPorCliente(rows, ...contexto) {
  const tokens = new Set(
    normVoomly(contexto.filter(Boolean).join(' ')).split(' ').filter((t) => t.length > 2),
  );
  return (rows || [])
    .map((r) => {
      const n = normVoomly(r.name);
      const suyos = new Set(n.split(' ').filter(Boolean));
      let score = 0;
      for (const t of tokens) { if (suyos.has(t)) score += 2; else if (n.includes(t)) score += 1; }
      return { r, score };
    })
    .sort((a, b) => b.score - a.score
      || (b.r.total_plays || 0) - (a.r.total_plays || 0)
      || String(b.r.uploaded_at || '').localeCompare(String(a.r.uploaded_at || '')))
    .map((x) => ({ ...x.r, _match: x.score > 0 }));
}
