-- portal_v80_avance_por_funnel.sql   [APLICADA EN PROD 2026-08-02]
--
-- Pedido: "korex ya corregilo, deja de tomar su estrategia de drive, y basate en
-- los dos funnels que tiene. daniel serrano lo mismo".
--
-- El aplanado (funnels_v1) ya habia jubilado el concepto de estrategia: EL FUNNEL
-- ES LA UNIDAD, y cada funnel tiene su propio DEL en strategy_pages.del_doc_id. El
-- panel ya trabajaba asi. Lo que habia quedado con el modelo viejo era el PORTAL:
-- _portal_avance_funnel recorria `strategies` y filtraba del_sections por
-- strategy_id (el ancla de la carpeta de Drive), asi que los 3 funnels de Daniel
-- Serrano y los 2 de Korex se fundian en uno solo.
--
-- Ahora la unidad es strategy_pages.id, y las secciones se buscan por
-- ds.doc_id = sp.del_doc_id.
--
-- Verificado ANTES de tocar: los 62 funnels tienen del_doc_id, y
-- cerebro_pipeline_status YA devolvia funnel_id (el pipeline de produccion ya
-- trabajaba por funnel).
--
-- Verificado DESPUES contra una foto del avance de los 37 clientes:
--   * 34 clientes -> identicos.
--   * Daniel Serrano 1 -> 3 filas, Korex 1 -> 2  (el efecto buscado).
--   * Fabiana Carrasco: mismo numero de filas pero el % se movio de 79 a 69.
--     NO es un bug de esto: sus dos funnels comparten del_doc_id (el funnel
--     "Ricardo Nunez — Reclutamiento" apunta al DEL de Fabiana y no tiene uno
--     propio). Es el unico caso en todo el sistema. Queda anotado como dato a
--     corregir, no se toco.
--
-- Que se resuelve por que:
--   * DEL (guiones, revisiones, copy)  -> por del_doc_id  (propio de cada funnel)
--   * recursos y material del cliente  -> por strategy_id (la carpeta, compartida)
--
-- La firma NO cambia (sigue devolviendo `sid`) para no romper a los consumidores,
-- pero ahora sid es el id del FUNNEL, no el de la estrategia.

create or replace function public._portal_avance_funnel(p_client text)
 returns table(sid text, prod_done integer, prod_total integer, grab_hay boolean, grab_pend boolean, rev_hay boolean, rev_pend boolean, mat_hay boolean, mat_pend boolean, done integer, total integer, pct integer, pend boolean, completo boolean)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with
  prod as (
    select funnel_id,
           count(*) filter (where status = 'listo') as done,
           count(*) as total
    from public.cerebro_pipeline_status(p_client)
    where funnel_id is not null
    group by funnel_id
  ),
  funnels as (
    -- SOLO 'antiguo' queda congelado en 100% (viejo/entregado). 'activa' gana su %.
    select sp.id as sid, sp.del_doc_id, sp.strategy_id,
           (sp.status = 'antiguo') as lanzado
    from public.strategy_pages sp
    where sp.client_id = p_client
  ),
  pf as (
    select f.sid, f.lanzado,
      coalesce(pr.done,0) as prod_done, coalesce(pr.total,0) as prod_total,
      exists(select 1 from public.del_sections ds
             where ds.doc_id = f.del_doc_id and ds.para_grabar and ds.kind in ('vsl','anuncios')
               and coalesce(ds.fase,'lanzamiento') = 'lanzamiento') as grab_hay,
      -- Pendiente = guion de lanzamiento que el equipo NO aprobo como grabado.
      exists(select 1 from public.del_sections ds
             where ds.doc_id = f.del_doc_id and ds.para_grabar and ds.kind in ('vsl','anuncios')
               and coalesce(ds.fase,'lanzamiento') = 'lanzamiento'
               and coalesce(ds.grab_flujo,'') <> 'grabado') as grab_pend,
      exists(select 1 from public.del_sections ds
             where ds.doc_id = f.del_doc_id and coalesce(ds.estado_seccion,'') = 'terminado'
               and coalesce(ds.accion_cliente,'') = 'revisar'
               and coalesce(ds.fase,'lanzamiento') = 'lanzamiento') as rev_hay,
      exists(select 1 from public.del_sections ds
             left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
             where ds.doc_id = f.del_doc_id and coalesce(ds.estado_seccion,'') = 'terminado'
               and coalesce(ds.accion_cliente,'') = 'revisar'
               and coalesce(ds.fase,'lanzamiento') = 'lanzamiento'
               and not coalesce(gs.revisado, false)) as rev_pend,
      exists(select 1 from public.portal_pedidos pp
             where pp.client_id = p_client and pp.activo and pp.strategy_id = f.strategy_id) as mat_hay,
      exists(select 1 from public.portal_pedidos pp
             left join lateral (select count(*) n from public.funnel_resources fr
               where fr.client_id = p_client and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
                 and fr.strategy_id = pp.strategy_id) cnt on true
             where pp.client_id = p_client and pp.activo and pp.strategy_id = f.strategy_id
               and pp.estado not in ('completo','validado')
               and not (pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count)
               and not (pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0)) as mat_pend
    from funnels f
    left join prod pr on pr.funnel_id = f.sid
  ),
  calc as (
    select pf.*,
      case when lanzado then
        prod_total + case when grab_hay then 1 else 0 end + case when rev_hay then 1 else 0 end + case when mat_hay then 1 else 0 end
      else
        prod_done
        + case when grab_hay and not grab_pend then 1 else 0 end
        + case when rev_hay  and not rev_pend  then 1 else 0 end
        + case when mat_hay  and not mat_pend  then 1 else 0 end
      end as done_c,
      prod_total
        + case when grab_hay then 1 else 0 end
        + case when rev_hay  then 1 else 0 end
        + case when mat_hay  then 1 else 0 end as total_c
    from pf
  )
  select sid, prod_done, prod_total, grab_hay, grab_pend, rev_hay, rev_pend, mat_hay, mat_pend,
    done_c, total_c,
    case when lanzado then 100 when total_c = 0 then 0 else round(done_c::numeric / total_c * 100)::int end,
    (not lanzado and (grab_pend or rev_pend or mat_pend)),
    (lanzado or (prod_total > 0 and prod_done = prod_total and not grab_pend and not rev_pend and not mat_pend))
  from calc
  where prod_total > 0 or grab_hay or rev_hay or mat_hay or lanzado;
$function$;
