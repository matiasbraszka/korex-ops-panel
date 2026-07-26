-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v37_cliente_nuevo_funnel_y_onboarding.sql
--
-- Un cliente nuevo nace con su funnel tipado y con la pestaña de onboarding ya
-- puesta, vacía, esperando.
--
-- Hoy `crear-venta` crea el funnel sin `tipo` y alguien se lo pone después a
-- mano. De los 58 funnels que hay, 45 son de reclutamiento: el default no es
-- una preferencia, es lo que ya pasa el 78% de las veces. Y el documento de
-- onboarding no existe hasta que el cliente contesta la primera pregunta, así
-- que el equipo abre el DEL de un cliente recién creado y no ve ninguna
-- pestaña de onboarding — no sabe si falta cargarla o si el cliente no empezó.
--
-- Va como TRIGGERS y no dentro de `crear-venta` por tres razones: funciona sin
-- importar por dónde se cree el cliente (la edge function, el panel, un
-- script), no obliga a redesplegar 1168 líneas que son el único camino por el
-- que entra plata, y no puede quedar desincronizado entre el repo y producción.
--
-- Los dos triggers se tragan sus propios errores a propósito: son ADITIVOS. Si
-- algo falla acá, el cliente igual se tiene que crear.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1 · El funnel nace en reclutamiento ──────────────────────────────────────
create or replace function public.trg_strategy_pages_tipo_default()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(new.tipo, '') = '' then
    new.tipo := 'reclutamiento';
  end if;
  return new;
end $$;

drop trigger if exists strategy_pages_tipo_default on public.strategy_pages;
create trigger strategy_pages_tipo_default
  before insert on public.strategy_pages
  for each row execute function public.trg_strategy_pages_tipo_default();

-- El default es una suposición; la respuesta del cliente es un dato. En `fill`
-- el default de arriba ganaría siempre y el foco que eligió el cliente no se
-- aplicaría nunca — justo el bug que este ejercicio venía a cerrar.
update public.onboarding_questions
   set target_mode = 'overwrite', updated_at = now()
 where qkey = 'foco' and target_kind = 'strategy_pages' and target_column = 'tipo';

-- ── 2 · La pestaña de onboarding, desde el día cero ──────────────────────────
-- Crea el run y el documento vacío. El documento es de nivel CLIENTE
-- (`scope='client'`, sin strategy_id), así que es uno solo y vale para todos
-- los funnels del cliente: es la respuesta a "una pestaña general que aplica a
-- todos los funnels".
create or replace function public.onboarding_preparar(p_client_id text)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_run text; v_nombre text;
begin
  select name into v_nombre from public.clients where id = p_client_id;
  if v_nombre is null then
    return jsonb_build_object('ok', false, 'error', 'sin_cliente');
  end if;

  v_run := public._onboarding_run(p_client_id);

  insert into public.client_brain_docs
    (id, client_id, node_id, doc_kind, title, text, char_count, scope, synced_at)
  values ('onb_' || p_client_id, p_client_id, 'native_onb_' || p_client_id,
          'onboarding', 'Onboarding (plataforma) — ' || v_nombre,
          '', 0, 'client', now())
  on conflict (client_id, node_id) do nothing;

  return jsonb_build_object('ok', true, 'run', v_run, 'doc', 'onb_' || p_client_id);
end $$;

revoke execute on function public.onboarding_preparar(text) from public, anon;
grant  execute on function public.onboarding_preparar(text) to authenticated, service_role;

create or replace function public.trg_clients_onboarding_preparar()
returns trigger
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Aditivo: si falla, el cliente igual se crea. Un onboarding que no se
  -- preparó se arregla solo en cuanto el cliente entra al portal
  -- (portal_onboarding_estado llama a _onboarding_run), o a mano desde la ficha.
  begin
    perform public.onboarding_preparar(new.id);
  exception when others then
    null;
  end;
  return null;
end $$;

drop trigger if exists clients_onboarding_preparar on public.clients;
create trigger clients_onboarding_preparar
  after insert on public.clients
  for each row execute function public.trg_clients_onboarding_preparar();

commit;

notify pgrst, 'reload schema';
