-- soporte_v30: wa_pending_items → tabla de tickets con ciclo de vida
-- Fase 3 de mejora: estructura de tickets con dueño, estado y cierre.

alter table if exists public.wa_pending_items
  add column if not exists assigned_to text,
  add column if not exists estado text default 'abierto',
  add column if not exists resuelto_por text,
  add column if not exists nota_cierre text;

-- CHECK para estado del ticket (ciclo de vida simple).
alter table if exists public.wa_pending_items
  add constraint chk_wa_pending_estado check (
    estado in ('abierto', 'en_curso', 'esperando_contacto', 'resuelto', 'descartado')
  );

-- Índices para Fase 3.
create index if not exists idx_wa_pending_abiertos
  on public.wa_pending_items(estado, wa_timestamp)
  where resolved_at is null;

create index if not exists idx_wa_pending_assigned
  on public.wa_pending_items(assigned_to, estado);

create index if not exists idx_wa_pending_tipo
  on public.wa_pending_items(tipo, urgencia);
