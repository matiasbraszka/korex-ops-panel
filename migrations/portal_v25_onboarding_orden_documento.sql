-- ─────────────────────────────────────────────────────────────────────────────
-- portal_v25_onboarding_orden_documento.sql
--
-- Alinea el recorrido con la ESTRUCTURA DEL DOCUMENTO DE ONBOARDING original:
-- primero toda la información que solo el cliente tiene en la cabeza, y al final
-- "8. Necesitamos del cliente" (los archivos). Eso mueve el tramo `material` del
-- lugar 2 al último.
--
-- POR QUÉ ESTO NO REVIVE LA FALLA DE SIEMPRE (que el cliente no sube material):
-- la razón por la que hoy no sube nada no es dónde está el tramo, es que se
-- entera de que necesita el logo cuando ya lleva una hora contestando. Lo que lo
-- arregla es el CHECKLIST PREVIO: la lista de lo que va a necesitar aparece en
-- la bienvenida, antes de la primera pregunta, y el cliente lo junta mientras
-- responde. Para eso se agrega `onboarding_questions.checklist_previa`.
--
-- Además:
--   · los `minutos` de cada tramo dejan de estar inventados y pasan a ser la
--     suma real de sus preguntas (los tramos declaraban 44 y las preguntas
--     sumaban 98 — el número que ve el cliente tiene que ser el verdadero);
--   · el paso 0 explica QUÉ SE HACE en la sesión, con el aviso de la página de
--     Facebook/Instagram, que es lo que hoy obliga a reagendar.
--
-- Idempotente. Cierra con notify pgrst.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. Checklist previo ──────────────────────────────────────────────────────
-- Editable desde el panel como cualquier otro texto de la pregunta. Cuando no es
-- null, la pregunta aparece en "lo que vas a necesitar" de la bienvenida.
alter table public.onboarding_questions
  add column if not exists checklist_previa text;

comment on column public.onboarding_questions.checklist_previa is
  'Si no es null, esta pregunta se lista en la bienvenida como material a juntar antes de empezar.';

update public.onboarding_questions set checklist_previa = v.txt
from (values
  ('material_logo',            'Tu logo, en la mejor calidad que tengas'),
  ('material_colores',         'Los colores de tu marca'),
  ('material_fotos_autoridad', '5 fotos tuyas con buena luz, donde se te vea bien'),
  ('testimonios_relato',       'Los casos de 3 personas a las que les fue bien con vos'),
  ('material_estilo_vida',     'Fotos de tu día a día (opcional, pero suman mucho)')
) as v(k, txt)
where onboarding_questions.qkey = v.k
  and onboarding_questions.checklist_previa is distinct from v.txt;

-- ── 2. El material va al final, como en el documento ─────────────────────────
update public.onboarding_sections set orden = 2 where skey = 'historia';
update public.onboarding_sections set orden = 3 where skey = 'negocio';
update public.onboarding_sections set orden = 4 where skey = 'gente';
update public.onboarding_sections set orden = 5 where skey = 'cierre';
update public.onboarding_sections set orden = 6 where skey = 'material';

-- Copy: `cierre` deja de ser el final y `material` pasa a serlo.
update public.onboarding_sections set
  subtitulo = 'Links, presupuesto y fecha de grabación. Es rápido.',
  promesa   = 'Listo. Ya tenemos todo lo que teníamos que preguntarte.',
  checkpoint = true
where skey = 'cierre';

update public.onboarding_sections set
  titulo    = 'Tu material',
  subtitulo = 'Lo último: subinos los archivos que te pedimos al principio.',
  promesa   = 'Terminaste. Ahora empezamos nosotros.',
  checkpoint = false,
  desbloquea = '/material'
where skey = 'material';

-- Los tramos largos dan permiso explícito de parar: eso BAJA el abandono,
-- porque saca la sensación de estar atrapado en un formulario sin fin.
update public.onboarding_sections set checkpoint = true
  where skey in ('historia', 'negocio', 'gente');

-- ── 3. "Quién nos puede ayudar" va con el material ───────────────────────────
-- En el documento las dos son "8. Necesitamos del cliente", y preguntarle quién
-- lo ayuda a juntar los archivos justo antes de pedírselos es donde tiene
-- sentido — al final de una lista de links no lo tiene.
update public.onboarding_questions set skey = 'material', orden = 70
  where qkey = 'delegado_nombre';
update public.onboarding_questions set skey = 'material', orden = 71
  where qkey = 'delegado_whatsapp';

-- ── 4. Los minutos dejan de mentir ───────────────────────────────────────────
-- El tramo declaraba un número a ojo y las preguntas sumaban otro: el cliente
-- veía "9 minutos" en la portada de un tramo de 29. Prometer 40 y tardar 90 es
-- peor que prometer 60.
update public.onboarding_sections s set minutos = greatest(1, x.suma)
from (
  select q.skey, coalesce(sum(q.minutos), 0)::int as suma
  from public.onboarding_questions q where q.activa group by q.skey
) x
where x.skey = s.skey and s.minutos is distinct from greatest(1, x.suma);

