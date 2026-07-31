// El botón "Generar branding" de la carpeta Branding, con su popover de opciones, el loop de
// generación y los avisos.
//
// Vive aparte de FunnelResourceFolder porque es una pieza entera con su propia máquina de
// estados, y la carpeta ya es larga.
//
// POR QUÉ EL LOOP ESTÁ ACÁ Y NO EN EL SERVIDOR: una corrida completa son 3-5 minutos (cada
// imagen tarda entre 40 y 90 segundos). En una sola llamada, cualquier corte tira todo. La edge
// function expone tres pasos —plan, render (una imagen), palettes— y acá se encadenan, así los
// logos aparecen de a uno y un fallo en el logo 3 no se lleva puestos los logos 1 y 2.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@korex/db';
import { Sparkles, RefreshCw, X, Pencil, AlertTriangle } from 'lucide-react';
import Modal from '../../Modal';

// Estimación para mostrar antes de gastar. Va conservadora a propósito: que la cuenta real dé
// menos de lo anunciado es mejor que al revés.
const PRECIO_IMG = { medium: 0.05, high: 0.18 };
const PRECIO_PLAN = 0.06;
const estimar = (n, q) => (PRECIO_PLAN + n * (PRECIO_IMG[q] || PRECIO_IMG.medium)).toFixed(2);

// Piezas que se entregan y, aparte, imágenes que se PAGAN: el lockup de cada identidad lo arma el
// sistema pegando las otras dos, así que no cuesta nada. Tiene que coincidir con FORMATOS de la
// edge function.
const FORMATOS = {
  sistema: { piezas: 3, imagenes: 2 },
  dos_direcciones: { piezas: 6, imagenes: 4 },
};

// Qué se está generando en cada paso, para que el cartel diga algo útil en vez de 'logo 2 de 3'.
const ROTULO_PIEZA = {
  3: ['el isotipo', 'el logotipo', 'el isotipo + la tipografía'],
  6: ['el logotipo (nombre del líder)', 'el monograma (nombre del líder)', 'el conjunto (nombre del líder)',
      'el logotipo (nombre del equipo)', 'el monograma (nombre del equipo)', 'el conjunto (nombre del equipo)'],
};

/**
 * Llama a la edge function. Si está definida VITE_BRANDING_FN_URL, va contra la que corre en
 * local (ver DESARROLLO-AGENTES.md) — así se prueba sin deployar. En cualquier build de
 * producción esa variable no existe y el camino es el de siempre.
 *
 * supabase-js devuelve un error genérico ante cualquier status que no sea 2xx y deja el cuerpo
 * real en error.context: ahí está lo que la función se tomó el trabajo de explicar (qué dato
 * falta, qué tope se alcanzó). Sin leerlo, el equipo ve "non-2xx status code" y no sabe qué hacer.
 */
async function invocar(body, signal) {
  const local = import.meta.env.VITE_BRANDING_FN_URL;
  if (local) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(local, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json().catch(() => null);
    if (!data) throw new Error(`La edge fn local (${local}) no respondió JSON. ¿Está levantada?`);
    return data;
  }
  const { data, error } = await supabase.functions.invoke('generar-branding', { body, signal });
  let payload = data;
  if (error?.context && typeof error.context.json === 'function') {
    try { payload = await error.context.json(); } catch { /* nos quedamos con el genérico */ }
  }
  return payload || { ok: false, error: 'sin_respuesta', detail: error?.message || 'No hubo respuesta del servidor.' };
}

