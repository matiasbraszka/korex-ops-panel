-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v27_onboarding_historia_despues_de_oferta.sql
--
-- "Tu historia" pasa a ir DESPUÉS de "Tu negocio y tu oferta".
--
-- Verificado antes de mover: las siete preguntas con `visible_si` dependen de
-- otra pregunta del MISMO tramo (motor, web_estado, compliance,
-- delegado_nombre), así que reordenar tramos no deja ninguna condición
-- apuntando a una respuesta que todavía no se pidió. Si en el futuro se agrega
-- una condición entre tramos, hay que revisar esto antes de reordenar:
--
--   select q.qkey, s.orden, q.visible_si->>'qkey' as depende_de
--     from onboarding_questions q join onboarding_sections s on s.skey = q.skey
--    where q.activa and q.visible_si->>'qkey' is not null;
--
-- Orden final: agenda · datos · negocio · historia · gente · cierre · material.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

update public.onboarding_sections set orden = 2 where skey = 'negocio';
update public.onboarding_sections set orden = 3 where skey = 'historia';

commit;

notify pgrst, 'reload schema';
