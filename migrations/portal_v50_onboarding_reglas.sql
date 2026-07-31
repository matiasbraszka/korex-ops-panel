-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v50_onboarding_reglas.sql
--
-- "Reglas del servicio": un documento editable desde la administración que el
-- cliente ve al inicio del onboarding, tiene a mano durante todo el flujo, y
-- puede releer después. El cliente tilda "leí y estoy de acuerdo" y esa
-- aceptación queda registrada (fecha + versión del documento).
--
-- Contenido (video + reglas) vive en la MISMA fila app_settings que ya usa el
-- portal: key='onboarding_config' (NO el blob 'global'). La RPC del catálogo lo
-- expone junto a videoBienvenida. La aceptación se guarda en onboarding_runs.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Asegurar las claves de contenido en onboarding_config (sin pisar el video).
insert into public.app_settings (key, value)
values ('onboarding_config', jsonb_build_object('video_bienvenida', '', 'reglas_html', '', 'reglas_version', '1'))
on conflict (key) do update
set value = public.app_settings.value
          || jsonb_build_object('reglas_html',    coalesce(public.app_settings.value->>'reglas_html', ''))
          || jsonb_build_object('reglas_version', coalesce(public.app_settings.value->>'reglas_version', '1'));

-- 2) Catálogo: agrega reglas + reglasVersion junto a videoBienvenida.
--    (Misma función que portal_v49 con diasMinimos; solo se suman 2 campos top-level.)
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
    'videoBienvenida', coalesce((select nullif(value->>'video_bienvenida', '')
                                   from public.app_settings where key = 'onboarding_config'), ''),
    'reglas', coalesce((select nullif(value->>'reglas_html', '')
                          from public.app_settings where key = 'onboarding_config'), ''),
    'reglasVersion', coalesce((select nullif(value->>'reglas_version', '')
                                 from public.app_settings where key = 'onboarding_config'), '1'),
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
            'diasMinimos', q.dias_minimos,
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

-- 3) Registro de aceptación de las reglas por corrida de onboarding.
alter table public.onboarding_runs
  add column if not exists reglas_aceptadas_at timestamptz,
  add column if not exists reglas_version text;

-- RPC que el portal llama cuando el cliente tilda "leí y acepto". Setea la
-- aceptación en la corrida del cliente que llama. Idempotente: no re-graba si ya
-- aceptó esa misma versión (así no pisa la fecha original).
create or replace function public.portal_onboarding_aceptar_reglas(p_version text)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cid text; v_run record;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return jsonb_build_object('ok', false, 'error', 'sin_cliente'); end if;

  select * into v_run from public.onboarding_runs
   where client_id = v_cid and estado <> 'archivado' limit 1;
  if v_run.id is null then return jsonb_build_object('ok', false, 'error', 'sin_run'); end if;

  if v_run.reglas_aceptadas_at is not null
     and coalesce(v_run.reglas_version, '') = coalesce(p_version, '') then
    return jsonb_build_object('ok', true, 'yaAceptada', true, 'at', v_run.reglas_aceptadas_at);
  end if;

  update public.onboarding_runs
     set reglas_aceptadas_at = now(), reglas_version = coalesce(p_version, '1')
   where id = v_run.id;

  return jsonb_build_object('ok', true, 'at', now());
end;
$$;

revoke execute on function public.portal_onboarding_aceptar_reglas(text) from public, anon;
grant  execute on function public.portal_onboarding_aceptar_reglas(text) to authenticated, service_role;

notify pgrst, 'reload schema';
