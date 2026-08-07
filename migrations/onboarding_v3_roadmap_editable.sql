-- migrations/onboarding_v3_roadmap_editable.sql
--
-- El "roadmap" del servicio —el camino del proyecto que el cliente ve al inicio del
-- onboarding y al terminarlo— estaba escrito a mano dentro del código del portal
-- (apps/portal/src/onboarding/components/Roadmap.jsx). Cambiar un plazo o un texto
-- era tocar código y deployar.
--
-- Pasa a vivir donde ya viven el video y las reglas: app_settings.onboarding_config,
-- en la clave `roadmap`. Si no está cargada, el portal sigue usando la lista de
-- siempre, así que esto no rompe nada mientras no se toque desde el panel.

do $$
declare
  v_def text;
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'portal_onboarding_catalogo'
   limit 1;
  if v_def is null then raise exception 'portal_onboarding_catalogo no existe'; end if;

  -- Se engancha al lado de 'reglasVersion', que ya sale de la misma fila de config.
  v_nuevo := replace(v_def,
    E'''reglasVersion'', coalesce((select nullif(value->>''reglas_version'', '''')',
    E'''roadmap'', (select value->''roadmap'' from public.app_settings where key = ''onboarding_config''),\n    ''reglasVersion'', coalesce((select nullif(value->>''reglas_version'', '''')');

  if v_nuevo = v_def then
    raise exception 'No encontré dónde enganchar el roadmap en portal_onboarding_catalogo';
  end if;

  execute v_nuevo;
end
$$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select public.portal_onboarding_catalogo() -> 'roadmap';   -- null hasta cargarlo
--
-- ROLLBACK: reemplazar al revés (sacar la línea de 'roadmap').
