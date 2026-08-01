-- ═════════════════════════════════════════════════════════════════════════════
-- portal_v64_servicio_y_atraso.sql
--
-- 1) Fecha límite del servicio por cliente (clients.service_ends_at). Se configura
--    en Operaciones (ficha del cliente).
-- 2) La Home del portal muestra: días de servicio que le quedan + días que el
--    trabajo está FRENADO por su parte (deuda más vieja sin resolver: grabaciones,
--    revisiones/copy o material).
-- ═════════════════════════════════════════════════════════════════════════════

begin;

alter table public.clients add column if not exists service_ends_at date;

-- Días que el trabajo está frenado esperando al cliente = antigüedad de la deuda
-- más vieja sin resolver (grabaciones / revisiones-copy / material). 0 si no debe.
create or replace function public._portal_atraso(p_client text)
returns int
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(max(dias), 0)::int from (
    -- Grabaciones: guiones para grabar que el equipo no aprobó.
    select greatest(0, extract(day from now() - coalesce(ds.grab_flujo_at, ds.updated_at, ds.imported_at))::int) as dias
    from public.del_sections ds
    left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
    where ds.client_id = p_client and ds.para_grabar and ds.kind in ('vsl','anuncios')
      and not coalesce(gs.grabado, false)
    union all
    -- Revisiones / copy: secciones 'revisar' + terminado sin revisar (incluye pg_*).
    select greatest(0, extract(day from now() - coalesce(ds.updated_at, ds.imported_at))::int)
    from public.del_sections ds
    left join public.portal_guion_status gs on gs.section_id = ds.id and gs.client_id = p_client
    where ds.client_id = p_client and coalesce(ds.estado_seccion,'') = 'terminado'
      and coalesce(ds.accion_cliente,'') = 'revisar' and not coalesce(gs.revisado, false)
    union all
    -- Material: pedidos abiertos.
    select greatest(0, extract(day from now() - pp.pedido_at)::int)
    from public.portal_pedidos pp
    left join lateral (select count(*) n from public.funnel_resources fr
      where fr.client_id = p_client and pp.bucket_key is not null and fr.bucket_key = pp.bucket_key
        and ((pp.strategy_id is null and fr.strategy_id is null) or fr.strategy_id = pp.strategy_id)) cnt on true
    where pp.client_id = p_client and pp.activo and pp.estado not in ('completo','validado')
      and not (pp.target_count is not null and coalesce(cnt.n,0) >= pp.target_count)
      and not (pp.bucket_key is not null and pp.target_count is null and coalesce(cnt.n,0) > 0)
  ) q;
$$;

grant execute on function public._portal_atraso(text) to authenticated, service_role;

-- La Home agrega el bloque 'servicio' (vence · días restantes · días frenado).
create or replace function public.portal_cliente_inicio()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cid text; v_name text; v_prog int; v_done boolean; v_ped jsonb; v_grab jsonb; v_wa text;
  v_rev jsonb; v_run record; v_onb jsonb; p record; v_av jsonb; v_vence date; v_atraso int;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select name, service_ends_at into v_name, v_vence from public.clients where id = v_cid;

  v_av   := public._portal_avance(v_cid);
  v_prog := coalesce((v_av->>'pct')::int, 0);
  v_done := coalesce((v_av->>'done')::boolean, false);
  v_atraso := public._portal_atraso(v_cid);

  v_ped  := public._portal_pedidos_json(v_cid);
  v_grab := public._portal_grabaciones_json(v_cid);
  v_rev  := public._portal_revisiones_json(v_cid);
  select value->>'whatsapp_equipo' into v_wa from public.app_settings where key = 'portal_config';

  select * into v_run from public.onboarding_runs
   where client_id = v_cid and estado <> 'archivado' limit 1;

  if v_run.id is null then
    v_onb := jsonb_build_object('existe', false, 'completo', true);
  else
    select * into p from public.onboarding_progreso(v_run.id);
    v_onb := jsonb_build_object(
      'existe', true, 'completo', v_run.estado = 'completado', 'estado', v_run.estado,
      'pct', p.progreso, 'requeridas', p.requeridas, 'respondidas', p.respondidas,
      'agendaEstado', v_run.agenda_estado, 'agendaAt', v_run.agenda_at, 'bloques', p.bloques,
      'desbloqueadas', coalesce((
        select jsonb_agg(distinct r)
          from jsonb_array_elements(p.bloques) b, jsonb_array_elements_text(b->'desbloquea') r
         where (b->>'total')::int > 0 and (b->>'hechas')::int >= (b->>'total')::int
      ), '[]'::jsonb));
  end if;

  return jsonb_build_object(
    'name', v_name,
    'progreso', v_prog,
    'todosTerminados', v_done,
    'whatsapp', coalesce(v_wa, ''),
    'onboarding', v_onb,
    'servicio', jsonb_build_object(
      'vence', v_vence,
      'diasRestantes', case when v_vence is null then null else (v_vence - current_date) end,
      'diasAtraso', v_atraso),
    'pendientes', v_rev || v_grab || coalesce((
      select jsonb_agg(p2) from jsonb_array_elements(v_ped) p2
      where p2->>'estado' in ('pendiente','cliente_dice_listo')), '[]'::jsonb),
    'completados', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', p2->>'titulo'))
      from jsonb_array_elements(v_ped) p2
      where p2->>'estado' in ('completo','validado')), '[]'::jsonb)
  );
end $$;

commit;

notify pgrst, 'reload schema';
