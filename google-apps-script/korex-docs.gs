/**
 * Korex — Render de los informes de Inteligencia de Soporte en Google Docs (v2).
 *
 * La llaman las rutinas de análisis. Reescribe de forma idempotente la sección
 * del Doc (la fuente de verdad es Supabase; acá solo se pinta con formato).
 *
 * v2: más color y negritas; FAQs agrupadas por cliente; informe semanal extenso
 * segmentado por cliente y, dentro, por grupo de usuarios vs grupo de cliente.
 *
 * Acciones (todas reciben doc_url o doc_id):
 *   - upsert_briefing_tab    → ficha viva de un cliente
 *   - write_weekly_report    → informe semanal extenso (reemplaza write_weekly_satisfaction)
 *   - write_faqs             → FAQs agrupadas por cliente (reemplaza append_faqs)
 *   - write_daily_pending    → pendientes del día
 *
 * Corré como la cuenta de Google que lo despliega; esa cuenta DEBE tener edición a los Docs.
 * ACTUALIZAR (misma URL): Implementar → Administrar implementaciones → ✏️ → Nueva versión → Implementar.
 */

const KXD_SECRET = 'korex-docs-2026'; // coincide con soporte_config.docs_script_secret

// Paleta
const KX_AMBER = '#B45309', KX_INDIGO = '#4A67D8', KX_GREEN = '#15803D',
      KX_RED = '#DC2626', KX_GRAY = '#6B7280', KX_PURPLE = '#7C3AED';

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(28000); } catch (err) { return kxdJson({ ok: false, error: 'busy' }); }
  try {
    var b = JSON.parse(e.postData.contents);
    if (b.secret !== KXD_SECRET) return kxdJson({ ok: false, error: 'unauthorized' });
    var action = String(b.action || '');
    if (action === 'upsert_briefing_tab')       return kxdJson(kxdUpsertBriefing(b));
    if (action === 'write_weekly_report')       return kxdJson(kxdWeeklyReport(b));
    if (action === 'write_weekly_satisfaction') return kxdJson(kxdWeeklyReport(b)); // compat
    if (action === 'write_faqs')                return kxdJson(kxdWriteFaqs(b));
    if (action === 'append_faqs')               return kxdJson(kxdWriteFaqs(b));    // compat
    if (action === 'write_daily_pending')       return kxdJson(kxdDailyPending(b));
    return kxdJson({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return kxdJson({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ── Acciones ─────────────────────────────────────────────────────────────────

function kxdUpsertBriefing(b) {
  var body = kxdBody(b);
  var s = b.sat || {};
  var blocks = [];
  blocks.push({ t: 'h1', s: '🧭 ' + (b.client_name || b.client_id || 'Cliente'), color: KX_AMBER });
  blocks.push({ t: 'kv', label: 'Actualizado:', s: (b.week_start || kxdToday()), color: KX_GRAY });
  blocks.push({ t: 'h2', s: '📈 Satisfacción', color: KX_INDIGO });
  blocks.push({ t: 'kv', label: 'General:', s: kxdScore(s.overall), color: kxdSc(s.overall) });
  blocks.push({ t: 'kv', label: 'Grupo de usuarios:', s: kxdScore(s.usuarios), color: kxdSc(s.usuarios) });
  blocks.push({ t: 'kv', label: 'Grupo del cliente:', s: kxdScore(s.cliente_grupo), color: kxdSc(s.cliente_grupo) });
  blocks.push({ t: 'kv', label: 'Privado 1-a-1:', s: kxdScore(s.privado), color: kxdSc(s.privado) });
  if (b.estado) { blocks.push({ t: 'h2', s: '📌 Estado actual', color: KX_INDIGO }); blocks.push({ t: 'p', s: String(b.estado) }); }
  if (b.riesgos) { blocks.push({ t: 'h2', s: '⚠️ Riesgos / atención', color: KX_RED }); blocks.push({ t: 'p', s: String(b.riesgos), color: KX_RED }); }
  if (b.historial && b.historial.length) {
    blocks.push({ t: 'h2', s: '🕘 Historial', color: KX_INDIGO });
    for (var i = b.historial.length - 1; i >= 0; i--) {
      var h = b.historial[i];
      blocks.push({ t: 'li', label: (h.week_start || '') + ': ', s: (h.resumen || '') });
    }
  }
  kxdReplaceSection(body, 'brief:' + String(b.client_id || ''), blocks);
  return { ok: true };
}

function kxdWeeklyReport(b) {
  var body = kxdBody(b);
  var ws = String(b.week_start || kxdToday());
  var blocks = [];
  blocks.push({ t: 'h1', s: '📊 Informe semanal — semana del ' + ws, color: KX_AMBER });
  if (b.resumen) blocks.push({ t: 'p', s: String(b.resumen), color: KX_GRAY });

  // 1) Resumen general con semáforo
  blocks.push({ t: 'h2', s: '🚦 Resumen general', color: KX_INDIGO });
  var sem = b.semaforo || [];
  for (var i = 0; i < sem.length; i++) {
    var r = sem[i];
    var extra = ' · U:' + kxdScore(r.usuarios) + ' · C:' + kxdScore(r.cliente_grupo) + ' · 1a1:' + kxdScore(r.privado);
    blocks.push({ t: 'kv', label: (r.client_name || 'Cliente') + ':', s: kxdScore(r.overall) + extra, color: kxdSc(r.overall) });
  }
  if (!sem.length) blocks.push({ t: 'p', s: 'Sin actividad suficiente esta semana.', color: KX_GRAY });

  // 2) Detalle por cliente y por grupo
  var clientes = b.clientes || [];
  for (var c = 0; c < clientes.length; c++) {
    var cli = clientes[c];
    blocks.push({ t: 'h2', s: '🏢 ' + (cli.client_name || 'Cliente'), color: KX_PURPLE });
    var grupos = cli.grupos || [];
    for (var g = 0; g < grupos.length; g++) {
      var gr = grupos[g];
      var esUsuarios = gr.tipo === 'usuarios';
      var titulo = (esUsuarios ? '👥 Grupo de usuarios' : '💬 Grupo del cliente');
      blocks.push({ t: 'h3', s: titulo + ' — ' + kxdScore(gr.score) + (gr.label ? ' · ' + gr.label : ''), color: kxdSc(gr.score) });

      kxdList(blocks, '🆕 Nuevas preguntas (con respuesta):', (gr.nuevas_preguntas || []).map(function (q) {
        return { s: '❓ ' + (q.q || ''), sub: q.a ? '✅ ' + q.a : '' };
      }), KX_INDIGO);
      kxdList(blocks, '❗ Preguntas sin resolver:', (gr.sin_resolver || []).map(function (x) { return { s: x }; }), KX_RED, KX_RED);
      kxdList(blocks, '🤔 Dudas y preocupaciones:', (gr.dudas || []).map(function (x) { return { s: x }; }), KX_AMBER);
      kxdList(blocks, '💬 Feedback sobre el servicio:', (gr.feedback || []).map(function (f) {
        var pos = (f.tipo === 'positivo');
        return { s: (pos ? '👍 ' : '👎 ') + (f.texto || ''), color: pos ? KX_GREEN : KX_RED };
      }), KX_INDIGO);

      blocks.push({ t: 'kv', label: '🐞 Problemas reportados:', s: String(gr.problemas_count || 0), color: (gr.problemas_count > 0 ? KX_RED : KX_GREEN) });
      blocks.push({ t: 'kv', label: '🔧 Bugs reportados:', s: String(gr.bugs_count || 0), color: (gr.bugs_count > 0 ? KX_RED : KX_GREEN) });
      blocks.push({ t: 'kv', label: '⏱️ Tiempo de respuesta de Korex:', s: String(gr.tiempo_respuesta || '—'), color: KX_GRAY });
    }
  }
  kxdReplaceSection(body, 'week:' + ws, blocks);
  return { ok: true };
}

function kxdWriteFaqs(b) {
  var body = kxdBody(b);
  var blocks = [];
  blocks.push({ t: 'h1', s: '🤖 Preguntas frecuentes detectadas automáticamente', color: KX_AMBER });
  blocks.push({ t: 'p', s: 'Generado por el análisis semanal de los grupos de usuarios. Actualizado: ' + kxdToday(), color: KX_GRAY });

  // Acepta clientes:[{client_name,faqs:[...]}] (nuevo) o faqs:[...] suelto (compat → "General").
  var clientes = b.clientes;
  if (!clientes) clientes = [{ client_name: 'General', faqs: b.faqs || [] }];
  for (var c = 0; c < clientes.length; c++) {
    var cli = clientes[c];
    var faqs = cli.faqs || [];
    if (!faqs.length) continue;
    blocks.push({ t: 'h2', s: '🏢 ' + (cli.client_name || 'General'), color: KX_PURPLE });
    for (var i = 0; i < faqs.length; i++) {
      var f = faqs[i];
      blocks.push({ t: 'label', label: '❓ ' + (f.pregunta || ''), color: KX_INDIGO });
      blocks.push({ t: 'li', s: '✅ ' + (f.respuesta || '') + (f.categoria ? '   [' + f.categoria + ']' : '') });
    }
  }
  kxdReplaceSection(body, 'faqs:auto', blocks);
  return { ok: true };
}

function kxdDailyPending(b) {
  var body = kxdBody(b);
  var blocks = [];
  blocks.push({ t: 'h1', s: '⏳ Pendientes sin responder — ' + (b.date || kxdToday()), color: KX_AMBER });
  var groups = b.groups || [];
  if (!groups.length) blocks.push({ t: 'p', s: 'Sin pendientes detectados. 🎉', color: KX_GREEN });
  var urg = { alta: KX_RED, media: KX_AMBER, baja: KX_GRAY };
  var emo = { alta: '🔴', media: '🟡', baja: '⚪' };
  for (var i = 0; i < groups.length; i++) {
    var gr = groups[i];
    blocks.push({ t: 'h2', s: '💬 ' + (gr.title || 'Chat'), color: KX_INDIGO });
    var items = gr.items || [];
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      blocks.push({ t: 'li', s: (emo[it.urgencia] || '🟡') + ' ' + (it.pregunta || '') + (it.last_msg ? '  — “' + it.last_msg + '”' : ''), color: urg[it.urgencia] || null });
    }
  }
  kxdReplaceSection(body, 'pend:' + String(b.date || kxdToday()), blocks);
  return { ok: true };
}

// Helper: agrega un label de sección + bullets (con sub-bullet opcional). Salta si vacío.
function kxdList(blocks, label, items, labelColor, itemColor) {
  if (!items || !items.length) return;
  blocks.push({ t: 'label', label: label, color: labelColor || KX_INDIGO });
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    blocks.push({ t: 'li', s: it.s, color: it.color || itemColor || null });
    if (it.sub) blocks.push({ t: 'li2', s: it.sub, color: KX_GRAY });
  }
}

// ── Motor de secciones idempotentes con formato ──────────────────────────────

function kxdReplaceSection(body, key, blocks) {
  var startMark = '[[KXD:' + key + ']]', endMark = '[[KXD:end:' + key + ']]';
  var startIdx = kxdFindPara(body, startMark), insertAt;
  if (startIdx !== -1) {
    var endIdx = kxdFindPara(body, endMark);
    if (endIdx === -1) endIdx = startIdx;
    for (var i = endIdx; i >= startIdx; i--) { try { body.removeChild(body.getChild(i)); } catch (e) {} }
    insertAt = startIdx;
  } else { insertAt = body.getNumChildren(); }
  var idx = insertAt;
  kxdInsertMarker(body, idx++, startMark);
  for (var b = 0; b < blocks.length; b++) idx = kxdInsertBlock(body, idx, blocks[b]);
  kxdInsertMarker(body, idx++, endMark);
}

function kxdInsertBlock(body, idx, blk) {
  var t = blk.t;
  if (t === 'h1' || t === 'h2' || t === 'h3') {
    var p = body.insertParagraph(idx, String(blk.s));
    p.setHeading(t === 'h1' ? DocumentApp.ParagraphHeading.HEADING1
                : t === 'h2' ? DocumentApp.ParagraphHeading.HEADING2
                : DocumentApp.ParagraphHeading.HEADING3);
    var tx = p.editAsText(); tx.setBold(true);
    if (blk.color) tx.setForegroundColor(blk.color);
    return idx + 1;
  }
  if (t === 'label' || t === 'kv') {
    var label = String(blk.label || ''); var value = blk.s ? String(blk.s) : '';
    var text = value ? (label + ' ' + value) : label;
    var pp = body.insertParagraph(idx, text);
    pp.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    var et = pp.editAsText();
    if (label.length) { et.setBold(0, label.length - 1, true); et.setForegroundColor(0, label.length - 1, blk.color || KX_INDIGO); }
    if (t === 'kv' && value && blk.color) et.setForegroundColor(label.length + 1, text.length - 1, blk.color);
    return idx + 1;
  }
  if (t === 'li' || t === 'li2') {
    var hasLabel = blk.label ? String(blk.label) : '';
    var s = hasLabel ? (hasLabel + String(blk.s || '')) : String(blk.s || '');
    var li = body.insertListItem(idx, s);
    li.setGlyphType(DocumentApp.GlyphType.BULLET);
    li.setNestingLevel(t === 'li2' ? 1 : 0);
    var lt = li.editAsText();
    if (hasLabel.length) lt.setBold(0, hasLabel.length - 1, true);
    if (blk.color) lt.setForegroundColor(blk.color);
    return idx + 1;
  }
  // 'p' por defecto
  var par = body.insertParagraph(idx, String(blk.s || ''));
  par.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  if (blk.color) par.editAsText().setForegroundColor(blk.color);
  return idx + 1;
}

function kxdInsertMarker(body, idx, text) {
  var p = body.insertParagraph(idx, text);
  p.setHeading(DocumentApp.ParagraphHeading.NORMAL);
  var s = p.editAsText(); s.setFontSize(1); s.setForegroundColor('#FFFFFF');
  return p;
}

function kxdFindPara(body, text) {
  var n = body.getNumChildren();
  for (var i = 0; i < n; i++) {
    var ch = body.getChild(i);
    if (ch.getType() === DocumentApp.ElementType.PARAGRAPH && ch.asParagraph().getText() === text) return i;
  }
  return -1;
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function kxdBody(b) {
  var id = b.doc_id ? String(b.doc_id) : kxdDocId(String(b.doc_url || ''));
  if (!id) throw new Error('missing_doc');
  return DocumentApp.openById(id).getBody();
}
function kxdDocId(url) { var m = url.match(/\/d\/([a-zA-Z0-9_-]+)/); return m ? m[1] : ''; }
function kxdScore(v) {
  if (v === null || v === undefined || v === '') return '—';
  var n = Number(v); if (isNaN(n)) return '—';
  return (n >= 75 ? '🟢' : n >= 50 ? '🟡' : '🔴') + ' ' + n + '/100';
}
function kxdSc(v) { if (v === null || v === undefined || v === '') return KX_GRAY; var n = Number(v); return n >= 75 ? KX_GREEN : n >= 50 ? KX_AMBER : KX_RED; }
function kxdToday() { return Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'yyyy-MM-dd'); }
function kxdJson(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