-- ── 5. Qué se hace en la sesión de onboarding ────────────────────────────────
-- Lo pidió explícito Matías. El punto de Facebook/Instagram es el que hoy
-- obliga a reagendar reuniones, así que va con el aviso adelante, en el paso 0,
-- no escondido en la confirmación.
insert into public.app_settings (key, value)
values ('onboarding_config', jsonb_build_object(
  'sesion_agenda', jsonb_build_array(
    jsonb_build_object(
      'titulo', 'Resolvemos tus dudas del onboarding',
      'texto',  'Repasamos juntos lo que completaste acá. Por eso es fundamental que lo termines antes de la reunión.'),
    jsonb_build_object(
      'titulo', 'Configuramos tu Meta Business',
      'texto',  'Necesitás tener acceso a una página de Facebook y a un Instagram. Si no los tenés, vamos a tener que reagendar.',
      'aviso',  true),
    jsonb_build_object(
      'titulo', 'Dejamos definidos los próximos pasos',
      'texto',  'Qué hacemos nosotros, qué necesitamos de vos y cuándo sale cada cosa.')
  )
))
on conflict (key) do update
set value = public.app_settings.value || excluded.value;

-- El mismo contenido en el calendario, para el WhatsApp y el mail de
-- confirmación que ya manda `agenda-publica`.
update public.booking_calendars set confirm_instructions = jsonb_build_array(
  'Repasamos las dudas de tu onboarding: completalo antes de la reunión.',
  'Configuramos tu Meta Business. Tené acceso a una página de Facebook y a un Instagram, o vamos a tener que reagendar.',
  'Dejamos definidos los próximos pasos para la entrega del servicio.',
  'Es por videollamada, dura una hora. Mejor desde una computadora: vamos a compartir pantalla.'
) where slug = 'onboarding';

-- ── 6. RPCs ──────────────────────────────────────────────────────────────────
-- El catálogo suma `checklist` (lo que el cliente tiene que juntar) y expone
-- `checklistPrevia` por pregunta.
create or replace function public.portal_onboarding_catalogo()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'version', (select coalesce(max(greatest(s.updated_at, q.updated_at)), now())
                  from public.onboarding_sections s
                  left join public.onboarding_questions q on q.skey = s.skey),
    'checklist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'qkey', q.qkey, 'skey', q.skey, 'texto', q.checklist_previa,
        'requerido', q.requerida
      ) order by q.requerida desc, s.orden, q.orden)
      from public.onboarding_questions q
      join public.onboarding_sections s on s.skey = q.skey
      where q.activa and s.activa and q.checklist_previa is not null), '[]'::jsonb),
    'secciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'skey', s.skey, 'titulo', s.titulo, 'subtitulo', s.subtitulo,
        'promesa', s.promesa, 'intro', s.intro_md, 'video', s.video_url,
        'minutos', s.minutos, 'checkpoint', s.checkpoint, 'desbloquea', s.desbloquea,
        'preguntas', coalesce((
          select jsonb_agg(jsonb_build_object(
            'qkey', q.qkey, 'grupo', q.grupo, 'label', q.label, 'sublabel', q.sublabel,
            'ayuda', q.ayuda_md, 'ejemplo', q.ejemplo, 'chips', q.chips,
            'placeholder', q.placeholder, 'video', q.video_url,
            'tipo', q.qtype, 'opciones', q.opciones, 'voz', q.voz,
            'requerida', q.requerida, 'minChars', q.min_chars, 'peso', q.peso,
            'minutos', q.minutos, 'visibleSi', q.visible_si,
            'bucket', q.bucket_key, 'target', q.target_count,
            'checklistPrevia', q.checklist_previa
          ) order by q.orden)
          from public.onboarding_questions q
          where q.skey = s.skey and q.activa), '[]'::jsonb)
      ) order by s.orden)
      from public.onboarding_sections s where s.activa), '[]'::jsonb)
  );
$function$;

-- Los datos de la agenda suman el guion de la sesión.
create or replace function public.portal_onboarding_agenda_datos()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_cid text; v_cli record; v_token text; v_sesion jsonb;
begin
  v_cid := public.portal_cliente_client();
  if v_cid is null then return null; end if;
  select name, email, phone, country into v_cli from public.clients where id = v_cid;
  select value->>'onboarding_calendar_token' into v_token
    from public.app_settings where key = 'portal_config';
  select value->'sesion_agenda' into v_sesion
    from public.app_settings where key = 'onboarding_config';
  return jsonb_build_object(
    'token', v_token,
    'sesion', coalesce(v_sesion, '[]'::jsonb),
    'nombre', v_cli.name, 'email', v_cli.email,
    'telefono', v_cli.phone, 'pais', v_cli.country
  );
end $function$;

-- Se recrearon: hay que rehacer los grants de v24 (por defecto quedan en public).
revoke execute on function public.portal_onboarding_catalogo() from public, anon;
revoke execute on function public.portal_onboarding_agenda_datos() from public, anon;
grant execute on function public.portal_onboarding_catalogo() to authenticated, service_role;
grant execute on function public.portal_onboarding_agenda_datos() to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
