-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v34_inicio_desbloqueo_por_bloque.sql
--
-- Qué pestañas del portal se abren pasa a decidirlo el BLOQUE, no el tramo.
--
-- El v1 leía `onboarding_sections.desbloquea` y repetía a mano el cálculo de
-- "¿está completo?" con su propia copia de las reglas (min_chars, subidas,
-- visibilidad). Dos copias de la misma regla siempre terminan diciendo cosas
-- distintas: bastaba con cambiar el umbral en un lado para que el candado y el
-- porcentaje dejaran de coincidir.
--
-- Ahora sale de `onboarding_progreso(...).bloques`, que es la única fuente: un
-- bloque abre sus rutas cuando todas sus obligatorias visibles están llenas.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.portal_cliente_inicio()
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cid text; v_name text; v_prog int; v_done boolean; v_ped jsonb; v_grab jsonb; v_wa text;
  v_run record; v_onb jsonb; p record;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select name into v_name from public.clients where id = v_cid;

  select coalesce(round(avg((e-1)/3.0)*100)::int, 0), coalesce(bool_and(e = 4), false) and count(*) > 0
    into v_prog, v_done
  from (select public._portal_etapa(s.id, s.status) e from public.strategies s where s.client_id = v_cid) q;

  v_ped  := public._portal_pedidos_json(v_cid);
  v_grab := public._portal_grabaciones_json(v_cid);
  select value->>'whatsapp_equipo' into v_wa from public.app_settings where key = 'portal_config';

  select * into v_run from public.onboarding_runs
   where client_id = v_cid and estado <> 'archivado' limit 1;

  if v_run.id is null then
    v_onb := jsonb_build_object('existe', false, 'completo', true);
  else
    select * into p from public.onboarding_progreso(v_run.id);
    v_onb := jsonb_build_object(
      'existe', true,
      'completo', v_run.estado = 'completado',
      'estado', v_run.estado,
      'pct', p.progreso,
      'requeridas', p.requeridas,
      'respondidas', p.respondidas,
      'agendaEstado', v_run.agenda_estado,
      'agendaAt', v_run.agenda_at,
      'bloques', p.bloques,
      'desbloqueadas', coalesce((
        select jsonb_agg(distinct r)
          from jsonb_array_elements(p.bloques) b,
               jsonb_array_elements_text(b->'desbloquea') r
         where (b->>'total')::int > 0
           and (b->>'hechas')::int >= (b->>'total')::int
      ), '[]'::jsonb)
    );
  end if;

  return jsonb_build_object(
    'name', v_name,
    'progreso', case when v_done then 100 else v_prog end,
    'todosTerminados', v_done,
    'whatsapp', coalesce(v_wa, ''),
    'onboarding', v_onb,
    'pendientes', v_grab || coalesce((
      select jsonb_agg(p2) from jsonb_array_elements(v_ped) p2
      where p2->>'estado' in ('pendiente','cliente_dice_listo')), '[]'::jsonb),
    'completados', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', p2->>'titulo'))
      from jsonb_array_elements(v_ped) p2
      where p2->>'estado' in ('completo','validado')), '[]'::jsonb)
  );
end $$;

notify pgrst, 'reload schema';
