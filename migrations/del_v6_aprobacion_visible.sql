-- migrations/del_v6_aprobacion_visible.sql
--
-- Punto 6: «si un cliente aprueba un guión de ads o VSL y no puso ningún comentario,
-- al instante se coloca para que se lo grabe. En el DEL también que se haga bien eso
-- automático.»
--
-- La primera mitad YA FUNCIONA en producción: portal_cliente_toggle_revisado
-- (portal_v77_estado_aprobado.sql:25-96) hace exactamente eso — si no hay comentarios
-- abiertos, pone para_grabar = true, accion_cliente = 'grabarse' y grab_flujo =
-- 'grabacion' en el mismo instante.
--
-- Lo que falta es el DEL. Hoy un guión aprobado por el cliente y uno que el equipo
-- mandó a grabar a mano se ven EXACTAMENTE IGUAL: los dos dicen "🎬 Grabación". No
-- hay forma de saber cuál pasó por el cliente. Esta migración resuelve dos cosas:
--
--   1. del_grab_aprobacion(doc_id) → quién movió cada sección a su estado actual y
--      cuándo. Una consulta por DEL, no una por sección.
--   2. del_section_set_meta deriva `para_grabar` en el SERVIDOR. Hasta ahora la regla
--      ("grabable + grabarse + terminado ⇒ para grabar") vivía SOLO en JavaScript
--      (DelEditor.jsx) y la función se limitaba a copiar el booleano que le mandaran:
--      cualquier otro llamador dejaba el flag desincronizado del combo.
--      Verificado antes de aplicar: las 23 secciones marcadas hoy cumplen la regla,
--      así que derivarla no cambia ningún dato existente.
--
-- Se decidió MANTENER los dos caminos (el equipo puede seguir mandando a grabar sin
-- esperar al cliente). Lo que cambia es que ahora se distinguen.

-- ── 1. Quién movió cada sección, y cuándo ───────────────────────────────────
create or replace function public.del_grab_aprobacion(p_doc_id text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select case when not public.is_team_member() then '{}'::jsonb else coalesce((
    select jsonb_object_agg(x.section_id, jsonb_build_object(
      'estado', x.estado,
      'actorTipo', x.actor_tipo,      -- 'cliente' | 'colaborador' | 'korex'
      'actorNombre', x.actor_nombre,
      'at', x.at
    ))
    from (
      select distinct on (h.section_id)
             h.section_id, h.estado, h.actor_tipo, h.actor_nombre, h.at
        from public.del_grab_historial h
        join public.del_sections ds on ds.id = h.section_id
       where ds.doc_id = p_doc_id
       order by h.section_id, h.at desc
    ) x
  ), '{}'::jsonb) end;
$function$;

comment on function public.del_grab_aprobacion(text) is
  'Último movimiento de estado de cada sección del DEL, con quién lo hizo. Sirve para '
  'distinguir en el panel un guión aprobado POR EL CLIENTE de uno que el equipo mandó '
  'a grabar a mano: los dos quedan en grab_flujo = grabacion.';

revoke all   on function public.del_grab_aprobacion(text) from public, anon;
grant execute on function public.del_grab_aprobacion(text) to authenticated;

-- ── 2. `para_grabar` se deriva en el servidor ───────────────────────────────
-- Se parte de la definición VIVA (portal_v83_flujo_aprobacion.sql:140-193) y se cambia
-- solo el cálculo de para_grabar. El resto de la máquina de estados queda igual.
create or replace function public.del_section_set_meta(
  p_id text, p_accion text default null, p_estado text default null,
  p_para_grabar boolean default null, p_orden integer default null, p_by text default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_existe boolean; v_accion text; v_estado text; v_kind text; v_flujo text; v_prev text;
begin
  if not public.is_team_member() then raise exception 'no autorizado'; end if;
  if p_accion is not null and p_accion not in ('grabarse','revisar','solo_ver','solo_equipo') then
    raise exception 'accion_cliente invalida: %', p_accion; end if;
  if p_estado is not null and p_estado not in ('en_construccion','terminado') then
    raise exception 'estado_seccion invalido: %', p_estado; end if;

  select true into v_existe from public.del_sections where id = p_id;
  if v_existe is null then raise exception 'seccion inexistente: %', p_id; end if;

  update public.del_sections
     set accion_cliente  = coalesce(p_accion, accion_cliente),
         estado_seccion  = coalesce(p_estado, estado_seccion),
         orden_grabacion = coalesce(p_orden, orden_grabacion, ord),
         updated_at      = now(),
         updated_by      = coalesce(p_by, updated_by)
   where id = p_id;

  select accion_cliente, estado_seccion, kind, grab_flujo
    into v_accion, v_estado, v_kind, v_prev from public.del_sections where id = p_id;

  -- "Para grabar" NO es un dato suelto que cada pantalla setea por su cuenta: es una
  -- consecuencia de qué tipo de sección es + qué le toca al cliente + si está terminada.
  -- Solo el VSL y los anuncios se graban con cámara; una landing se aprueba y pasa a
  -- diseño, nunca "a grabación".
  update public.del_sections
     set para_grabar = (v_kind in ('vsl','anuncios')
                        and coalesce(v_accion,'') = 'grabarse'
                        and coalesce(v_estado,'') = 'terminado')
   where id = p_id;

  if coalesce(v_estado,'') <> 'terminado' or coalesce(v_accion,'') = 'solo_equipo' then
    v_flujo := null;
  elsif v_prev in ('aprobado','grabado','correccion') then
    return;   -- cerrado o con la pelota en Korex: editar meta NO lo mueve
  elsif coalesce(v_accion,'') = 'revisar' then
    v_flujo := 'revision';
  elsif coalesce(v_accion,'') = 'grabarse' and v_kind in ('vsl','anuncios') then
    v_flujo := 'grabacion';
  else
    v_flujo := null;
  end if;

  if v_flujo = 'revision' and coalesce(v_prev,'') <> 'revision' then
    update public.portal_guion_status set revisado = false, revisado_at = null, updated_at = now()
     where section_id = p_id;
  end if;

  perform public._del_grab_set(p_id, v_flujo, 'korex', coalesce(p_by, 'Korex'));
end
$function$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   -- Que derivar no cambie nada de lo que ya está (tiene que dar 0):
--   select count(*) from public.del_sections
--    where para_grabar <> (kind in ('vsl','anuncios')
--                          and coalesce(accion_cliente,'') = 'grabarse'
--                          and coalesce(estado_seccion,'') = 'terminado');
--
--   -- Y que la RPC devuelva algo para un DEL con historial:
--   select public.del_grab_aprobacion('<doc_id>');   -- con sesión de equipo
--
-- ROLLBACK: volver a aplicar migrations/portal_v83_flujo_aprobacion.sql (del_section_set_meta)
--           y drop function public.del_grab_aprobacion(text);
