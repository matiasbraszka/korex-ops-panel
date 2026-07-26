-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v30_onboarding_v2_progreso.sql
--
-- El porcentaje del v2 se calcula distinto y hay que igualarlo en los dos
-- lados. El número que ve el cliente en su pantalla y el que ve el operador en
-- el panel salen de fórmulas separadas (una en JS, otra en SQL): si no dicen lo
-- mismo, el equipo llama al cliente para preguntarle por un 40% que el cliente
-- ve como 55% y nadie entiende nada.
--
-- Cambios respecto del v1:
--
--   1. SIN PESOS. `pct = obligatorias respondidas / obligatorias visibles`.
--      El HTML cuenta cabezas (reqStats), no pondera. El `peso` queda en la
--      tabla pero deja de intervenir.
--
--   2. LLENO ES BINARIO. En el v1 una respuesta a medias valía 0,6. En el v2
--      una respuesta cuenta o no cuenta: con `largo_objetivo` alcanza con el
--      60% de ese largo (`minLen` del HTML), y con eso está llena. El medidor
--      sigue mostrando el camino hasta el 100%, pero el progreso no se mueve
--      en fracciones.
--
--   3. SIN TECHO NI PISO. Se van el `least(pct, 99)` por bloqueantes de
--      portal_pedidos y el piso de 3 por agenda. No existen en el HTML, y dos
--      fórmulas compitiendo por el mismo número es peor que una imperfecta.
--      Los bloqueantes se siguen devolviendo para mostrarlos, pero ya no
--      tocan el porcentaje.
--
--   4. UN RUN COMPLETADO NO SE RECALCULA. Decisión de producto: el constructor
--      edita en vivo y eso afecta a todos los que están en curso, pero a quien
--      ya entregó no se le mueve el piso. Si mañana se agrega una pregunta
--      obligatoria, el cliente que terminó la semana pasada sigue en 100 y su
--      documento queda como está.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1 · La regla de "esta respuesta cuenta" ──────────────────────────────────
-- Una sola función para que SQL y JS no puedan divergir: progreso.js
-- implementa exactamente esto y nada más.
create or replace function public._onboarding_lleno(
  p_client_id text,
  p_qtype     text,
  p_largo     int,
  p_bucket    text,
  p_target    int,
  p_val       text
) returns boolean
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_n int;
begin
  -- Las tarjetas informativas y el resumen no se responden.
  if p_qtype in ('info', 'resumen') then return true; end if;

  -- Los archivos no se miden por texto: se cuentan en la carpeta de recursos
  -- del cliente, que es adonde los deja `uploadRecurso`.
  if p_qtype in ('archivos', 'subida') then
    select count(*) into v_n from public.funnel_resources fr
     where fr.client_id = p_client_id and fr.bucket_key = p_bucket;
    return v_n >= greatest(coalesce(p_target, 1), 1);
  end if;

  -- El 60% del largo pedido. El HTML: minLen = round(len * 0.6).
  if coalesce(p_largo, 0) > 0 then
    return length(btrim(coalesce(p_val, ''))) >= round(p_largo * 0.6);
  end if;

  -- Todo lo demás —opciones, chips, agenda, presupuesto, texto corto— guarda
  -- su forma legible en value_text, así que alcanza con que no esté vacío.
  return length(btrim(coalesce(p_val, ''))) > 0;
end $$;

revoke execute on function public._onboarding_lleno(text, text, int, text, int, text) from public, anon, authenticated;
grant  execute on function public._onboarding_lleno(text, text, int, text, int, text) to service_role;

-- ── 2 · Progreso ─────────────────────────────────────────────────────────────
-- Suma la columna `bloques`, así que hay que tirarla y rehacerla (Postgres no
-- deja cambiar el tipo de retorno con CREATE OR REPLACE). Los cinco que la
-- llaman —completar, admin_estado, refrescar, estado, cliente_inicio— lo hacen
-- con `select * into <record>`, así que una columna de más no los toca.
drop function if exists public.onboarding_progreso(text);

create or replace function public.onboarding_progreso(p_run_id text)
returns table(requeridas integer, respondidas integer, progreso integer,
              faltan text[], bloqueantes jsonb, bloques jsonb)
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cid text; v_estado text;
  v_req int := 0; v_resp int := 0;
  v_faltan text[] := '{}';
  v_bloq jsonb := '[]'::jsonb;
  v_bloques jsonb := '[]'::jsonb;
  r record; v_ok boolean;
