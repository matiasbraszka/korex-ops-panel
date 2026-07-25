-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente v22 — ONBOARDING: calendario, pedidos y muro
-- Aplicada a prod el 2026-07-25 vía MCP. FALTA asignar member_ids al calendario
-- 'onboarding' en Soporte › Calendarios: sin eso no ofrece ni un horario.
--
--  1) Siembra el tipo de reunión "Sesión de Onboarding" en booking_calendars —
--     el sistema de agenda que ya tenemos en Soporte. No se construye nada
--     nuevo: reusamos agenda-publica, que ya resuelve disponibilidad cruzada,
--     free/busy de Google, evento en Google Calendar, link de Zoom, WhatsApp de
--     confirmación al cliente y al equipo, y recordatorios por cron.
--
--     El min_notice_hours = 72 aplica por sistema la regla que hoy se pide a
--     mano en el mensaje de handoff ("agenden con 72 horas de anticipación").
--
--  2) Corrige un bug de configuración: la plantilla de pedidos de portal_v9
--     tiene logo y fotos como NO bloqueantes y acceso_meta como bloqueante —
--     al revés de lo que corresponde. Sin logo y sin fotos no se puede diseñar
--     nada; el acceso a Meta se resuelve en la sesión, no debería frenar el
--     onboarding.
--
--  3) portal_cliente_inicio() pasa a informar el estado del onboarding para
--     que el portal pueda pintar el muro suave.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1 · Calendario de la sesión de onboarding ────────────────────────────────
do $$
declare v_id uuid; v_token text;
begin
  if to_regclass('public.booking_calendars') is null then
    raise notice 'booking_calendars no existe: se omite el seed del calendario de onboarding';
    return;
  end if;

  select id, public_token into v_id, v_token
    from public.booking_calendars where slug = 'onboarding';

  if v_id is null then
    v_token := substr(md5(random()::text || clock_timestamp()::text), 1, 20);
    insert into public.booking_calendars (
      slug, public_token, name, purpose, duration_min,
      gcal_title_template, gcal_color_id,
      member_ids, host_name, host_role, description,
      questions, booking_window_days, min_notice_hours, confirm_instructions, active)
    values (
      'onboarding', v_token, 'Sesión de Onboarding', 'Servicio', 60,
      'Onboarding Korex — {nombre}', '9',
      -- member_ids vacío A PROPÓSITO: hay que elegir en Soporte › Calendarios
      -- quiénes atienden. Con el array vacío agenda-publica devuelve
      -- configured:false y no ofrece horarios — es el comportamiento correcto,
      -- mejor no ofrecer nada que ofrecer un horario que nadie atiende.
      '{}'::text[], '', '',
      'Repasamos juntos lo que completaste, profundizamos en lo que haga falta y dejamos configurado el acceso a Meta. Vení con tu celular a mano.',
      '[]'::jsonb,
      60,
      72,   -- la regla de las 72 horas, aplicada por el sistema
      jsonb_build_array(
        'Es por videollamada. El link te llega por WhatsApp y por mail.',
        'Que sea desde una computadora si podés: vamos a compartir pantalla.',
        'Tené a mano el celular con el que administrás tu Facebook e Instagram.',
        'Dura una hora. Si necesitás reprogramar, avisanos con 24 horas.'
      ),
      true)
    returning id, public_token into v_id, v_token;

    raise notice 'Calendario de onboarding creado. FALTA asignar member_ids en Soporte › Calendarios.';
  end if;

  -- El portal necesita el token para llamar a agenda-publica.
  update public.app_settings
     set value = coalesce(value,'{}'::jsonb) || jsonb_build_object('onboarding_calendar_token', v_token)
   where key = 'portal_config';
end $$;


-- ── 2 · Pedidos: bloquean logo y fotos, no Meta ──────────────────────────────
update public.app_settings
   set value = jsonb_build_array(
     jsonb_build_object('tipo','fotos','titulo','Sube 5 fotos tuyas',
       'descripcion','Que se te vea bien la cara. Con fotos del celular alcanza — no hace falta sesión de fotos.',
       'bucket_key','autoridad','target_count',5,'bloqueante',true,'orden',2),
     jsonb_build_object('tipo','logo','titulo','Tu logo y tus colores',
       'descripcion','Para que todo lo que publiquemos salga con tu identidad.',
       'bucket_key','branding','target_count',1,'bloqueante',true,'orden',3),
     jsonb_build_object('tipo','acceso_meta','titulo','Danos acceso a Meta',
       'descripcion','No configuras nada solo: lo dejamos listo juntos en tu sesión de onboarding.',
       'bucket_key',null,'target_count',null,'bloqueante',false,'orden',4)
   )
 where key = 'portal_pedidos_template';

-- Las filas ya creadas para los 35 clientes vivos tienen la configuración vieja.
update public.portal_pedidos set bloqueante = true,  target_count = 5
 where tipo = 'fotos' and activo;
update public.portal_pedidos set bloqueante = true,  target_count = coalesce(target_count, 1)
 where tipo = 'logo' and activo;
update public.portal_pedidos set bloqueante = false
 where tipo = 'acceso_meta' and activo;

-- Compromiso con fecha para lo que no bloquea pero tampoco puede quedar suelto
-- (testimonios en video, acceso a Meta).
alter table public.portal_pedidos add column if not exists compromiso_at date;


-- ── 3 · portal_cliente_inicio() informa el onboarding ────────────────────────
-- Misma función de v10 más el bloque `onboarding`, que es lo que el portal usa
-- para decidir si pinta los candados. El enforcement del muro es del front a
-- propósito: es un muro suave, y bloquear las RPCs solo agregaría maneras de
-- que un cliente quede trabado sin ningún beneficio.
create or replace function public.portal_cliente_inicio()
returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
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

  -- Bloque nuevo: estado del onboarding para el muro suave.
  select * into v_run from public.onboarding_runs
   where client_id = v_cid and estado <> 'archivado' limit 1;

  if v_run.id is null then
    v_onb := jsonb_build_object('existe', false, 'completo', true);   -- sin run, no hay muro
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
      'desbloqueadas', coalesce((
        select jsonb_agg(distinct s.desbloquea)
        from public.onboarding_sections s
        where s.activa and s.desbloquea is not null
          and not exists (
            select 1 from public.onboarding_questions q
            left join public.onboarding_answers a on a.run_id = v_run.id and a.qkey = q.qkey
            where q.skey = s.skey and q.activa and q.requerida
              and public._onboarding_visible(v_run.id, q.visible_si)
              and (case when q.qtype = 'subida'
                        then (select count(*) from public.funnel_resources fr
                               where fr.client_id = v_cid and fr.bucket_key = q.bucket_key)
                             < greatest(coalesce(q.target_count,1),1)
                        else length(btrim(coalesce(a.value_text,''))) < greatest(q.min_chars,1)
                   end)
          )), '[]'::jsonb)
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
end $function$;

notify pgrst, 'reload schema';
