-- ─────────────────────────────────────────────────────────────────────────────
-- PORTAL v18 — GUÍAS GLOBALES editables en el sistema (pedido de Matías):
-- las guías de grabación dejan de ser PDFs de Drive incrustados y pasan a ser
-- PÁGINAS del sistema: se editan en el panel (menú del DEL → sección GUÍAS,
-- visible en todos los DEL de todos los clientes) y el portal las muestra
-- nativas. Tabla del_guias_globales + RPC portal_cliente_guias().
-- Aplicada a prod el 2026-07-25 vía MCP. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.del_guias_globales (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  html text not null default '',
  text text not null default '',
  orden int not null default 0,
  activo boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.del_guias_globales enable row level security;
drop policy if exists del_guias_globales_team on public.del_guias_globales;
create policy del_guias_globales_team on public.del_guias_globales
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());

-- El portal las lee por RPC (scopeada: solo clientes con acceso al portal).
create or replace function public.portal_cliente_guias()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'titulo', g.title, 'html', g.html, 'texto', g.text)
           order by g.orden, g.created_at)
    from public.del_guias_globales g where g.activo
  ), '[]'::jsonb) end;
$$;

grant execute on function public.portal_cliente_guias() to authenticated;

-- Seed: las dos guías, con el contenido a pegar por el equipo (los PDF de
-- referencia quedan linkeados para copiar de ahí UNA vez).
insert into public.del_guias_globales (title, html, text, orden, created_by)
select * from (values
  ('Cómo grabarte los anuncios',
   '<p><b>⚠️ Equipo:</b> pegar acá el contenido de la guía de anuncios (está en <a href="https://drive.google.com/file/d/1ad0-7akANcn75xIklZsa6qJhfHwY6kXh/view">este PDF</a>). El cliente ve esta página tal cual en su portal.</p>',
   'Equipo: pegar aca el contenido de la guia de anuncios.', 1, 'seed'),
  ('Cómo grabarte el VSL',
   '<p><b>⚠️ Equipo:</b> pegar acá el contenido de la guía del VSL (está en <a href="https://drive.google.com/file/d/1ObCVIf50f5WN2XZUShRGXnRW1XmG3q5T/view">este PDF</a>). El cliente ve esta página tal cual en su portal.</p>',
   'Equipo: pegar aca el contenido de la guia del VSL.', 2, 'seed')
) v(title, html, text, orden, created_by)
where not exists (select 1 from public.del_guias_globales);
