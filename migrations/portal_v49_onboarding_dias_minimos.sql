-- portal_v49_onboarding_dias_minimos.sql
-- Antelación configurable de la fecha de grabación del onboarding.
--
-- La pregunta "reservá tu fecha de grabación" (agenda, solo_dia) ofrece como
-- primera fecha una a N días desde que el cliente completa. Antes eran +1
-- (mañana) hardcodeado; ahora es una columna por pregunta, configurable desde
-- la administración del onboarding, con 7 días por defecto.
--
-- Aditiva. Aplicar ANTES de mergear la rama feat/onboarding-fix (el builder
-- guarda esta columna y el portal la lee del catálogo).

alter table public.onboarding_questions
  add column if not exists dias_minimos int not null default 7;

-- El catálogo que lee el portal: agrega diasMinimos a cada pregunta. Igual que
-- portal_v30, con el único cambio de sumar ese campo.
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
