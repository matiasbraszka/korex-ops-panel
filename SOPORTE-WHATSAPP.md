# Módulo Soporte — WhatsApp (cimientos)

Estado al 2026-06-12: cimientos completos. Falta conectar el puente (Fase 10,
guiada con Matias) y construir la bandeja UI (próxima sesión).

## Arquitectura

```
WhatsApp (teléfono de Matias)
   │  vinculado por QR (como WhatsApp Web)
   ▼
Evolution API  ──  Railway (~USD 5/mes, 24/7) + Postgres de Railway (sesión)
   │  webhook global por cada evento
   ▼
Edge function `whatsapp-webhook` (Supabase, verify_jwt=false, auth por secreto)
   │  service role
   ▼
wa_conversations / wa_messages  ──  RLS: solo permiso 'soporte' (admins siempre)
   │  Realtime habilitado
   ▼
Panel → área Soporte (/soporte/inbox, chunk lazy propio, SoporteContext)
```

- **API no oficial** (Baileys vía Evolution API). Decisión de Matias: ve grupos
  e historial, mantiene la app del teléfono. Riesgo asumido: Meta puede
  bloquear el número si se abusa (ver Mitigación).
- Los mensajes salientes que Matias manda desde el teléfono también llegan por
  webhook (`key.fromMe=true`) y se guardan con `direction='out'`: la bandeja
  muestra la conversación completa.

## Dónde está cada cosa

| Pieza | Ubicación |
|---|---|
| Tablas + RLS | `migrations/soporte_v2_wa_tables.sql` (aplicada) |
| Rol/permiso 'soporte' | `migrations/soporte_v1_role.sql` (aplicada) |
| Webhook receptor | `supabase/functions/whatsapp-webhook/index.ts` (deployada, v2) |
| Frontend módulo | `apps/soporte/` (`SoporteRoutes`, `SoporteContext`, `InboxPage`) |
| Integración shell | `apps/operations/src/App.jsx` (área `soporte`, ámbar) |
| Config no sensible | `app_settings.soporte_config` (`instance_name`, `webhook_secret`, `default_assignee`) |

**Secreto del webhook**: `app_settings.soporte_config.webhook_secret` (legible
solo por usuarios con permiso de operaciones — mismo patrón que
`docusign_secret`). Si algún día se prefiere, moverlo a un function secret
`WA_WEBHOOK_SECRET` (tiene prioridad sobre app_settings en el código).

URL del webhook (para configurar en Evolution):
`https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/whatsapp-webhook?secret=<webhook_secret>`

## Fase 10 — Conectar el puente (guiada, requiere a Matias)

1. **Railway**: crear cuenta en railway.app (o usar existente). New Project →
   Deploy Docker image → `evoapicloud/evolution-api:latest` (imagen oficial v2;
   verificar última estable). Agregar también una base **Postgres** de Railway
   al proyecto.
2. **Variables del servicio Evolution**:
   - `AUTHENTICATION_API_KEY` = llave maestra (generar random fuerte, guardar)
   - `DATABASE_ENABLED=true`, `DATABASE_PROVIDER=postgresql`,
     `DATABASE_CONNECTION_URI` = la URL del Postgres de Railway
   - `WEBHOOK_GLOBAL_ENABLED=true`
   - `WEBHOOK_GLOBAL_URL=https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/whatsapp-webhook?secret=<webhook_secret>`
   - `WEBHOOK_EVENTS_MESSAGES_UPSERT=true` (mínimo viable; sumar eventos
     recién cuando la bandeja los use)
3. **Crear instancia**: `POST <railway-url>/instance/create` con header
   `apikey: <AUTHENTICATION_API_KEY>` y body
   `{"instanceName": "korex-soporte", "integration": "WHATSAPP-BAILEYS"}`.
4. **QR**: `GET <railway-url>/instance/connect/korex-soporte` (mismo header)
   devuelve el QR. Matias lo escanea desde WhatsApp Business →
   Dispositivos vinculados → Vincular dispositivo.
5. **Prueba real**: alguien manda un WhatsApp → en segundos aparece en
   `wa_messages`. Matias responde desde el teléfono → se guarda con
   `direction='out'`.
6. **Persistencia**: reiniciar el servicio en Railway NO debe pedir QR de
   nuevo (la sesión vive en el Postgres de Railway).

## Mitigación del riesgo de bloqueo (API no oficial)

- NO usar el puente para envíos masivos ni mensajes en frío a desconocidos.
- Los futuros recordatorios automáticos salen de a uno, con pausas de
  segundos entre mensajes, y solo a gente que agendó (consentimiento real).
- Si Evolution reporta desconexión (`connection.update`), se re-vincula por QR.

## Probar el webhook sin Evolution (curl)

```bash
URL="https://cgdwieoxjoexzlfbxrfc.supabase.co/functions/v1/whatsapp-webhook?secret=<webhook_secret>"
# entrante de prueba → {"ok":true,"processed":1}; repetir → "processed":0 (idempotente)
curl -X POST "$URL" -H "Content-Type: application/json" -d '{"event":"messages.upsert","instance":"korex-soporte","data":{"key":{"remoteJid":"5491100000000@s.whatsapp.net","fromMe":false,"id":"TEST_1"},"pushName":"Test","message":{"conversation":"hola"},"messageType":"conversation","messageTimestamp":1781257000}}'
# secreto inválido → 401
```

## Próximos pasos (no incluidos en los cimientos)

1. Bandeja UI en `apps/soporte` (lista de chats + hilo, realtime sobre
   `wa_messages`, responder vía REST de Evolution con `EVOLUTION_API_URL`/
   `EVOLUTION_API_KEY` como secrets de una edge function `whatsapp-send`).
2. Calendario de citas (tablas `appointments`/`availability_slots`, link
   público, sync Google Calendar) — pg_cron y pg_net ya están instalados.
3. Recordatorios automáticos configurables (plantillas + cron + log de envíos).

## Deuda técnica documentada (fuera de alcance de esta fase)

- Políticas RLS `USING (true)` en tablas viejas de ops: endurecerlas requiere
  su propio proyecto de testing (el frontend depende del acceso permisivo).
- Partir TasksPage/EquipoPage y virtualizar listas largas.
- 27 funciones SECURITY DEFINER ejecutables por anon/authenticated (warning
  del linter): revisar caso por caso.
