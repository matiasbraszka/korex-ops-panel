-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v42_pedidos_todas_las_carpetas.sql
--
-- El cliente ahora ve en su plataforma TODAS las carpetas de recursos que le
-- corresponde llenar, no cuatro.
--
-- Y de paso se arregla algo que estaba roto desde siempre: la plantilla tenía
-- TRES entradas con el mismo `tipo` ('fotos' para autoridad, estilo de vida y
-- productos), y `portal_pedidos_seed` deduplica por `tipo`. Resultado: se creaba
-- la primera y las otras dos no existían. En numeros: 36 clientes tenían la
-- carpeta de autoridad y solo 2 tenían las de estilo de vida y productos.
--
-- Se corrige dandole `tipo` propio a cada carpeta. Las filas ya creadas se
-- renombran ANTES de volver a sembrar, para que a esos 2 clientes no les
-- aparezca la carpeta duplicada.
--
-- Se agregan `empresa` y `testimonios`, que son las dos que faltaban de las que
-- llena el cliente. Las demás carpetas de nivel cliente (stock, imágenes para
-- diseño, testimonios Korex, sin clasificar) quedan fuera a propósito: son de
-- uso interno del equipo, no material que el cliente tenga que subir.
--
-- Las nuevas van con `bloqueante = false`: aparecen como algo que se puede
-- subir, no como algo que traba el avance.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 1 · Las filas que ya existen adoptan el tipo nuevo (antes de sembrar).
update public.portal_pedidos set tipo = 'material_estilo'
 where tipo = 'fotos' and bucket_key = 'estilo_vida';
update public.portal_pedidos set tipo = 'material_productos'
 where tipo = 'fotos' and bucket_key = 'productos';

-- 2 · La plantilla: tipo único por carpeta + las dos nuevas.
update public.app_settings
   set value = (
     select jsonb_agg(
       case
         when e->>'bucket_key' = 'estilo_vida' then jsonb_set(e, '{tipo}', '"material_estilo"')
         when e->>'bucket_key' = 'productos'
           then jsonb_set(jsonb_set(e, '{tipo}', '"material_productos"'),
                          '{titulo}', '"Fotos de tus productos"')
         else e end
       order by (e->>'orden')::int)
     from jsonb_array_elements(value) e)
 where key = 'portal_pedidos_template';

update public.app_settings
   set value = value || jsonb_build_array(
     jsonb_build_object(
       'tipo', 'material_empresa', 'titulo', 'Material de tu empresa',
       'descripcion', 'PDFs, plan de compensación, presentaciones oficiales o cualquier material corporativo.',
       'bucket_key', 'empresa', 'bloqueante', false, 'orden', 7),
     jsonb_build_object(
       'tipo', 'material_testimonios', 'titulo', 'Testimonios de tus clientes',
       'descripcion', 'Videos horizontales o capturas de resultados reales. Sirven para la landing.',
       'bucket_key', 'testimonios', 'bloqueante', false, 'orden', 8))
 where key = 'portal_pedidos_template'
   and not exists (
     select 1 from jsonb_array_elements(value) e where e->>'tipo' = 'material_empresa');

commit;

-- 3 · Sembrar a los clientes activos (idempotente: solo crea lo que falta).
do $$
declare r record;
begin
  for r in select id from public.clients where coalesce(status, 'active') = 'active' loop
    perform public.portal_pedidos_seed(r.id);
  end loop;
end $$;
