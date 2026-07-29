-- soporte_v31: fix de RLS que estaba filtrando todas las conversaciones
--
-- NOTA DE RECONCILIACION (29-jul-2026)
-- Este archivo esta en el repo pero NO figura en supabase_migrations: se aplico
-- suelto. Lo que hay hoy en la base no es exactamente esto:
--   * wa_conversations_read / wa_conversations_write NO se borraron (o se
--     recrearon despues): siguen vivas. Hoy conviven las 4 politicas y, como
--     las politicas se suman con OR, se lee bien.
--   * la politica real usa "tm.id = a.member_id", sin el ::text de aca abajo.
-- No se toca la base para alinearla: las 4 politicas juntas funcionan y no
-- dejan ver de mas. Se documenta para que nadie la de por aplicada tal cual.
-- Problema: cuando auth.uid() es NULL (sesión expirada o JWT inválido),
-- la vieja política soporte_conv_access() devolvía false para TODO.
-- Solución: políticas separadas para admin (ve todo) y soporte (ve sus asignadas).

-- Limpiar políticas viejas
drop policy if exists wa_conversations_read on public.wa_conversations;
drop policy if exists wa_conversations_write on public.wa_conversations;

-- NUEVA: admin ve y escribe todo
create policy wa_conversations_for_admin
  on public.wa_conversations
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- NUEVA: soporte regular ve sus chats asignados (read-only)
create policy wa_conversations_for_soporte
  on public.wa_conversations
  for select
  to authenticated
  using (
    public.has_permission('soporte', '*', 'read')
    and exists (
      select 1 from public.wa_conversation_assignees a
      join public.team_members tm on tm.id::text = a.member_id
      where a.conversation_id = wa_conversations.id
        and tm.user_id = auth.uid()
    )
  );

-- Nota: la política de WRITE para soporte puede agregarse después si se necesita
-- (por ahora admin escribe todo).
