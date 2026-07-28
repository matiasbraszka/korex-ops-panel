# Crons de métricas — fotografía 2026-07-28 (PR0 del motor de métricas)

Estado de `cron.job` en prod al arrancar el motor. Los secretos de los headers
están tapados (viven en la base, no acá). Horarios en UTC (BUE = UTC-3).

## Cadena de Meta Ads (la que reemplaza el motor)

| id | jobname | horario | qué hace |
|---|---|---|---|
| 25 | meta-ads-sync-daily | 10:40 | POST meta-ads-sync sin window → usa cfg `last_7d`. ⚠️ Lleva `apikey` hardcodeada en el comando. |
| 43 | meta-ads-sync-ayer | 10:50 | POST meta-ads-sync `{"window":"yesterday"}` (secreto leído de app_settings). ⚠️ Pisa `clients.meta_metrics` con claves `*7d`. |
| 44 | informe-ads-diario | 11:05 | POST informe-ads-diario → Slack #informe-diario-adds. |
| 19 | fbcrm-cpl-2h | cada 2h :13 | fbcrm-cpl-daily?days=2 (extracción PARALELA de gasto; FX invertido hasta PR1). ⚠️ JWT hardcodeado. |
| 23 | ads-runway-alert-daily | 13:30 | ads-runway-alert (lee dme_daily manual, no Meta). |
| 12 | automations-alert-daily | 12:30 | watchdog general de automatizaciones. |

## Otros crons relacionados con métricas

| id | jobname | horario |
|---|---|---|
| 10 | clarity-sync-daily | 09:30 |
| 22 | clarity-rollup-30d | 09:40 |
| 24 | clarity-qa-alert-daily | 09:50 |
| 20 | fbcrm-forms-sync | :26,:56 (⚠️ JWT hardcodeado) |
| 21 | fbcrm-lead-poll | cada 10 min (⚠️ JWT hardcodeado) |

## Plan (fase 1 del motor)

- PR3: cron nuevo `ads-engine-sync` 10:30 UTC → `ads_spend_daily` + `ads_sync_runs`.
- PR4: informe v4 lee del motor (cutover del job 44).
- PR5: `ads-watchdog` 10:55 UTC.
- PR7: se apagan 25 y 43 (y el 25 se recrea sin credenciales hardcodeadas si hiciera falta); a fbcrm-cpl-daily se le retira el gasto (los leads CRM siguen).
