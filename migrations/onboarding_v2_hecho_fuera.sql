-- onboarding_v2_hecho_fuera.sql
--
-- Pedido de Matias: "para los clientes viejos, o sea que estaban antes del
-- sistema, dice que todavia no completaron el onboarding pero en realidad si;
-- ya tienen una hoja en el sistema que dice Onboarding pero no es el onboarding
-- actual, asi que no se como hacer para aprobar eso".
--
-- Estado real: hay 33 clientes y solo 4 onboarding_runs. Los 30 restantes son
-- anteriores al onboarding actual, asi que onboarding_admin_estado devuelve
-- `existe: false` y la ficha dice "Todavia no arranco el onboarding" para
-- siempre. No habia forma de darlo por bueno.
--
-- Se resuelve con una marca a nivel CLIENTE, no creando un run falso. Un run
-- vacio se veria como 0% de progreso, generaria un documento sin respuestas y
-- ensuciaria el tablero. La marca dice exactamente lo que pasa: "esto se hizo
-- fuera de este sistema".
--
-- El portal del cliente NO cambia: ya hoy solo muestra la tarjeta de onboarding
-- cuando existe un run sin terminar (InicioScreen: `onb.existe && !onb.completo`),
-- asi que a un cliente viejo nunca se le pidio nada. Esto es solo para que el
-- equipo deje de ver un pendiente que no existe.

alter table public.clients add column if not exists onboarding_externo_at   timestamptz;
alter table public.clients add column if not exists onboarding_externo_por  text;
alter table public.clients add column if not exists onboarding_externo_nota text;

comment on column public.clients.onboarding_externo_at is
  'Cuando el equipo dio por hecho el onboarding fuera del sistema (cliente anterior al onboarding actual). Null = no marcado.';

-- ── Marcar / desmarcar ──────────────────────────────────────────────────────
create or replace function public.onboarding_dar_por_hecho(p_client_id text, p_hecho boolean default true, p_nota text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_nombre text; v_quien text;
begin
  if not public.is_team_member() then
    return jsonb_build_object('ok', false, 'error', 'no autorizado');
  end if;
  select name into v_nombre from public.clients where id = p_client_id;
  if v_nombre is null then
    return jsonb_build_object('ok', false, 'error', 'cliente inexistente');
  end if;

  v_quien := coalesce(nullif(lower(auth.jwt() ->> 'email'), ''), 'equipo');

  if coalesce(p_hecho, true) then
    update public.clients
       set onboarding_externo_at   = now(),
           onboarding_externo_por  = v_quien,
           onboarding_externo_nota = nullif(btrim(coalesce(p_nota, '')), '')
     where id = p_client_id;
  else
    update public.clients
       set onboarding_externo_at = null, onboarding_externo_por = null, onboarding_externo_nota = null
     where id = p_client_id;
  end if;

  return jsonb_build_object('ok', true, 'hecho', coalesce(p_hecho, true));
end $function$;

revoke all on function public.onboarding_dar_por_hecho(text, boolean, text) from public, anon;
grant execute on function public.onboarding_dar_por_hecho(text, boolean, text) to authenticated, service_role;

-- ── Que la ficha lo sepa ────────────────────────────────────────────────────
-- Se agrega `externo` a onboarding_admin_estado, tanto cuando NO hay run (el
-- caso de los clientes viejos) como cuando lo hay (un run que quedo a medias
-- porque en realidad se hizo por fuera).
do $mig$
declare d text; o text;
begin
  select pg_get_functiondef(p.oid) into d
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'onboarding_admin_estado';
  if d is null then raise exception 'onboarding_admin_estado no existe'; end if;
  o := d;

  d := replace(d,
    'declare v_run text; v_r record; p record;',
    'declare v_run text; v_r record; p record; v_ext jsonb;');

  d := replace(d,
    '  select id into v_run from public.onboarding_runs',
    '  select case when c.onboarding_externo_at is null then null else
           jsonb_build_object(''at'', c.onboarding_externo_at, ''por'', c.onboarding_externo_por,
                              ''nota'', c.onboarding_externo_nota) end
    into v_ext from public.clients c where c.id = p_client_id;

  select id into v_run from public.onboarding_runs');

  d := replace(d,
    '    return jsonb_build_object(''ok'', true, ''existe'', false);',
    '    return jsonb_build_object(''ok'', true, ''existe'', false, ''externo'', v_ext);');

  d := replace(d,
    '    ''ok'', true, ''existe'', true, ''runId'', v_run, ''estado'', v_r.estado,',
    '    ''ok'', true, ''existe'', true, ''runId'', v_run, ''estado'', v_r.estado, ''externo'', v_ext,');

  if d = o then raise exception 'Ningun patron coincidio: abortado'; end if;
  if position('''externo''' in d) = 0 then raise exception 'No se agrego externo: abortado'; end if;

  execute d;
end $mig$;

-- Verificacion:
--   select public.onboarding_admin_estado('<client_id>') -> 'externo';
