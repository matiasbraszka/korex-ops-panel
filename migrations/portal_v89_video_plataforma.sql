-- migrations/portal_v89_video_plataforma.sql
--
-- VIDEO «Cómo se usa la plataforma» en el Inicio del portal del cliente.
--
-- Vive en app_settings.portal_config, que es donde ya viven el WhatsApp del equipo,
-- la agenda y las guías de anuncios y VSL. Se suma a la respuesta de
-- portal_cliente_inicio para que la pantalla de Inicio no tenga que pedir otra cosa.
--
-- Se guarda el link tal cual: el portal lo convierte al formato incrustable al
-- mostrarlo (videoEmbed.js), igual que el de bienvenida del onboarding.

-- El video que pidió Matías.
insert into public.app_settings (key, value)
values ('portal_config', jsonb_build_object(
          'video_plataforma', 'https://www.loom.com/share/4feed1a7c68648c48c8e31db3afa7034'))
on conflict (key) do update
  set value = public.app_settings.value
            || jsonb_build_object('video_plataforma',
                 'https://www.loom.com/share/4feed1a7c68648c48c8e31db3afa7034'),
      updated_at = now();

-- Que viaje al Inicio.
do $$
declare v_def text; v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'portal_cliente_inicio' limit 1;
  if v_def is null then raise exception 'portal_cliente_inicio no existe'; end if;

  v_nuevo := replace(v_def,
    E'''onboarding'', v_onb,',
    E'''onboarding'', v_onb,\n    ''videoPlataforma'', coalesce((select value->>''video_plataforma''\n                                    from public.app_settings where key = ''portal_config''), ''''),');

  if v_nuevo = v_def then
    raise exception 'No encontré dónde enganchar el video en portal_cliente_inicio';
  end if;
  execute v_nuevo;
end
$$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select public.portal_cliente_inicio() ->> 'videoPlataforma';   -- con sesión de cliente
--
-- ROLLBACK: sacar la línea de videoPlataforma con el mismo bloque al revés.
