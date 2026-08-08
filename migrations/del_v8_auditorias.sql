-- migrations/del_v8_auditorias.sql
--
-- AUDITORÍAS del DEL.
--
-- Pedido de Matías: una categoría nueva "Auditorías" donde queden asentadas las
-- conclusiones que vamos sacando de cada lanzamiento. Cada auditoría lleva una
-- FECHA (cuándo la hicimos), el RANGO auditado (de qué período habla), DE QUÉ es
-- (anuncios, VSL, funnel o completa), QUIÉNES del equipo la hicieron —con su foto—
-- y el EMBUDO auditado, que es el del propio DEL. Y un interruptor para que el
-- cliente la vea en su plataforma.
--
-- Decisión de diseño: una auditoría NO es una tabla paralela con su propio editor.
-- Es una SECCIÓN normal de del_sections con kind = 'auditoria'. Así hereda gratis
-- todo lo que ya funciona y está probado: el editor rico, los comentarios, el
-- historial, el link para compartir, el PDF, la papelera con deshacer y el
-- pipeline del portal. Lo único que le falta a una sección para ser una auditoría
-- es el encabezado, y eso es lo que guarda esta tabla.
--
-- `kind` en del_sections es texto libre (no hay CHECK): 'auditoria' entra sin tocar
-- ninguna restricción. Verificado antes de escribir esto.
--
-- La visibilidad al cliente va en `visible_cliente` y NO en accion_cliente/
-- estado_seccion. Son dos mecanismos distintos a propósito: el de las secciones
-- normales modela un circuito (construcción → revisar → aprobar), y una auditoría
-- no tiene circuito — o se muestra o no se muestra. Un solo interruptor, sin
-- estados intermedios que puedan dejarla a medio publicar.
--
-- ADITIVA: crea una tabla vacía y tres funciones nuevas. No toca nada que exista.

create table if not exists public.del_auditorias (
  section_id      text primary key references public.del_sections(id) on delete cascade,
  fecha           date not null default current_date,   -- cuándo se hizo la auditoría
  desde           date,                                 -- inicio del período auditado
  hasta           date,                                 -- fin del período auditado
  alcance         text not null default 'completo',     -- de qué es
  equipo          text[] not null default '{}',         -- ids de team_members que la hicieron
  visible_cliente boolean not null default false,       -- ¿la ve en su plataforma?
  created_at      timestamptz not null default now(),
  created_by      text,
  updated_at      timestamptz,
  updated_by      text,
  constraint del_auditorias_alcance_chk
    check (alcance in ('ads', 'vsl', 'funnel', 'completo')),
  -- Un rango al revés (hasta < desde) es siempre un error de carga y se propaga al
  -- portal del cliente. La RPC de guardado lo da vuelta antes de llegar acá; esto
  -- es la red por si alguna vez escribe otro camino.
  constraint del_auditorias_rango_chk
    check (desde is null or hasta is null or hasta >= desde)
);

comment on table public.del_auditorias is
  'Encabezado de cada auditoría del DEL. La auditoría en sí es una fila de '
  'del_sections con kind = ''auditoria''; esto le cuelga fecha, período auditado, '
  'alcance, quiénes la hicieron y si el cliente la ve.';
comment on column public.del_auditorias.equipo is
  'Ids de team_members que hicieron la auditoría. Es un array de ids y no una tabla '
  'puente porque el orden importa (se muestran en fila) y nunca se consulta al revés.';
comment on column public.del_auditorias.visible_cliente is
  'Único interruptor de visibilidad. El portal filtra por esto, no por '
  'accion_cliente/estado_seccion: una auditoría no tiene circuito de aprobación.';

create index if not exists del_auditorias_fecha_idx
  on public.del_auditorias (fecha desc);

alter table public.del_auditorias enable row level security;

do $$ begin
  create policy del_auditorias_team on public.del_auditorias
    for all to authenticated
    using ((select public.is_team_member())) with check ((select public.is_team_member()));
exception when duplicate_object then null; end $$;

revoke all on public.del_auditorias from anon;
grant select, insert, update, delete on public.del_auditorias to authenticated;

