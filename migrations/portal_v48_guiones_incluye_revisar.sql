-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v48_guiones_incluye_revisar.sql
--
-- La pestaña "Guiones" es donde el cliente va a buscar sus guiones, pero solo
-- listaba los de `para_grabar`. Una pestaña puesta en "Revisar" existía en la
-- Home y adentro del documento, y en el único lugar del portal que se llama
-- Guiones no estaba.
--
-- `portal_cliente_guiones` pasa a devolver las dos cosas, con `tarea` diciendo
-- cuál es cuál: 'grabar' o 'revisar'. La pantalla las separa por su cuenta entre
-- pendientes y hechas.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

create or replace function public.portal_cliente_guiones()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select case when public.portal_cliente_client() is null then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', ds.id,
      'strategyId', ds.strategy_id,
      'docTipo', case ds.kind when 'vsl' then 'vsl' else 'ads' end,
      'funnel', s.name,
      'titulo', ds.title,
      -- Qué le pedimos con esta pestaña. Lo decide el DEL, no la pantalla.
      'tarea', case when ds.para_grabar then 'grabar' else 'revisar' end,
      'snippet', left(regexp_replace(coalesce(ds.text,''), '\s+', ' ', 'g'), 160),
      'palabras', coalesce(array_length(regexp_split_to_array(btrim(coalesce(ds.text,'')), E'\\s+'), 1), 0),
      'grabado', coalesce(gs.grabado, false),
      'revisado', coalesce(gs.revisado, false),
      -- "Entregado" es de las de grabar; en una de revisar no significa nada.
      'entregado', ds.para_grabar and exists (
        select 1 from public.funnel_resources fr
        where fr.strategy_id = ds.strategy_id
          and fr.bucket_key in (case ds.kind when 'vsl' then 'vsl_rec' else 'ad_rec' end,
                                case ds.kind when 'vsl' then 'vsl_edit' else 'ad_edit' end))
    ) order by
      case when s.status = 'activa' then 1 else 0 end,
      s.position,
      case ds.kind when 'anuncios' then 0 else 1 end,
      coalesce(ds.orden_grabacion, ds.ord, 0), ds.title)
    from public.del_sections ds
    join public.strategies s on s.id = ds.strategy_id
    left join public.portal_guion_status gs
      on gs.section_id = ds.id and gs.client_id = public.portal_cliente_client()
    where s.client_id = public.portal_cliente_client()
      and ds.kind in ('anuncios','vsl')
      and (ds.para_grabar
           or (coalesce(ds.estado_seccion,'') = 'terminado'
               and coalesce(ds.accion_cliente,'') = 'revisar'))
  ), '[]'::jsonb) end;
$function$;

commit;

notify pgrst, 'reload schema';
