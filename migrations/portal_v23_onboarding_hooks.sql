-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente v23 — ONBOARDING: cierre y efectos
-- Aplicada a prod el 2026-07-25 vía MCP.
--
-- Migración aparte a propósito: permite tener el cuestionario andando y probado
-- (v18-v22) antes de encender los efectos secundarios, que son los que le
-- escriben a Slack y crean tareas reales del equipo.
--
-- Sobre el gate: NO hay que tocar nada. descubrimiento_status ya mira
--   exists(client_brain_docs where doc_kind='onboarding' and char_count > 0)
-- así que escribir el documento en el write-back destraba el paso 4 solo. Ese
-- es todo el punto del ejercicio.
--
-- Sobre los agentes IA: NO se disparan desde acá. agent-chat es interactivo,
-- cuesta tokens y un fallo lanzado desde la base es invisible. El mensaje de
-- Slack lleva el link para que una persona lo arranque.
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.portal_onboarding_completar()
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cid text; v_run record; p record; v_wb jsonb; v_nombre text;
  v_faltan jsonb; v_tid text; v_due text; v_conector text;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false, 'error', 'sin_cliente'); end if;

  select * into v_run from public.onboarding_runs
   where client_id = v_cid and estado <> 'archivado' limit 1;
  if v_run.id is null then return jsonb_build_object('ok', false, 'error', 'sin_run'); end if;

  select * into p from public.onboarding_progreso(v_run.id);

  -- ¿Llegó de verdad al 100%? Devolvemos QUÉ falta, con label, para que la UI
  -- lo lleve directo ahí en vez de mostrar un "faltan cosas" inútil.
  if p.progreso < 100 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'qkey', q.qkey, 'label', q.label, 'skey', q.skey,
             'seccion', s.titulo) order by s.orden, q.orden), '[]'::jsonb)
      into v_faltan
      from public.onboarding_questions q
      join public.onboarding_sections s on s.skey = q.skey
     where q.qkey = any(p.faltan);

    return jsonb_build_object('ok', false, 'error', 'faltan',
      'progreso', p.progreso, 'faltan', v_faltan, 'bloqueantes', p.bloqueantes);
  end if;

  -- Write-back. Si la guarda anti-catástrofe lo frena, NO cerramos el run:
  -- cerrarlo dejaría al cliente creyendo que terminó con el cerebro vacío.
  v_wb := public.onboarding_writeback(v_cid, false);
  if not coalesce((v_wb->>'ok')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'writeback_fallo', 'detalle', v_wb);
  end if;

  update public.onboarding_runs
     set estado = 'completado', completado_at = now(),
         progreso = 100, respondidas = p.respondidas, requeridas = p.requeridas
   where id = v_run.id;

  select name, conector into v_nombre, v_conector from public.clients where id = v_cid;

  insert into public.portal_eventos (client_id, tipo, payload)
  values (v_cid, 'onboarding_completo', jsonb_build_object(
    'respondidas', p.respondidas, 'requeridas', p.requeridas,
    'chars', v_wb->>'chars', 'agenda_at', v_run.agenda_at));

  -- ── Tareas del equipo ──────────────────────────────────────────────────────
  v_due := to_char(coalesce(v_run.agenda_at, now() + interval '3 days'), 'YYYY-MM-DD');

  v_tid := 'tsk_'||replace(gen_random_uuid()::text,'-','');
  insert into public.tasks (id, title, client_id, assignee, priority, status, description, due_date, created_by)
  values (v_tid, 'Revisar onboarding y arrancar Descubrimiento — '||coalesce(v_nombre,''),
          v_cid, coalesce(v_conector,''), 'alta', 'backlog',
          'El cliente completó el onboarding en la plataforma ('||coalesce(v_wb->>'chars','?')
          ||' caracteres). El documento ya está en el cerebro con doc_kind=onboarding, '
          ||'así que el paso 4 de Descubrimiento quedó destrabado.',
          v_due, 'onboarding');

  if v_run.agenda_estado = 'agendado' then
    v_tid := 'tsk_'||replace(gen_random_uuid()::text,'-','');
    insert into public.tasks (id, title, client_id, assignee, priority, status, description, due_date, created_by)
    values (v_tid, 'Sesión de onboarding con '||coalesce(v_nombre,''),
            v_cid, coalesce(v_conector,''), 'alta', 'backlog',
            'Repasar respuestas, profundizar lo que quedó flojo y dejar configurado el acceso a Meta.',
            v_due, 'onboarding');
  else
    v_tid := 'tsk_'||replace(gen_random_uuid()::text,'-','');
    insert into public.tasks (id, title, client_id, assignee, priority, status, description, created_by)
    values (v_tid, 'Agendar a mano la sesión de onboarding de '||coalesce(v_nombre,''),
            v_cid, coalesce(v_conector,''), 'alta', 'backlog',
            'El cliente terminó el onboarding pero no pudo agendar desde la plataforma'
            ||coalesce(' ('||nullif(v_run.agenda_motivo,'')||')','')||'.',
            'onboarding');
  end if;

  -- ── Slack al canal del cliente ─────────────────────────────────────────────
  perform public._portal_slack(v_cid,
    '🎉 *'||coalesce(v_nombre,'Cliente')||'* terminó su onboarding en la plataforma.'||E'\n'
    ||'• '||p.respondidas||'/'||p.requeridas||' respuestas · '||coalesce(v_wb->>'chars','?')||' caracteres al cerebro'||E'\n'
    ||case when v_run.agenda_at is not null
           then '• Sesión agendada para el '
                ||to_char(v_run.agenda_at at time zone 'America/Argentina/Buenos_Aires','DD/MM à HH24:MI')
                ||' (hora AR)'||E'\n'
           else '• ⚠️ Sin sesión agendada — hay que agendarla a mano'||E'\n' end
    ||case when coalesce(v_wb->>'warning','') <> ''
           then '• ⚠️ '||(v_wb->>'warning')||E'\n' else '' end
    ||'• Descubrimiento paso 4 destrabado: ya se puede correr el analista.');

  return jsonb_build_object('ok', true, 'progreso', 100,
                            'chars', v_wb->>'chars',
                            'agendaAt', v_run.agenda_at,
                            'warning', v_wb->>'warning');
end $$;

grant execute on function public.portal_onboarding_completar() to authenticated;

notify pgrst, 'reload schema';
