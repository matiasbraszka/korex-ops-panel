// Arma el historial del cliente a partir de los informes DIARIOS: cada bullet
// `entregable` / `avance` se convierte en un evento candidato. La idempotencia la
// da `source_bullet_id` (el id estable del bullet); el caller dedupea contra los
// eventos ya existentes antes de insertar.
import { getBullets } from '../../utils/helpers';

// Mapea el texto a una de las categorías (tipos) configuradas. Default 'entregable'.
export function suggestTipo(text, keys = []) {
  const t = (text || '').toLowerCase();
  const has = (k) => keys.includes(k);
  if (has('metrica') && /\d/.test(t) && /%|cpl|cpm|ctr|roas|cpa|\$|usd|eur|\blead|registro|conversi|impresion|clicks?|gasto|spend|\bcac\b|\broi\b/.test(t)) return 'metrica';
  if (has('llamada') && /llamad|reuni[oó]n|\bcall\b|\bmeet|zoom/.test(t)) return 'llamada';
  if (has('Testimonio') && /testimoni|rese[ñn]a|\breview|caso de [eé]xito/.test(t)) return 'Testimonio';
  if (has('decision') && /decisi[oó]n|decidim|definim|se decidi|\bacord/.test(t)) return 'decision';
  if (has('Seguimiento') && /seguimiento|follow.?up|recordatori/.test(t)) return 'Seguimiento';
  return has('entregable') ? 'entregable' : (keys[0] || 'entregable');
}

// Extrae URLs sueltas del texto → links [{ url }].
export function extractUrls(text) {
  const re = /(https?:\/\/[^\s)]+)|(\bwww\.[^\s)]+)/gi;
  const found = (text || '').match(re) || [];
  return found.map((u) => ({ url: /^https?:\/\//i.test(u) ? u : 'https://' + u }));
}

// Reparte `total` minutos entre `n` ítems de forma exacta (el resto va a los primeros).
function splitMinutes(total, n) {
  const m = Math.max(0, Math.round(Number(total) || 0));
  if (n <= 0) return [];
  const base = Math.floor(m / n);
  let rem = m - base * n;
  return Array.from({ length: n }, () => base + (rem-- > 0 ? 1 : 0));
}

/**
 * Construye los eventos candidatos a importar al historial de un cliente desde
 * los informes DIARIOS. Devuelve objetos con el shape de frontend que espera
 * createEvento/createEventosBulk, cada uno con `source_bullet_id`.
 */
export function buildImportEvents(teamReports, clienteId, teamMembers, tipoKeys = []) {
  if (!clienteId) return [];
  const memberById = {};
  (teamMembers || []).forEach((m) => { memberById[m.id] = m; });

  const out = [];
  (teamReports || []).forEach((r) => {
    if (r?.report_type !== 'daily' || !r?.report_date) return;
    const author = memberById[r.user_id];
    const autorUser = author ? {
      id: author.id, name: author.name,
      avatar_url: author.avatar_url || author.avatar || '',
      color: author.color || '#5B7CF5', initials: author.initials || '',
    } : null;

    (r.progress_by_client || []).forEach((p) => {
      if (p.client_id !== clienteId) return;
      const bullets = getBullets(p).filter((b) => b.category === 'entregable' || b.category === 'avance');
      if (bullets.length === 0) return;
      const mins = splitMinutes(p.minutes, bullets.length);
      bullets.forEach((b, i) => {
        const text = (b.text || '').trim();
        if (!text || !b.id) return;
        out.push({
          tipo: suggestTipo(text, tipoKeys),
          titulo: text,        // texto completo: el título no se corta (envuelve en el card)
          descripcion: '',     // sin descripción → no se repite el texto
          fecha: r.report_date,
          hora: '',
          fase: '',
          responsable: '',
          estado: 'completado',
          links: extractUrls(text),
          incluirResumen: true,
          tiempo: mins[i] || 0,
          autor: autorUser?.name || '',
          autorUser,
          source_bullet_id: b.id,
        });
      });
    });
  });
  return out;
}
