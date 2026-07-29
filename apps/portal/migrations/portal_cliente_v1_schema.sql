-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente · v1 · Esquema
-- Proyecto Supabase: cgdwieoxjoexzlfbxrfc (el del panel de operaciones).
--
-- ⚠️  BORRADOR PARA REVISAR — NO aplicado a producción todavía.
--     Antes de correr, confirmá contra el esquema real los puntos marcados con
--     "CONFIRMAR:". Aplicar con la CLI/PAT como el resto de migrations del panel.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- 1) Curación de guiones ──────────────────────────────────────────────────────
-- El equipo marca qué secciones del DEL son "para grabar" (el cliente ve solo esas).
alter table public.del_sections
  add column if not exists para_grabar   boolean not null default false,
  add column if not exists orden_grabacion integer;

comment on column public.del_sections.para_grabar is
  'Portal cliente: si true, esta sección se muestra como guion "para grabar" en el portal.';

-- 2) Estado "grabado" por cliente ────────────────────────────────────────────
-- Separado del contenido del DEL: es estado del cliente, no del documento.
create table if not exists public.portal_guion_status (
  client_id   text    not null references public.clients(id) on delete cascade,
  section_id  uuid    not null references public.del_sections(id) on delete cascade,
  grabado     boolean not null default false,
  grabado_at  timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (client_id, section_id)
);
comment on table public.portal_guion_status is
  'Portal cliente: marca de "ya grabé este guion" por (cliente, sección de DEL).';

alter table public.portal_guion_status enable row level security;
-- Sin policies de SELECT/WRITE directas: se opera solo vía RPCs SECURITY DEFINER.

-- 3) Recurso visible para el cliente (ediciones que devuelve el equipo) ───────
-- CONFIRMAR: que funnel_resources no tenga ya una columna equivalente.
alter table public.funnel_resources
  add column if not exists visible_cliente boolean not null default false;
comment on column public.funnel_resources.visible_cliente is
  'Portal cliente: si true, el cliente ve este recurso (ej. una edición devuelta).';

-- 4) Tutoriales ──────────────────────────────────────────────────────────────
create table if not exists public.portal_tutorials (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  dur        text,
  url        text,                         -- Loom / Bunny embed / mp4
  orden      integer not null default 0,
  client_id  text references public.clients(id) on delete cascade,  -- null = global
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.portal_tutorials is
  'Portal cliente: videos tutoriales. client_id null = visible para todos.';
alter table public.portal_tutorials enable row level security;

-- Semilla de tutoriales globales (se ven en todos los portales).
insert into public.portal_tutorials (titulo, dur, url, orden) values
  ('Cómo grabarte con el celular', '2 min', null, 1),
  ('Luz y encuadre en 1 minuto',   '1 min', null, 2),
  ('Cómo subir tus archivos acá',  '90 seg', null, 3),
  ('Tips para hablar natural a cámara', '3 min', null, 4)
on conflict do nothing;

-- 5) Storage: permitir que el cliente autenticado suba bajo portal/<...> ──────
-- El bucket funnel-recursos ya existe (público). Habilitamos INSERT para usuarios
-- autenticados del portal solo dentro del prefijo "portal/". El registro en
-- funnel_resources lo hace la RPC portal_cliente_registrar_recurso (v2).
-- CONFIRMAR: política de subida deseada (acá: cualquier authenticated bajo portal/).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'portal_cliente_upload'
  ) then
    create policy portal_cliente_upload on storage.objects
      for insert to authenticated
      with check (bucket_id = 'funnel-recursos' and (storage.foldername(name))[1] = 'portal');
  end if;
end $$;

commit;

-- ── Endurecimiento pendiente (hacer en su propia migración, con cuidado) ──────
-- Hoy del_sections / del_comments / funnel_resources tienen SELECT = true (abierto
-- a cualquier authenticated). El portal usa RPCs, pero conviene cerrar el acceso
-- directo para que un usuario "cliente" no lea de más. Revisar quién depende de
-- esas policies (share_links, panel) antes de restringir.