-- ── Leer las auditorías de un DEL ───────────────────────────────────────────
-- Una consulta por documento (mismo patrón que del_grab_aprobacion): devuelve un
-- objeto { section_id: {…} } que el editor indexa directo, en vez de una consulta
-- por sección.
create or replace function public.del_auditorias_doc(p_doc_id text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_object_agg(a.section_id, jsonb_build_object(
           'fecha', a.fecha,
           'desde', a.desde,
           'hasta', a.hasta,
           'alcance', a.alcance,
           'equipo', to_jsonb(a.equipo),
           'visibleCliente', a.visible_cliente
         )), '{}'::jsonb)
    from public.del_auditorias a
    join public.del_sections ds on ds.id = a.section_id
   where ds.doc_id = p_doc_id
     and (select public.is_team_member());
$$;

comment on function public.del_auditorias_doc(text) is
  'Encabezados de todas las auditorías de un DEL, indexados por section_id. '
  'Una consulta por documento, no una por sección.';

-- ── Guardar el encabezado ───────────────────────────────────────────────────
-- Va por RPC y no por un update directo a la tabla por la misma razón que el resto
-- del DEL: el rol authenticated conserva el GRANT de UPDATE, así que un update que
-- RLS bloquea responde 200 sin filas y sin error — no se guarda nada y nadie se
-- entera. Acá el permiso se comprueba explícitamente y se avisa.
create or replace function public.del_auditoria_set(
  p_section_id text,
  p_fecha      date,
  p_desde      date,
  p_hasta      date,
  p_alcance    text,
  p_equipo     text[],
  p_visible    boolean,
  p_by         text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_kind text; v_alcance text; v_desde date; v_hasta date;
begin
  if not (select public.is_team_member()) then
    return jsonb_build_object('ok', false, 'error', 'sin permiso');
  end if;

  select kind into v_kind from public.del_sections where id = p_section_id;
  if v_kind is null then
    return jsonb_build_object('ok', false, 'error', 'la sección no existe');
  end if;
  if v_kind <> 'auditoria' then
    return jsonb_build_object('ok', false, 'error', 'esa sección no es una auditoría');
  end if;

  v_alcance := case when p_alcance in ('ads','vsl','funnel','completo')
                    then p_alcance else 'completo' end;

  -- Rango al revés: se da vuelta en lugar de rechazar. Es un error de tipeo
  -- habitual y la intención es evidente; frenar el guardado no ayuda a nadie.
  v_desde := p_desde; v_hasta := p_hasta;
  if v_desde is not null and v_hasta is not null and v_hasta < v_desde then
    v_desde := p_hasta; v_hasta := p_desde;
  end if;

  insert into public.del_auditorias (section_id, fecha, desde, hasta, alcance, equipo, visible_cliente, created_by, updated_at, updated_by)
  values (p_section_id, coalesce(p_fecha, current_date), v_desde, v_hasta, v_alcance,
          coalesce(p_equipo, '{}'), coalesce(p_visible, false), p_by, now(), p_by)
  on conflict (section_id) do update
    set fecha = excluded.fecha, desde = excluded.desde, hasta = excluded.hasta,
        alcance = excluded.alcance, equipo = excluded.equipo,
        visible_cliente = excluded.visible_cliente, updated_at = now(), updated_by = p_by;

  return jsonb_build_object('ok', true);
end
$$;

comment on function public.del_auditoria_set(text,date,date,date,text,text[],boolean,text) is
  'Crea o actualiza el encabezado de una auditoría. Comprueba el permiso de equipo '
  'a mano: un update bloqueado por RLS devolvería 200 sin guardar nada.';

revoke all on function public.del_auditorias_doc(text) from anon;
revoke all on function public.del_auditoria_set(text,date,date,date,text,text[],boolean,text) from anon;
grant execute on function public.del_auditorias_doc(text) to authenticated;
grant execute on function public.del_auditoria_set(text,date,date,date,text,text[],boolean,text) to authenticated;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select count(*) from public.del_auditorias;              -- 0 recién aplicada
--   select public.del_auditorias_doc('<doc_id>');            -- {} si no hay ninguna
--
-- ROLLBACK:
--   drop function if exists public.del_auditoria_set(text,date,date,date,text,text[],boolean,text);
--   drop function if exists public.del_auditorias_doc(text);
--   drop table if exists public.del_auditorias;
