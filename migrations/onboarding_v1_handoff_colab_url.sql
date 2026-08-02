-- onboarding_v1_handoff_colab_url.sql
--
-- Pedido: que el mensaje que se copia al cargar una venta traiga, ademas de las
-- credenciales del cliente, el link para que su equipo corporativo se registre —
-- sobre todo los responsables de grabarse, que tienen que estar dados de alta
-- antes de la llamada de onboarding.
--
-- El hueco {COLAB_URL} lo resuelve crear-venta (ver asegurarLinkColaboradores en
-- supabase/functions/crear-venta/index.ts). Pero la plantilla que se usa de verdad
-- NO es la del codigo: es la que esta guardada en
-- app_settings('global').onboarding_config.onboarding_handoff_msg, que ya esta
-- personalizada (750 caracteres, con acentos). Cambiar solo el HANDOFF_DEFAULT no
-- habria tenido ningun efecto — por eso esta migracion.
--
-- Se inserta el bloque nuevo justo ANTES del cierre "Cualquier duda...", que es
-- donde corresponde y ademas es un ancla estable. Es idempotente: si ya tiene
-- {COLAB_URL}, no toca nada.

update public.app_settings
   set value = jsonb_set(
     value,
     '{onboarding_config,onboarding_handoff_msg}',
     to_jsonb(replace(
       value->'onboarding_config'->>'onboarding_handoff_msg',
       'Cualquier duda, escríbenos por aquí.',
       '👥 *Para tu equipo*' || chr(10) ||
       'Quienes se van a grabar y quien te asista necesitan su propio acceso. Que se registren aquí, cada uno con su correo:' || chr(10) ||
       '{COLAB_URL}' || chr(10) ||
       'Importante: tienen que estar registrados ANTES de la llamada de inicio.' || chr(10) || chr(10) ||
       'Cualquier duda, escríbenos por aquí.'
     ))
   )
 where key = 'global'
   and value->'onboarding_config'->>'onboarding_handoff_msg' is not null
   and value->'onboarding_config'->>'onboarding_handoff_msg' not like '%{COLAB_URL}%'
   and value->'onboarding_config'->>'onboarding_handoff_msg' like '%Cualquier duda, escríbenos por aquí.%';

-- Verificacion:
--   select value->'onboarding_config'->>'onboarding_handoff_msg' from public.app_settings where key='global';
--   -- tiene que aparecer el bloque "Para tu equipo" con {COLAB_URL} antes del cierre.
--
-- Si el ancla no matchea (porque alguien edito el cierre), el update no hace nada y
-- hay que agregar el bloque a mano desde Admin > Onboarding > "Mensaje 2".
