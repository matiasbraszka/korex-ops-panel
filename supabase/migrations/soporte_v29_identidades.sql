-- soporte_v29: tabla wa_identidades — puente lid ↔ teléfono ↔ cliente
-- Fase 1 de mejora: mapear mensajes de grupo (key.participant = lid) a identificadores reales.
-- Los ids "lid" de WhatsApp (54992XXXXXXXXX@lid) no son el teléfono real; el payload trae
-- "participantAlt" con el formato e164. Esta tabla mapea ambos para la cascada de reglas R2.

create table if not exists public.wa_identidades (
  id                uuid primary key default gen_random_uuid(),
  lid               text unique,        -- key.participant del mensaje (XXXXX@lid)
  telefono_e164     text,               -- el teléfono real (+549...)
  telefono_9        text,               -- últimos 9 dígitos (normalizado, para match)
  client_id         text,               -- cliente vinculado (si se conoce)
  team_member_id    text,               -- si es un miembro interno
  confianza         text check (confianza in ('alta', 'media', 'baja')),
  fuente            text,               -- 'participantAlt' | 'manual' | 'team_members' | 'contacts'
  updated_at        timestamptz default now()
);

create index if not exists idx_wa_ident_tel_9 on public.wa_identidades(telefono_9);
create index if not exists idx_wa_ident_client on public.wa_identidades(client_id);
create index if not exists idx_wa_ident_member on public.wa_identidades(team_member_id);
create index if not exists idx_wa_ident_lid on public.wa_identidades(lid);

-- Backfill: extraer participantAlt de los 38.300 mensajes de grupo ya guardados.
-- Agrupa por lid (participant) y toma el últimoAlt visto.
insert into public.wa_identidades (lid, telefono_e164, telefono_9, confianza, fuente)
select distinct on (m.sender_jid)
  m.sender_jid as lid,
  '+' || public.wa_tel_norm(m.payload ->'key'->>'participantAlt') as telefono_e164,
  public.wa_tel_9(m.payload ->'key'->>'participantAlt') as telefono_9,
  'alta'::text as confianza,
  'participantAlt'::text as fuente
from public.wa_messages m
where m.sender_jid is not null
  and m.payload ->'key'->>'participantAlt' is not null
  and m.payload ->'key'->>'participantAlt' != ''
order by m.sender_jid, m.wa_timestamp desc
on conflict (lid) do nothing;  -- idempotente

-- Backfill: poblar client_id en wa_identidades usando wa_conversations existentes.
-- Si una identidad aparece como participantAlt en un grupo que ya tiene client_id, asignar.
update public.wa_identidades i
  set client_id = c.client_id
  from public.wa_conversations c, public.wa_messages m
  where m.sender_jid = i.lid
    and m.conversation_id = c.id
    and c.client_id is not null
    and i.client_id is null
  limit 1;  -- una por identidad (la más reciente ya viene filtrada por el ORDER BY del insert)