export default function BrandingGenerator({ clientId, color, hayGenerados, onDone, onEditarCliente }) {
  const [gen, setGen] = useState({ status: 'idle' });
  const [abierto, setAbierto] = useState(false);
  const [opts, setOpts] = useState({ formato: 'sistema', quality: 'medium', modo: 'variar' });
  // Bandera para no tocar el estado si el componente ya se fue (la corrida dura minutos y el
  // equipo puede cerrar la carpeta en el medio).
  //
  // El `vivo.current = true` del setup NO es decorativo: en desarrollo StrictMode monta, desmonta
  // y vuelve a montar cada componente. Sin esa línea, la limpieza del primer montaje dejaba la
  // bandera apagada PARA SIEMPRE, y entonces el análisis corría y se guardaba en la base pero el
  // paso siguiente se cortaba en seco: el botón quedaba girando eternamente sin generar nada.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  const corriendo = gen.status === 'planning' || gen.status === 'rendering';

  const abrir = () => setAbierto(true);

  const fallo = (r, hechos) => {
    if (r?.error === 'datos_incompletos') {
      setGen({ status: 'faltan_datos', faltan: r.faltan || [] });
      return;
    }
    setGen({ status: 'error', detail: r?.detail || 'No pude generar el branding.', hechos });
  };

  // Todo el loop va dentro de un try. Sin esto, cualquier excepción (el caso típico: el servidor
  // no responde, así que el fetch tira) deja el botón colgado en "Generando…" para siempre y sin
  // ningún cartel: el equipo se queda mirando un spinner eterno sin saber que algo se rompió.
  const generar = async () => {
    setAbierto(false);
    const { formato, quality } = opts;
    const modo = hayGenerados ? opts.modo : 'nuevo';
    let hechos = 0;

    try {
      setGen({ status: 'planning' });
      const plan = await invocar({ action: 'plan', client_id: clientId, modo, formato, quality });
      if (!vivo.current) return;
      if (!plan?.ok) return fallo(plan, 0);

      const total = (plan.n_logos || FORMATOS[formato]?.piezas || 3);
      setGen({ status: 'rendering', hecho: 0, total, marca: plan.plan?.nombre_marca, modoMarca: plan.plan?.modo_marca });

      for (let i = 1; i <= total; i++) {
        const r = await invocar({ action: 'render', client_id: clientId, run_id: plan.run_id, idx: i });
        if (!vivo.current) return;
        if (!r?.ok) { await onDone?.(); return fallo(r, i - 1); }
        hechos = i;
        setGen(g => ({ ...g, hecho: i }));
        await onDone?.();   // los logos aparecen de a uno, no todos juntos al final
      }

      const pal = await invocar({ action: 'palettes', client_id: clientId, run_id: plan.run_id });
      if (!vivo.current) return;
      if (!pal?.ok) { await onDone?.(); return fallo(pal, total); }

      await onDone?.();
      setGen({ status: 'done', n: total, paletas: (pal.resources || []).length, repetidas: pal.repetidas || 0 });
      setTimeout(() => vivo.current && setGen({ status: 'idle' }), 9000);
    } catch (e) {
      if (!vivo.current) return;
      await onDone?.().catch(() => {});
      setGen({ status: 'error', detail: `No pude comunicarme con el servidor: ${e?.message || e}`, hechos });
    }
  };

  const aviso = (fondo, borde, texto, contenido) => (
    <div className="flex items-start gap-2 py-2 px-2.5 rounded-lg mb-2 text-[11.5px] font-medium leading-snug"
      style={{ background: fondo, color: texto, border: `1px solid ${borde}` }}>
      {contenido}
    </div>
  );

  return (
    <>
      {/* El tiempo estimado va explícito: en un cliente con mucho material esto tarda más de un
          minuto, y sin el número la espera se lee como "se colgó" y el equipo recarga la página. */}
      {gen.status === 'planning' && aviso('#FDF2F8', '#FBCFE8', '#BE185D', (
        <><RefreshCw size={13} className="animate-spin mt-px shrink-0" /><span>Leyendo el onboarding, la investigación y la personalidad del cliente para definir la dirección de arte. <b>Puede tardar 1 o 2 minutos</b> — no cierres la pestaña.</span></>
      ))}

      {gen.status === 'rendering' && (
        <div className="py-2 px-2.5 rounded-lg mb-2" style={{ background: '#FDF2F8', border: '1px solid #FBCFE8' }}>
          <div className="flex items-center gap-2 text-[11.5px] font-semibold" style={{ color: '#BE185D' }}>
            <RefreshCw size={13} className="animate-spin shrink-0" />
            Generando {ROTULO_PIEZA[gen.total]?.[gen.hecho] || `pieza ${gen.hecho + 1}`} ({Math.min(gen.hecho + 1, gen.total)} de {gen.total})… puede tardar un minuto por pieza.
          </div>
          <div className="h-1 rounded-full bg-white mt-1.5 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${(gen.hecho / gen.total) * 100}%`, background: '#BE185D' }} />
          </div>
          {gen.marca && (
            <div className="text-[10.5px] mt-1" style={{ color: '#9D5C7C' }}>
              Marca elegida: <b>{gen.marca}</b> ({gen.modoMarca === 'equipo' ? 'nombre del equipo' : 'marca personal'})
            </div>
          )}
        </div>
      )}

      {gen.status === 'done' && aviso('#ECFDF5', '#A7F3D0', '#15803D', (
        <span>
          Listo: {gen.n} pieza{gen.n === 1 ? '' : 's'} (cada una en color, negro y blanco) y {gen.paletas} paleta{gen.paletas === 1 ? '' : 's'}. Borrá lo que no te guste y quedate con lo bueno.
          {gen.repetidas > 0 && <><br />Descarté {gen.repetidas} paleta{gen.repetidas === 1 ? '' : 's'} por ser casi igual{gen.repetidas === 1 ? '' : 'es'} a {gen.repetidas === 1 ? 'una' : 'otras'} que ya estaba{gen.repetidas === 1 ? '' : 'n'} en la carpeta.</>}
        </span>
      ))}

      {gen.status === 'error' && aviso('#FEF2F2', '#FECACA', '#B91C1C', (
        <>
          <X size={13} className="mt-px shrink-0" />
          <span>
            {gen.detail}
            {gen.hechos > 0 && <><br />Se alcanzaron a generar {gen.hechos} pieza{gen.hechos === 1 ? '' : 's'}, que quedan guardadas. Si volvés a intentar, se agregan a los que ya están.</>}
          </span>
        </>
      ))}

      {gen.status === 'faltan_datos' && (
        <div className="flex items-center justify-between gap-3 flex-wrap py-2 px-2.5 rounded-lg mb-2"
          style={{ background: '#FFFBEB', color: '#B45309', border: '1px solid #FBE6BE' }}>
          <span className="text-[11.5px] font-medium leading-snug flex items-start gap-2">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            <span>Para generar el branding falta completar en la tarjeta del cliente: <b>{gen.faltan.join(', ')}</b>.</span>
          </span>
          {onEditarCliente && (
            <button onClick={() => { setGen({ status: 'idle' }); onEditarCliente(); }}
              className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border bg-white text-[12px] font-semibold cursor-pointer shrink-0"
              style={{ borderColor: '#E7C98A', color: '#B45309' }}>
              <Pencil size={12} />Completar ahora
            </button>
          )}
        </div>
      )}

      <button onClick={abrir} disabled={corriendo}
        className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border-none text-white text-[11.5px] font-semibold cursor-pointer disabled:opacity-60"
        style={{ background: color }}>
        {corriendo ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
        {corriendo ? 'Generando…' : hayGenerados ? 'Regenerar branding' : 'Generar branding'}
      </button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Generar branding"
        maxWidth={460}
        footer={
          <div className="flex items-center justify-between w-full gap-3">
            <span className="text-[11.5px] text-[#9098A4]">Costo estimado: <b className="text-[#3F4653]">US${estimar(FORMATOS[opts.formato].imagenes, opts.quality)}</b></span>
            <div className="flex gap-2">
              <button onClick={() => setAbierto(false)}
                className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-[#6B7280] font-medium cursor-pointer">Cancelar</button>
              <button onClick={generar}
                className="inline-flex items-center gap-1.5 text-[12.5px] py-2 px-4 rounded-lg border-none text-white font-semibold cursor-pointer"
                style={{ background: color }}>
                <Sparkles size={13} />Generar
              </button>
            </div>
          </div>
        }>
        <div className="text-[12.5px] text-[#6B7280] mb-4 leading-relaxed">
          La IA lee el onboarding, la investigación y la personalidad del cliente, decide si la marca
          va por su nombre o por el del equipo, y deja en esta carpeta la identidad completa (cada
          pieza en color, negro y blanco, con fondo transparente) y 3 paletas de colores.
        </div>

        <Grupo titulo="¿Qué generar?">
          <Opcion activo={opts.formato === 'sistema'} onClick={() => setOpts(o => ({ ...o, formato: 'sistema' }))} color={color}
            titulo="Identidad completa · 3 piezas"
            nota="El isotipo solo, el nombre solo, y los dos juntos — la misma marca en los tres formatos" />
          <Opcion activo={opts.formato === 'dos_direcciones'} onClick={() => setOpts(o => ({ ...o, formato: 'dos_direcciones' }))} color={color}
            titulo="Las dos direcciones · 6 piezas"
            nota="Una identidad con el nombre del líder y otra con el del equipo, para elegir borrando" />
        </Grupo>

        <Grupo titulo="Calidad de imagen">
          <Opcion activo={opts.quality === 'medium'} onClick={() => setOpts(o => ({ ...o, quality: 'medium' }))} color={color}
            titulo="Media" nota="Suficiente para elegir cuál te gusta" />
          <Opcion activo={opts.quality === 'high'} onClick={() => setOpts(o => ({ ...o, quality: 'high' }))} color={color}
            titulo="Alta" nota="Más definición, cuatro veces más cara" />
        </Grupo>

        {hayGenerados && (
          <Grupo titulo="Ya hay material en esta carpeta">
            <Opcion activo={opts.modo === 'variar'} onClick={() => setOpts(o => ({ ...o, modo: 'variar' }))} color={color}
              titulo="Variar sobre lo que quedó" nota="Sigue la línea de lo que no borraste" />
            <Opcion activo={opts.modo === 'otra_direccion'} onClick={() => setOpts(o => ({ ...o, modo: 'otra_direccion' }))} color={color}
              titulo="Cambiar de dirección" nota="Empieza de cero, con otra familia visual" />
          </Grupo>
        )}
      </Modal>
    </>
  );
}

function Grupo({ titulo, children }) {
  return (
    <div className="mb-2.5">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#AEB4BF] mb-1">{titulo}</div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Opcion({ activo, onClick, titulo, nota, color }) {
  return (
    <button onClick={onClick}
      className="flex items-start gap-2 w-full text-left rounded-lg border px-2.5 py-1.5 cursor-pointer bg-white"
      style={{ borderColor: activo ? color : '#EDF0F5' }}>
      <span className="w-3.5 h-3.5 rounded-full border inline-flex items-center justify-center shrink-0 mt-px"
        style={{ borderColor: activo ? color : '#C3C9D4' }}>
        {activo && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[11.5px] font-semibold" style={{ color: activo ? color : '#3F4653' }}>{titulo}</span>
        <span className="block text-[10.5px] text-[#9098A4] leading-snug">{nota}</span>
      </span>
    </button>
  );
}
