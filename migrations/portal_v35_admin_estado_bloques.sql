-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v35_admin_estado_bloques.sql
--
-- Lo que ve el operador en la ficha del cliente suma el desglose por bloque, la
-- fecha de grabación y el id del documento del cerebro.
--
-- Además `minChars` se reemplaza por `largo`: la columna `min_chars` quedó
-- muerta en v28 (el número ahora es el OBJETIVO y el mínimo es su 60%), así que
-- el panel estaba mostrando 0 en todas las preguntas y el operador no podía ver
-- si una respuesta había quedado corta.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.onboarding_admin_estado(p_client_id text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_run text; v_r record; p record;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  select id into v_run from public.onboarding_runs
   where client_id = p_client_id and estado <> 'archivado' limit 1;
  if v_run is null then
    return jsonb_build_object('ok', true, 'existe', false);
  end if;
  select * into v_r from public.onboarding_runs where id = v_run;
  select * into p from public.onboarding_progreso(v_run);

  return jsonb_build_object(
    'ok', true, 'existe', true, 'runId', v_run, 'estado', v_r.estado,
    'progreso', p.progreso, 'requeridas', p.requeridas, 'respondidas', p.respondidas,
    'faltan', to_jsonb(p.faltan), 'bloqueantes', p.bloqueantes, 'bloques', p.bloques,
    'agenda', jsonb_build_object('estado', v_r.agenda_estado, 'at', v_r.agenda_at,
                                 'motivo', v_r.agenda_motivo,
                                 'grabacion', v_r.grabacion_fecha),
    'invitadoAt', v_r.invitado_at, 'inviteCount', v_r.invite_count,
    'inviteCanal', v_r.invite_canal, 'inviteError', v_r.invite_last_error,
    'startedAt', v_r.started_at, 'lastSeenAt', v_r.last_seen_at,
    'completadoAt', v_r.completado_at, 'writebackAt', v_r.writeback_at,
    'writebackWarning', v_r.writeback_warning,
    'textoSyncAt', v_r.texto_sync_at,
    'documento', 'onb_' || p_client_id,
    'respuestas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'qkey', q.qkey, 'seccion', s.badge || ' · ' || s.titulo, 'label', q.label,
        'largo', q.largo_objetivo,
        'valor', coalesce(a.value_text,''), 'chars', length(coalesce(a.value_text,'')),
        'source', a.source, 'flag', a.flag, 'updatedAt', a.updated_at)
        order by q.plantilla_ord)
      from public.onboarding_questions q
      join public.onboarding_sections s on s.skey = q.skey and s.activa
      left join public.onboarding_answers a on a.run_id = v_run and a.qkey = q.qkey
      where q.activa and s.bkey is not null), '[]'::jsonb)
  );
end $$;

notify pgrst, 'reload schema';