begin
  select client_id, estado into v_cid, v_estado
    from public.onboarding_runs where id = p_run_id;
  if v_cid is null then
    return query select 0, 0, 0, '{}'::text[], '[]'::jsonb, '[]'::jsonb; return;
  end if;

  for r in
    select q.qkey, q.requerida, q.largo_objetivo, q.visible_si, q.qtype,
           q.bucket_key, q.target_count, s.bkey,
           coalesce(a.value_text, '') as val
      from public.onboarding_questions q
      join public.onboarding_sections s on s.skey = q.skey and s.activa
      left join public.onboarding_answers a on a.run_id = p_run_id and a.qkey = q.qkey
     where q.activa and s.bkey is not null
  loop
    if not public._onboarding_visible(p_run_id, r.visible_si) then continue; end if;
    if not r.requerida then continue; end if;

    v_req := v_req + 1;
    v_ok := public._onboarding_lleno(v_cid, r.qtype, r.largo_objetivo,
                                     r.bucket_key, r.target_count, r.val);
    if v_ok then v_resp := v_resp + 1; else v_faltan := v_faltan || r.qkey; end if;
  end loop;

  -- Los bloqueantes se muestran, ya no descuentan.
  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', p.tipo, 'titulo', p.titulo, 'descripcion', p.descripcion,
           'bucket', p.bucket_key, 'target', p.target_count, 'estado', p.estado,
           'subidos', (select count(*) from public.funnel_resources fr
                        where fr.client_id = v_cid and fr.bucket_key = p.bucket_key)
         ) order by p.orden), '[]'::jsonb)
    into v_bloq
    from public.portal_pedidos p
   where p.client_id = v_cid and p.activo and p.bloqueante;

  -- Avance por bloque: es lo que abre pestañas del portal y lo que pinta la
  -- barra lateral del onboarding.
  select coalesce(jsonb_agg(x order by x->>'orden'), '[]'::jsonb) into v_bloques
    from (
      select jsonb_build_object(
               'bkey', b.bkey, 'corto', b.corto, 'orden', b.orden,
               'total', count(*) filter (where q.requerida),
               'hechas', count(*) filter (
                 where q.requerida and public._onboarding_lleno(
                   v_cid, q.qtype, q.largo_objetivo, q.bucket_key, q.target_count,
                   coalesce(a.value_text, ''))),
               'desbloquea', to_jsonb(b.desbloquea)
             ) as x
        from public.onboarding_bloques b
        join public.onboarding_sections s on s.bkey = b.bkey and s.activa
        join public.onboarding_questions q on q.skey = s.skey and q.activa
        left join public.onboarding_answers a on a.run_id = p_run_id and a.qkey = q.qkey
       where b.activa and public._onboarding_visible(p_run_id, q.visible_si)
       group by b.bkey, b.corto, b.orden, b.desbloquea
    ) t;

  requeridas  := v_req;
  respondidas := v_resp;
  progreso    := case when v_req = 0 then 0
                      else round((v_resp::numeric / v_req) * 100)::int end;

  -- Un onboarding entregado no se reabre porque el catálogo cambió después.
  if v_estado = 'completado' then
    progreso := 100; v_faltan := '{}';
  end if;

  faltan      := v_faltan;
  bloqueantes := v_bloq;
  bloques     := v_bloques;
  return next;
end $$;

revoke execute on function public.onboarding_progreso(text) from public, anon, authenticated;
grant  execute on function public.onboarding_progreso(text) to service_role;

