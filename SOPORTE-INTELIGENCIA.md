# Inteligencia de Soporte WhatsApp — setup y rollout

Capa de análisis con IA sobre los chats de WhatsApp (bandeja de soporte). Agrega:

- **Plantillas con etiquetas** (organizar/filtrar) — ya activo en el panel (`/soporte/plantillas`).
- **Informe diario de pendientes** sin responder → Slack + Google Doc.
- **Informe semanal (domingos)** de satisfacción de grupos de usuarios y de clientes → Google Docs + Slack, y nutre la **Guía de soporte** con FAQs.
- **Briefing vivo por cliente** (estado + satisfacción + historial) → Google Docs.

> La fuente de verdad es Supabase (tablas `wa_briefings`, `wa_satisfaction_history`, `wa_pending_items`, `wa_support_faqs`, `wa_intel_runs`). Google Docs es solo el render legible.

## Archivos
- Migración: `supabase/migrations/soporte_v21_intel.sql` (ya aplicada).
- Helpers: `supabase/functions/_shared/anthropic.ts`, `_shared/intel.ts`.
- Edge functions: `supabase/functions/wa-pendientes-diario/`, `wa-analisis-semanal/`.
- Apps Script de Google Docs: `google-apps-script/korex-docs.gs`.
- UI plantillas: `apps/soporte/src/pages/PlantillasPage.jsx`.

## Prerequisitos (cargar antes de activar el cron)
1. **WhatsApp conectado** (Evolution en Railway + QR) — sin esto no entran mensajes de grupos.
2. **Secreto de Supabase**: `ANTHROPIC_API_KEY`.
   `supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`
3. **Número de Cristian Fernández** (el de Matías ya lo tenemos).
4. **3 Google Docs nuevos** (vacíos) + la **Guía de soporte** existente. Copiar sus URLs.
5. **Apps Script `korex-docs`**: pegar `korex-docs.gs` en un proyecto Apps Script, ajustar `KXD_SECRET`, **Implementar → App web** (ejecutar como vos; acceso "cualquiera"). La cuenta debe tener acceso de **edición** a los 4 Docs. Copiar la URL `/exec`.

## Config (`soporte_config` en `app_settings`)
Completar desde el panel (Settings de Soporte) o por SQL:
```sql
update app_settings set value = value || jsonb_build_object(
  'korex_responder_phones', '["549XXXXXXXXXX","5492923514625","549YYYYYYYYYY"]'::jsonb, -- soporte, Matías, Cristian (E.164 sin +)
  'docs_script_url', 'https://script.google.com/macros/s/.../exec',
  'docs_script_secret', 'korex-docs-2026',
  'support_guide_doc_url', 'https://docs.google.com/document/d/.../edit',
  'briefings_doc_url', 'https://docs.google.com/document/d/.../edit',
  'satisfaction_doc_url', 'https://docs.google.com/document/d/.../edit',
  'pending_doc_url', 'https://docs.google.com/document/d/.../edit',
  'intel_slack_pendientes_channel', 'C0XXXXXX',  -- canal #soporte-pendientes
  'intel_slack_informe_channel', 'C0YYYYYY'      -- canal #informe-soporte
) where key='soporte_config';
```
`analysis_model` ya viene en `claude-opus-4-8` (alternativas más baratas: `claude-sonnet-4-6`, `claude-haiku-4-5`).
Las etiquetas `G usuarios` / `G-Clientes` se matchean por su label en `soporte_config.tags` (tolerante a mayúsculas/guion/espacio).

## Deploy de las funciones
```bash
supabase functions deploy wa-pendientes-diario --no-verify-jwt
supabase functions deploy wa-analisis-semanal --no-verify-jwt
```
(Auth interna por `?secret=`/`x-cron-secret` contra `soporte_config.cron_secret`.)

## Prueba a mano (sin escribir nada)
```bash
curl -X POST "$SUPABASE_URL/functions/v1/wa-pendientes-diario" \
  -H "Content-Type: application/json" -d '{"dry_run":true}'
curl -X POST "$SUPABASE_URL/functions/v1/wa-analisis-semanal" \
  -H "Content-Type: application/json" -d '{"dry_run":true}'
```
Devuelven el JSON de resultados sin tocar la DB, Slack ni Docs.

## Activar el cron (cuando los prerequisitos estén listos)
Ejecutar por `execute_sql` (usa el `cron_secret` ya guardado):
```sql
select cron.schedule('wa_pendientes_diario','30 11 * * *', $$
  select net.http_post(
    url:='https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/wa-pendientes-diario',
    headers:=jsonb_build_object('Content-Type','application/json',
      'x-cron-secret',(select value->>'cron_secret' from app_settings where key='soporte_config')),
    body:='{}'::jsonb);
$$);  -- 8:30 BUE

select cron.schedule('wa_analisis_semanal','0 13 * * 0', $$
  select net.http_post(
    url:='https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/wa-analisis-semanal',
    headers:=jsonb_build_object('Content-Type','application/json',
      'x-cron-secret',(select value->>'cron_secret' from app_settings where key='soporte_config')),
    body:='{}'::jsonb);
$$);  -- domingos 10:00 BUE
```
Para apagar: `select cron.unschedule('wa_pendientes_diario');`
