-- soporte_v28: candado manual + normalización de teléfonos + campos mecánicos
-- Fase 1 de mejora del módulo de soporte: cimientos para clasificación automática
-- y kanban de seguimiento sin pisar correcciones manuales.

-- 1. Funciones de normalización de teléfonos (reutilizables, inmutables).
create or replace function public.wa_tel_norm(t text) returns text as $$
  select nullif(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '');
$$ language sql immutable;

create or replace function public.wa_tel_9(t text) returns text as $$
  select right(public.wa_tel_norm(t), 9);
$$ language sql immutable;

-- 2. wa_conversations: nuevos campos de clasificación y candado.
-- Renombrar status → estado, agregar CHECK, campos nuevos con índices.

alter table if exists public.wa_conversations
  -- Renombrar (PostSQL 14+: usando update + recreate)
  add column if not exists estado text;

-- Backfill: migrar valores existentes de 'status' → 'estado', respetar NULLs.
update public.wa_conversations
  set estado = status
  where estado is null and status is not null;

-- Borrar la vieja columna 'status' después de que esté migrada.
alter table if exists public.wa_conversations
  drop column if exists status cascade;

-- Agregar CHECK al nuevo campo.
alter table if exists public.wa_conversations
  add constraint chk_wa_conv_estado check (
    estado in ('responder_hoy', 'seguimiento', 'cerrado') or estado is null
  );

-- Campos de control manual (candado P2).
alter table if exists public.wa_conversations
  add column if not exists bloqueado_manual boolean default false,
  add column if not exists bloqueado_por text,
  add column if not exists bloqueado_at timestamptz;

-- Campos mecánicos de clasificación automática (Fase 2).
alter table if exists public.wa_conversations
  add column if not exists tipo_conversacion text,
  add column if not exists telefono_e164 text,
  add column if not exists client_id_source text,
  add column if not exists client_id_confidence text;

-- Agregar CHECK para tipo_conversacion y confianza.
alter table if exists public.wa_conversations
  add constraint chk_wa_conv_tipo check (
    tipo_conversacion in (
      'equipo_interno', 'lider', 'usuario', 'grupo_cliente', 'grupo_usuarios',
      'proveedor', 'comercial', 'desconocido'
    ) or tipo_conversacion is null
  ),
  add constraint chk_wa_conv_confidence check (
    client_id_confidence in ('alta', 'media', 'baja') or client_id_confidence is null
  );

-- Campo para seguimiento con fecha (override manual, Fase 3).
alter table if exists public.wa_conversations
  add column if not exists seguimiento_fecha date;

-- Respaldo de etiquetas antes de cualquier migración de §10.1.
alter table if exists public.wa_conversations
  add column if not exists tags_legacy text[];

-- Backfill: copiar tags actuales a tags_legacy (una sola vez).
update public.wa_conversations
  set tags_legacy = tags
  where tags_legacy is null and tags is not null;

-- 3. Índices para Fase 2 y Fase 3.
create index if not exists idx_wa_conv_estado on public.wa_conversations(estado);
create index if not exists idx_wa_conv_tipo on public.wa_conversations(tipo_conversacion);
create index if not exists idx_wa_conv_tel_e164 on public.wa_conversations(telefono_e164);
create index if not exists idx_wa_conv_client_source on public.wa_conversations(client_id_source);
create index if not exists idx_wa_conv_bloqueado on public.wa_conversations(bloqueado_manual);
create index if not exists idx_wa_conv_lastmsg_dir_t on public.wa_conversations(last_message_direction, last_message_at desc);

-- 4. Backfill: telefono_e164 desde wa_jid (chats 1:1, 660 registros).
-- Extraer el número desde "5491158031771@s.whatsapp.net" → "+5491158031771".
update public.wa_conversations
  set telefono_e164 = '+' || public.wa_tel_norm(wa_jid)
  where is_group is not true
    and telefono_e164 is null
    and wa_jid like '%@s.whatsapp.net';

-- 5. wa_messages: campos para capturar origen y teléfono del remitente en grupos.
-- El webhook llenará estos cuando lleguen mensajes de grupo (key.participant, key.participantAlt).
alter table if exists public.wa_messages
  add column if not exists sender_lid text,
  add column if not exists sender_telefono_e164 text,
  add column if not exists enviado_desde text;

alter table if exists public.wa_messages
  add constraint chk_wa_msg_enviado_desde check (
    enviado_desde in ('plataforma', 'telefono', 'desconocido') or enviado_desde is null
  );

create index if not exists idx_wa_msg_sender_lid on public.wa_messages(sender_lid);
create index if not exists idx_wa_msg_sender_tel on public.wa_messages(sender_telefono_e164);
