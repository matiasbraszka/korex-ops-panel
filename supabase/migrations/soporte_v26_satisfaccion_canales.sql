-- soporte_v26: separa el 1-a-1 en DOS canales (con el cliente / con los usuarios)
-- y guarda un resumen de texto por cada canal, para mostrarlo en la tarjeta de
-- Soporte y en la nueva pestaña "Satisfacción" de Operaciones.
--
-- Antes: un solo puntaje "privado" (sat_privado) juntaba TODOS los chats 1-a-1.
-- Ahora se decide por el rol del contacto en el directorio de Finanzas
-- (fin_directory.tipo, cruzado por teléfono):
--   tipo='Cliente'    → 1-a-1 con el cliente   (sat_privado_cliente)
--   otro / desconocido → 1-a-1 con los usuarios (sat_privado_usuarios)
--
-- Puntuación general del cliente = promedio de los 4 canales presentes (sat_overall,
-- ya 0..100), que el frontend muestra de forma proporcional (ej. 270/300).

-- 1. Columnas nuevas en wa_briefings (aditivo). Se CONSERVAN sat_privado / _label
--    como columnas durmientes por compatibilidad; la UI nueva deja de leerlas.
ALTER TABLE public.wa_briefings
  ADD COLUMN IF NOT EXISTS sat_privado_cliente        int,
  ADD COLUMN IF NOT EXISTS sat_privado_cliente_label  text,
  ADD COLUMN IF NOT EXISTS sat_privado_usuarios       int,
  ADD COLUMN IF NOT EXISTS sat_privado_usuarios_label text,
  ADD COLUMN IF NOT EXISTS resumen_usuarios           text,
  ADD COLUMN IF NOT EXISTS resumen_cliente_grupo      text,
  ADD COLUMN IF NOT EXISTS resumen_privado_cliente    text,
  ADD COLUMN IF NOT EXISTS resumen_privado_usuarios   text;

-- 2. Ampliar el CHECK de scope de la serie semanal para los dos nuevos ámbitos
--    (se mantiene 'privado' para las filas históricas ya cargadas).
ALTER TABLE public.wa_satisfaction_history
  DROP CONSTRAINT IF EXISTS wa_satisfaction_history_scope_check;
ALTER TABLE public.wa_satisfaction_history
  ADD CONSTRAINT wa_satisfaction_history_scope_check
  CHECK (scope IN ('usuarios','cliente_grupo','privado','privado_cliente','privado_usuarios'));

-- 3. RPC para que Operaciones lea la satisfacción por cliente.
--    wa_briefings está gateada por RLS a 'soporte'; los usuarios de Operaciones no
--    tienen ese permiso, así que exponemos los datos vía SECURITY DEFINER, gateado
--    por el permiso de lectura de Operaciones (o de Soporte). Sirve para el semáforo
--    de la lista y para la pestaña de detalle del cliente.
CREATE OR REPLACE FUNCTION public.ops_wa_satisfaction()
RETURNS TABLE (
  client_id text, name text,
  sat_usuarios int, sat_cliente_grupo int,
  sat_privado_cliente int, sat_privado_usuarios int,
  sat_overall int,
  resumen_usuarios text, resumen_cliente_grupo text,
  resumen_privado_cliente text, resumen_privado_usuarios text,
  estado text, riesgos text, updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.client_id, c.name,
    b.sat_usuarios, b.sat_cliente_grupo,
    b.sat_privado_cliente, b.sat_privado_usuarios,
    b.sat_overall,
    b.resumen_usuarios, b.resumen_cliente_grupo,
    b.resumen_privado_cliente, b.resumen_privado_usuarios,
    b.estado, b.riesgos, b.updated_at
  FROM public.wa_briefings b
  JOIN public.clients c ON c.id = b.client_id
  WHERE has_permission('operations', '*', 'read')
     OR has_permission('soporte', '*', 'read');
$$;
REVOKE ALL ON FUNCTION public.ops_wa_satisfaction() FROM public;
GRANT EXECUTE ON FUNCTION public.ops_wa_satisfaction() TO authenticated;
