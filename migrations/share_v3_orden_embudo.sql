-- migrations/share_v3_orden_embudo.sql
--
-- El link compartido mostraba los guiones DESORDENADOS: la Landing antes de la
-- Pre-landing, el Thank you antes del Formulario. Reportado por Matías en el link
-- /compartir/54fe0ca6… donde se ve "Landing 1 PASOS · Pre-Landing · Formulario".
--
-- Causa: share_get ordena por `del_sections.ord`, que es la posición cruda con la que
-- la sección entró al documento (import del Doc de Drive o el orden en que se fue
-- creando). No tiene nada que ver con el orden del embudo. En ese DEL:
--     ord 11 → Landing · ord 13 → Pre-Landing · ord 14 → Formulario
--
-- No es un caso aislado. Sobre 63 documentos con páginas:
--     19 tienen la Landing antes de la Pre-landing
--      4 tienen el Formulario antes de la Landing
--     32 tienen el Thank you antes del Formulario
--
-- El panel no lo sufre porque agrupa en pestañas por categoría (delTabs.js) y el portal
-- del cliente tampoco porque ya ordena por categoría a mano. El link compartido era el
-- único que mostraba el orden crudo.
--
-- Fix: ordenar por CATEGORÍA (el orden real del embudo) y recién después por `ord`.
-- Así, dos secciones de la misma categoría conservan el orden que les puso el equipo,
-- pero la Pre-landing siempre va antes que la Landing.
--
-- No se toca `ord` de ninguna fila: es orden de PRESENTACIÓN, no un cambio de datos.

-- Orden del embudo. Es el mismo KIND_ORDER_BASE de
-- apps/operations/src/components/clientes/funnels/delTabs.js:20 — si se agrega una
-- categoría allá, agregarla acá.
create or replace function public.del_kind_rank(p_kind text)
returns int
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case p_kind
    when 'estrategia'     then 1
    when 'avatares'       then 2
    when 'vsl'            then 3
    when 'anuncios'       then 4
    when 'pg_prelanding'  then 5
    when 'pg_landing'     then 6
    when 'pg_formulario'  then 7
    when 'pg_thankyou'    then 8
    when 'pg_testimonios' then 9
    when 'mensajes'       then 10
    when 'pipeline_viejo' then 11
    else 99
  end
$function$;

grant execute on function public.del_kind_rank(text) to anon, authenticated;

-- Parche quirúrgico sobre share_get vivo: solo cambia el ORDER BY de las secciones.
do $$
declare
  v_def text;
  v_nuevo text;
  v_oid oid;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'share_get'
   limit 1;

  if v_oid is null then raise exception 'share_get no existe'; end if;

  v_def   := pg_get_functiondef(v_oid);
  v_nuevo := replace(v_def,
    'order by s.ord asc',
    'order by public.del_kind_rank(s.kind) asc, s.ord asc');

  if v_nuevo = v_def then
    raise exception 'No encontre el "order by s.ord asc" en share_get — revisar a mano';
  end if;

  execute v_nuevo;
end
$$;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────────
--   select jsonb_path_query_array(public.share_get('54fe0ca62c281afe18615c19'),
--                                 '$.sections[*].title');
--   -- esperado: ["Pre-Landing", "Landing 1 PASOS", "Formulario"]
--
-- ROLLBACK: mismo bloque reemplazando al revés
--   ('order by public.del_kind_rank(s.kind) asc, s.ord asc' → 'order by s.ord asc')
