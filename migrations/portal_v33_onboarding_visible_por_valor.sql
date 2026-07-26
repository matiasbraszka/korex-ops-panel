-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v33_onboarding_visible_por_valor.sql
--
-- La visibilidad se resuelve contra el VALOR de la opción, no contra su
-- etiqueta.
--
-- Hasta acá `value_text` guardaba el valor crudo ('op100', 'ambas_prod', 'no'),
-- porque era lo único contra lo que se podía comparar. El problema aparece del
-- otro lado: el documento del DEL se arma con `value_text`, y una respuesta que
-- dice "R: op100" no la puede leer nadie — ni el equipo ni el analista de
-- estrategia. Ahora que el documento es un entregable, `value_text` guarda la
-- etiqueta ("Oportunidad de negocio 100%") y el valor viaja en
-- `value_json.valor` / `value_json.valores`.
--
-- Se lee primero el json y se cae a `value_text`: las respuestas del v1 y las
-- preguntas de texto libre siguen funcionando igual.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public._onboarding_visible(p_run text, p_visible_si jsonb)
returns boolean
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_dep text; v_val text; v_json jsonb; v_partes text[];
begin
  if p_visible_si is null or p_visible_si = '{}'::jsonb then return true; end if;
  v_dep := p_visible_si->>'qkey';
  if coalesce(v_dep, '') = '' then return true; end if;

  select value_text, value_json into v_val, v_json
    from public.onboarding_answers where run_id = p_run and qkey = v_dep;
  v_val := btrim(coalesce(v_val, ''));

  if coalesce((p_visible_si->>'no_vacio')::boolean, false) then
    return v_val <> '';
  end if;

  if v_json ? 'valores' then
    select array_agg(btrim(x)) into v_partes
      from jsonb_array_elements_text(v_json->'valores') x;
  elsif coalesce(v_json->>'valor', '') <> '' then
    v_partes := array[btrim(v_json->>'valor')];
  elsif v_val <> '' then
    v_partes := string_to_array(v_val, ',');
  else
    return false;
  end if;

  return exists (
    select 1
      from jsonb_array_elements_text(coalesce(p_visible_si->'in', '[]'::jsonb)) x
      join unnest(v_partes) part on lower(btrim(part)) = lower(btrim(x))
  );
end $$;

notify pgrst, 'reload schema';
