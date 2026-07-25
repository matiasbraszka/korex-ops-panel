-- ═════════════════════════════════════════════════════════════════════════════
-- Portal del cliente v15 — ONBOARDING: esquema base
--
-- El onboarding deja de ser un Google Doc que el cliente completa por fuera y
-- pasa a ser la primera pantalla de la plataforma. Cinco tablas:
--
--   onboarding_sections   catálogo de tramos (título, promesa, video)
--   onboarding_questions  catálogo de preguntas (label, ejemplo, min_chars, destino)
--   onboarding_runs       un onboarding de un cliente (estado, agenda, progreso)
--   onboarding_answers    una fila POR RESPUESTA (autosave sin race)
--   onboarding_answer_log historial de lo que se pisó o borró
--
-- Decisiones que valen la pena documentar acá:
--
--  · FILA POR RESPUESTA, no un jsonb único. `on conflict (run_id,qkey) do update`
--    es atómico; con un blob, dos pestañas abiertas se pisan con jsonb_set.
--    "El progreso nunca se pierde" es requisito duro, no aspiración.
--
--  · qkey SIN FK a onboarding_questions. Si el equipo desactiva o reordena una
--    pregunta, la respuesta sobrevive y simplemente deja de contar. Esto evita
--    tener que versionar el formulario.
--
--  · LA AGENDA NO TIENE TABLA PROPIA. La reserva vive en public.appointments
--    (el sistema de agenda de Korex, que ya hace Google Calendar + Zoom +
--    WhatsApp + recordatorios); acá solo guardamos el FK.
--
--  · RLS solo-equipo en las 5 tablas. El cliente NUNCA las lee directo: todo
--    pasa por RPCs security definer (portal_v17). Es la doctrina del portal.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1 · Catálogo: tramos ─────────────────────────────────────────────────────
create table if not exists public.onboarding_sections (
  skey        text primary key,                  -- 'agenda' | 'datos' | 'material' | 'historia' | …
  titulo      text not null,
  subtitulo   text not null default '',
  promesa     text not null default '',          -- "Con esto ya podemos escribir tu VSL"
  intro_md    text not null default '',
  video_url   text,                              -- Bunny/YouTube; si es null el bloque no se renderiza
  minutos     int  not null default 0,           -- estimado, para el "te quedan ~18 minutos"
  checkpoint  boolean not null default false,    -- ofrece "podés parar acá" al cerrarlo
  desbloquea  text,                              -- ruta del portal que se abre al completarlo
  orden       int  not null default 0,
  activa      boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

-- ── 2 · Catálogo: preguntas ──────────────────────────────────────────────────
-- target_column NO se usa para armar SQL dinámico: portal_v18 tiene un `case`
-- explícito con la allowlist de columnas escribibles. Acá es solo el mapeo.
create table if not exists public.onboarding_questions (
  qkey          text primary key,                -- 'historia_por_que_empece' — clave estable, jamás se renombra
  skey          text not null references public.onboarding_sections(skey) on update cascade,
  orden         int  not null default 0,
  grupo         text,                            -- preguntas cortas con el mismo grupo comparten pantalla
  label         text not null,
  sublabel      text not null default '',
  ayuda_md      text not null default '',
  ejemplo       text not null default '',        -- respuesta modelo CON la longitud objetivo: es la vara
  chips         jsonb not null default '[]'::jsonb,   -- ["qué edad tenías","a qué te dedicabas"]
  placeholder   text not null default '',
  video_url     text,
  qtype         text not null default 'abierta',
    -- abierta | corta | numero | money | fecha | url | email | telefono | color
    -- | opciones | chips_multi | si_no | subida | confirmar | info
  opciones      jsonb not null default '[]'::jsonb,   -- [{value,label,hint}]
  voz           boolean not null default true,   -- micrófono + transcripción
  requerida     boolean not null default true,
  min_chars     int  not null default 0,
  peso          int  not null default 1,         -- 0 no cuenta · 1 corta · 2 media · 3 la que más pesa
  minutos       int  not null default 1,
  visible_si    jsonb,                           -- {"qkey":"motor","in":["oportunidad","ambas"]}
  bucket_key    text,                            -- qtype='subida': carpeta de funnel_resources
  target_count  int,                             -- qtype='subida': cuántos archivos
  target_kind   text,                            -- null | 'clients' | 'strategy_pages'
  target_column text,
  target_mode   text not null default 'fill',    -- fill (no pisa) | overwrite
  plantilla_ord int  not null default 999,       -- orden en la plantilla oficial (para el brain doc)
  plantilla_ref text not null default '',        -- '1.3 Historia de vida / 3'
  activa        boolean not null default true,
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create index if not exists onboarding_questions_orden_idx
  on public.onboarding_questions (skey, orden) where activa;
create index if not exists onboarding_questions_plantilla_idx
  on public.onboarding_questions (plantilla_ord) where activa;

-- ── 3 · Run: el onboarding de un cliente ─────────────────────────────────────
create table if not exists public.onboarding_runs (
  id             text primary key default ('onb_'||replace(gen_random_uuid()::text,'-','')),
  client_id      text not null references public.clients(id) on delete cascade,
  estado         text not null default 'invitado',   -- invitado | en_curso | completado | archivado

  -- Paso 0 · agenda (la reserva real vive en public.appointments)
  agenda_estado  text not null default 'pendiente',  -- pendiente | agendado | omitido
  agenda_appointment_id uuid,
  agenda_at      timestamptz,
  agenda_motivo  text,                               -- por qué se omitió, si se omitió

  -- Invitación
  invitado_at    timestamptz,
  invite_count   int not null default 0,
  invite_canal   text,                               -- whatsapp | email | ambos | solo_link
  invite_last_error text,

  -- Progreso denormalizado (la verdad la calcula onboarding_progreso())
  progreso       int not null default 0,
  requeridas     int not null default 0,
  respondidas    int not null default 0,

  -- Ciclo de vida
  started_at     timestamptz,
  last_seen_at   timestamptz,
  completado_at  timestamptz,
  writeback_at   timestamptz,
  writeback_warning text,

  created_at     timestamptz not null default now()
);
-- Un run vivo por cliente. Permite re-onboarding archivando el anterior.
create unique index if not exists onboarding_runs_client_activo
  on public.onboarding_runs (client_id) where estado <> 'archivado';

-- FK a appointments solo si la tabla existe (el portal se puede desplegar antes
-- que el módulo de soporte en un entorno nuevo).
do $$
begin
  if to_regclass('public.appointments') is not null
     and not exists (select 1 from pg_constraint where conname = 'onboarding_runs_appointment_fk')
  then
    alter table public.onboarding_runs
      add constraint onboarding_runs_appointment_fk
      foreign key (agenda_appointment_id) references public.appointments(id) on delete set null;
  end if;
end $$;

-- ── 4 · Respuestas ───────────────────────────────────────────────────────────
create table if not exists public.onboarding_answers (
  id          text primary key default ('oba_'||replace(gen_random_uuid()::text,'-','')),
  run_id      text not null references public.onboarding_runs(id) on delete cascade,
  client_id   text not null references public.clients(id) on delete cascade,  -- denormalizado
  qkey        text not null,                     -- sin FK a propósito (ver cabecera)
  value_text  text not null default '',          -- SIEMPRE la forma legible, también para selects
  value_json  jsonb,                             -- forma máquina (multi, estructurados)
  source      text not null default 'texto',     -- texto | voz | mixto | equipo
  flag        text,                              -- corta | audio_pendiente
  transcript  text,                              -- lo que devolvió Whisper, antes de que el cliente edite
  audio_path  text,
  audio_ms    int,
  revision    int  not null default 1,
  answered_at timestamptz,                       -- primera vez con contenido
  updated_at  timestamptz not null default now(),
  unique (run_id, qkey)
);
create index if not exists onboarding_answers_client_idx on public.onboarding_answers (client_id);

-- ── 5 · Historial ────────────────────────────────────────────────────────────
create table if not exists public.onboarding_answer_log (
  id              bigint generated always as identity primary key,
  run_id          text not null,
  qkey            text not null,
  value_text_prev text,
  value_json_prev jsonb,
  revision_prev   int,
  motivo          text,                          -- reemplazo | borrado
  logged_at       timestamptz not null default now()
);
create index if not exists onboarding_answer_log_run_idx
  on public.onboarding_answer_log (run_id, qkey, logged_at desc);

-- Solo se loguea cuando hubo PÉRDIDA real. Si el valor viejo es prefijo del
-- nuevo, el cliente estaba tecleando hacia adelante y no perdió nada: con un
-- autosave cada 900 ms, loguear eso generaría miles de filas basura.
create or replace function public.trg_onboarding_answer_log()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if coalesce(old.value_text,'') = '' then return new; end if;
  if old.value_text = coalesce(new.value_text,'') then return new; end if;
  if position(old.value_text in coalesce(new.value_text,'')) = 1 then return new; end if;

  insert into public.onboarding_answer_log
    (run_id, qkey, value_text_prev, value_json_prev, revision_prev, motivo)
  values (old.run_id, old.qkey, old.value_text, old.value_json, old.revision,
          case when coalesce(new.value_text,'') = '' then 'borrado' else 'reemplazo' end);
  return new;
end $$;

drop trigger if exists onboarding_answers_log on public.onboarding_answers;
create trigger onboarding_answers_log
  before update on public.onboarding_answers
  for each row execute function public.trg_onboarding_answer_log();

-- ── 6 · RLS: solo equipo ─────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['onboarding_sections','onboarding_questions','onboarding_runs',
                           'onboarding_answers','onboarding_answer_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_team', t);
    execute format($f$create policy %I on public.%I
      for all to authenticated using (public.is_team_member()) with check (public.is_team_member())$f$,
      t||'_team', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ── 7 · Helpers de run y progreso ────────────────────────────────────────────

-- Devuelve el run vivo del cliente; lo crea si no existe.
create or replace function public._onboarding_run(p_client_id text)
returns text language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_run text;
begin
  if p_client_id is null then return null; end if;
  select id into v_run from public.onboarding_runs
   where client_id = p_client_id and estado <> 'archivado' limit 1;
  if v_run is not null then return v_run; end if;
  if not exists (select 1 from public.clients where id = p_client_id) then return null; end if;
  insert into public.onboarding_runs (client_id) values (p_client_id) returning id into v_run;
  return v_run;
end $$;

-- ¿Esta pregunta es visible dado el set de respuestas del run?
--   null                                          → siempre visible
--   {"qkey":"motor","in":["producto","ambas"]}    → visible si la respuesta está en la lista
--   {"qkey":"delegado_nombre","no_vacio":true}    → visible si la respuesta tiene algo
-- Para chips_multi la respuesta es una lista separada por comas: alcanza con que
-- una de las opciones elegidas esté en `in`.
create or replace function public._onboarding_visible(p_run text, p_visible_si jsonb)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_dep text; v_val text;
begin
  if p_visible_si is null or p_visible_si = '{}'::jsonb then return true; end if;
  v_dep := p_visible_si->>'qkey';
  if coalesce(v_dep,'') = '' then return true; end if;

  select value_text into v_val from public.onboarding_answers
   where run_id = p_run and qkey = v_dep;
  v_val := btrim(coalesce(v_val,''));

  if coalesce((p_visible_si->>'no_vacio')::boolean, false) then
    return v_val <> '';
  end if;
  if v_val = '' then return false; end if;

  return exists (
    select 1
      from jsonb_array_elements_text(coalesce(p_visible_si->'in','[]'::jsonb)) x
      join unnest(string_to_array(v_val, ',')) part on lower(btrim(part)) = lower(btrim(x))
  );
end $$;

-- Progreso PONDERADO. factor = 1 si llegó al min_chars · 0.6 si llegó al 45% · 0 si menos.
-- Las preguntas sin min_chars puntúan 1 con solo tener contenido.
-- Los bloqueantes de material NO suman peso, pero topean el resultado en 99.
create or replace function public.onboarding_progreso(p_run_id text)
returns table(requeridas int, respondidas int, progreso int, faltan text[], bloqueantes jsonb)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_cid text;
  v_peso_total numeric := 0;
  v_peso_ok    numeric := 0;
  v_req int := 0; v_resp int := 0;
  v_faltan text[] := '{}';
  v_bloq jsonb := '[]'::jsonb;
  v_pend int := 0;
  r record;
  v_len int; v_factor numeric;
begin
  select client_id into v_cid from public.onboarding_runs where id = p_run_id;
  if v_cid is null then
    return query select 0, 0, 0, '{}'::text[], '[]'::jsonb; return;
  end if;

  for r in
    select q.qkey, q.requerida, q.min_chars, q.peso, q.visible_si, q.qtype,
           q.bucket_key, q.target_count,
           coalesce(a.value_text,'') as val
      from public.onboarding_questions q
      left join public.onboarding_answers a on a.run_id = p_run_id and a.qkey = q.qkey
     where q.activa
  loop
    if not public._onboarding_visible(p_run_id, r.visible_si) then continue; end if;
    if not r.requerida then continue; end if;

    v_req := v_req + 1;
    v_len := length(btrim(r.val));

    if r.qtype = 'subida' then
      -- Las preguntas de subida no puntúan por texto: puntúan por archivos reales
      -- en funnel_resources. Si no, el cliente sube 5 fotos y la barra no se mueve.
      select count(*) into v_len from public.funnel_resources fr
       where fr.client_id = v_cid and fr.bucket_key = r.bucket_key;
      v_factor := case when v_len >= greatest(coalesce(r.target_count,1),1) then 1
                       when v_len > 0 then 0.6
                       else 0 end;
    elsif r.min_chars > 0 then
      v_factor := case when v_len >= r.min_chars then 1
                       when v_len >= (r.min_chars * 0.45) then 0.6
                       else 0 end;
    else
      v_factor := case when v_len > 0 then 1 else 0 end;
    end if;

    v_peso_total := v_peso_total + greatest(r.peso, 1);
    v_peso_ok    := v_peso_ok + (greatest(r.peso, 1) * v_factor);
    if v_factor >= 1 then v_resp := v_resp + 1; else v_faltan := v_faltan || r.qkey; end if;
  end loop;

  -- Bloqueantes de material: vienen de portal_pedidos, no del cuestionario.
  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', p.tipo, 'titulo', p.titulo, 'descripcion', p.descripcion,
           'bucket', p.bucket_key, 'target', p.target_count, 'estado', p.estado,
           'subidos', (select count(*) from public.funnel_resources fr
                        where fr.client_id = v_cid and fr.bucket_key = p.bucket_key)
         ) order by p.orden), '[]'::jsonb),
         count(*) filter (where p.estado not in ('completo','validado'))
    into v_bloq, v_pend
    from public.portal_pedidos p
   where p.client_id = v_cid and p.activo and p.bloqueante;

  requeridas  := v_req;
  respondidas := v_resp;
  progreso    := case when v_peso_total = 0 then 0
                      else round((v_peso_ok / v_peso_total) * 100)::int end;
  -- Nunca 0%: agendar la sesión ya da arranque. Y nunca 100% con bloqueantes pendientes.
  if progreso < 3 and exists (select 1 from public.onboarding_runs
                               where id = p_run_id and agenda_estado <> 'pendiente')
  then progreso := 3; end if;
  if coalesce(v_pend,0) > 0 then progreso := least(progreso, 99); end if;

  faltan      := v_faltan;
  bloqueantes := v_bloq;
  return next;
end $$;

-- Refresca las columnas denormalizadas del run.
create or replace function public._onboarding_refrescar(p_run_id text)
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare p record;
begin
  select * into p from public.onboarding_progreso(p_run_id);
  update public.onboarding_runs
     set progreso = p.progreso, requeridas = p.requeridas, respondidas = p.respondidas
   where id = p_run_id;
  return jsonb_build_object('progreso', p.progreso, 'requeridas', p.requeridas,
                            'respondidas', p.respondidas, 'faltan', to_jsonb(p.faltan),
                            'bloqueantes', p.bloqueantes);
end $$;

grant execute on function
  public._onboarding_run(text),
  public._onboarding_visible(text, jsonb),
  public.onboarding_progreso(text),
  public._onboarding_refrescar(text)
to authenticated;

notify pgrst, 'reload schema';
