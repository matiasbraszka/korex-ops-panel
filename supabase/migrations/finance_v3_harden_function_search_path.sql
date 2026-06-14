-- Hardening: fijar search_path en la función trigger (mismo patrón que has_permission, etc.).
-- Cierra el warning del advisor "function_search_path_mutable".
alter function public.fin_touch_updated_at() set search_path to 'public', 'pg_temp';
