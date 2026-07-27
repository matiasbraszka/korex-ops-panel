-- ─────────────────────────────────────────────────────────────────────────────
-- del_v9_section_set_meta.sql
--
-- "Terminado" y "Grabación" no se guardaban. Al recargar volvían atrás, y el
-- guion nunca le aparecía al cliente en su plataforma.
--
-- Por qué: `del_sections` tiene RLS con UNA sola política, de SELECT. No hay
-- política de UPDATE. Pero el rol `authenticated` SÍ tiene el GRANT de UPDATE,
-- así que PostgREST no devuelve 403: ejecuta el update, RLS no deja pasar
-- ninguna fila, y responde 200 con cero filas afectadas. El panel veía
-- `error === null`, se quedaba con el estado optimista y no volvía a preguntar.
-- Silencio absoluto: ni error en pantalla, ni error en consola.
--
-- Todas las demás escrituras del DEL (guardar, renombrar, versionar, cambiar de
-- categoría, publicar) ya van por RPC SECURITY DEFINER justamente por esto.
-- Estas dos se habían quedado escribiendo derecho a la tabla.
--
-- Se arregla con la RPC que faltaba, no abriendo una política de UPDATE: con una
-- política amplia, cualquier usuario autenticado podría reescribir el `html` de
-- cualquier sección de cualquier cliente salteándose `del_section_save` — que es
-- la que adopta el DEL y evita que el importador de Drive lo pise.
--
-- A diferencia de las otras RPCs, esta NO llama a `del_claim`: marcar una
-- pestaña como terminada es metadato de trabajo, no una edición de contenido, y
-- no tiene por qué cortarle la sincronización con Drive a todo el documento.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.del_section_set_meta(
  p_id          text,
  p_accion      text    default null,
  p_estado      text    default null,
  p_para_grabar boolean default null,
  p_orden       integer default null,
  p_by          text    default null
)
returns void
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_existe boolean;
begin
  if not public.is_team_member() then
    raise exception 'no autorizado';
  end if;

  if p_accion is not null and p_accion not in ('grabarse', 'revisar', 'solo_ver', 'solo_equipo') then
    raise exception 'accion_cliente invalida: %', p_accion;
  end if;
  if p_estado is not null and p_estado not in ('en_construccion', 'terminado') then
    raise exception 'estado_seccion invalido: %', p_estado;
  end if;

  select true into v_existe from public.del_sections where id = p_id;
  if v_existe is null then
    raise exception 'seccion inexistente: %', p_id;
  end if;

  -- Cada campo se toca solo si viene. Así la misma RPC sirve para el selector de
  -- acción, el de estado y el interruptor de grabación, sin que uno pise al otro.
  update public.del_sections
     set accion_cliente  = coalesce(p_accion, accion_cliente),
         estado_seccion  = coalesce(p_estado, estado_seccion),
         para_grabar     = coalesce(p_para_grabar, para_grabar),
         orden_grabacion = coalesce(p_orden, orden_grabacion, ord),
         updated_at      = now(),
         updated_by      = coalesce(p_by, updated_by)
   where id = p_id;
end $$;

revoke execute on function public.del_section_set_meta(text, text, text, boolean, integer, text) from public, anon;
grant  execute on function public.del_section_set_meta(text, text, text, boolean, integer, text) to authenticated, service_role;

notify pgrst, 'reload schema';
