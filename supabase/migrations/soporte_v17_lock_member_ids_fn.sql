-- soporte_v17: cerrar la función helper a usuarios autenticados (anon/public
-- no la necesitan: la agenda pública usa service-role, no esta RPC).
revoke execute on function public.korex_soporte_member_ids() from anon;
revoke execute on function public.korex_soporte_member_ids() from public;
grant execute on function public.korex_soporte_member_ids() to authenticated;