-- ── 3 · Catálogo ─────────────────────────────────────────────────────────────
-- Suma el nivel de bloques y todas las columnas del v2. Lo cachea el front en
-- localStorage contra `version`, así que la primera pantalla pinta al instante.
create or replace function public.portal_onboarding_catalogo()
returns jsonb
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'version', (select coalesce(max(greatest(s.updated_at, q.updated_at)), now())
                  from public.onboarding_sections s
                  left join public.onboarding_questions q on q.skey = s.skey
                 where s.activa),
    'bloques', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bkey', b.bkey, 'nombre', b.nombre, 'corto', b.corto,
        'titulo', b.titulo, 'descripcion', b.descripcion,
        'desbloquea', to_jsonb(b.desbloquea)
      ) order by b.orden)
      from public.onboarding_bloques b where b.activa), '[]'::jsonb),
    'pasos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'skey', s.skey, 'bkey', s.bkey, 'badge', s.badge, 'eyebrow', s.eyebrow,
        'titulo', s.titulo, 'subtitulo', s.subtitulo, 'paraQue', s.para_que,
        'icono', s.icono, 'video', s.video_url, 'minutos', s.minutos,
        'unaPorPantalla', s.una_por_pantalla,
        'preguntas', coalesce((
          select jsonb_agg(jsonb_build_object(
            'qkey', q.qkey, 'pantalla', q.pantalla,
            'label', q.label, 'sublabel', q.sublabel,
            'cabecera', q.cabecera, 'cabeceraSub', q.cabecera_sub,
            'ayuda', q.ayuda_md, 'ejemplo', q.ejemplo, 'chips', q.chips,
            'placeholder', q.placeholder, 'video', q.video_url,
            'tipo', q.qtype, 'opciones', q.opciones, 'voz', q.voz,
            'requerida', q.requerida, 'largo', q.largo_objetivo,
            'maxOpciones', q.max_opciones, 'inputMode', q.input_mode,
            'minAltura', q.min_altura, 'soloDia', q.solo_dia,
            'infoKicker', q.info_kicker, 'infoTitulo', q.info_titulo,
            'infoCuerpo', q.info_cuerpo,
            'archivoCta', q.archivo_cta, 'archivoHint', q.archivo_hint,
            'archivoAccept', q.archivo_accept, 'archivoMultiple', q.archivo_multiple,
            'visibleSi', q.visible_si, 'bucket', q.bucket_key, 'target', q.target_count
          ) order by q.pantalla, q.orden)
          from public.onboarding_questions q
          where q.skey = s.skey and q.activa), '[]'::jsonb)
      ) order by s.orden)
      from public.onboarding_sections s
     where s.activa and s.bkey is not null), '[]'::jsonb)
  );
$$;

revoke execute on function public.portal_onboarding_catalogo() from public, anon;
grant  execute on function public.portal_onboarding_catalogo() to authenticated, service_role;

-- ── 4 · Estado ───────────────────────────────────────────────────────────────
create or replace function public.portal_onboarding_estado()
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cid text; v_run text; v_r record; v_cli record; p record;
  v_prefill jsonb; v_agenda jsonb;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  v_run := public._onboarding_run(v_cid);
  if v_run is null then return null; end if;

  update public.onboarding_runs set last_seen_at = now() where id = v_run;

  select * into v_r from public.onboarding_runs where id = v_run;
  select id, name, company, niche, email, phone, country, contract_data, conector
    into v_cli from public.clients where id = v_cid;
  select * into p from public.onboarding_progreso(v_run);

  v_prefill := jsonb_build_object(
    'nombre', v_cli.name, 'empresa', coalesce(nullif(v_cli.company,''), v_cli.niche),
    'nicho', v_cli.niche, 'email', v_cli.email, 'telefono', v_cli.phone,
    'pais', v_cli.country, 'contrato', v_cli.contract_data, 'conector', v_cli.conector
  );

  v_agenda := jsonb_build_object(
    'estado', v_r.agenda_estado,
    'at', v_r.agenda_at,
    'motivo', v_r.agenda_motivo,
    'grabacion', v_r.grabacion_fecha,
    'meetingLink', (select a.meeting_link from public.appointments a
                     where a.id = v_r.agenda_appointment_id)
  );

  return jsonb_build_object(
    'runId', v_run,
    'estado', v_r.estado,
    'completo', v_r.estado = 'completado',
    'progreso', p.progreso,
    'requeridas', p.requeridas,
    'respondidas', p.respondidas,
    'faltan', to_jsonb(p.faltan),
    'bloqueantes', p.bloqueantes,
    'bloques', p.bloques,
    'agenda', v_agenda,
    'prefill', v_prefill,
    'respuestas', coalesce((
      select jsonb_object_agg(a.qkey, jsonb_build_object(
        'valor', a.value_text, 'valorJson', a.value_json, 'source', a.source,
        'flag', a.flag, 'updatedAt', a.updated_at))
      from public.onboarding_answers a where a.run_id = v_run), '{}'::jsonb)
  );
end $$;

revoke execute on function public.portal_onboarding_estado() from public, anon;
grant  execute on function public.portal_onboarding_estado() to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
