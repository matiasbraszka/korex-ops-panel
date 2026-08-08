import { useEffect, useState, useRef } from 'react';
import { supabase } from '@korex/db';
import { Check, X, Loader2, ChevronRight } from 'lucide-react';

// El Panorama del funnel, adentro de la ficha de la tarea.
//
// La idea es no tener que ir hasta la pestaña Panorama para saber cómo viene el
// embudo en el que estás trabajando: qué hay, qué falta, y qué está esperando al
// cliente. Cada renglón es un atajo al lugar exacto donde se resuelve.
//
// Lee panorama_funnel() (migrations/panorama_v6_por_funnel.sql), que aplica las
// mismas reglas que el Panorama grande pero para un solo funnel: llamar a
// clients_panorama() desde acá sería recorrer toda la agencia para pintar diez
// renglones.

// Un renglón: tilde verde o cruz roja, qué es, y un detalle opcional a la derecha.
// Todo el renglón es clickeable y lleva al lugar donde se carga.
function Fila({ ok, label, detalle, onIr }) {
  return (
    <button
      onClick={onIr}
      title={ok ? `Ver ${label.toLowerCase()}` : `Falta ${label.toLowerCase()} · clic para ir a cargarlo`}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
        padding: '7px 8px', border: 'none', borderRadius: 8, background: 'transparent',
        cursor: 'pointer', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#F7F8FA'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{
        width: 17, height: 17, flexShrink: 0, borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: ok ? '#E6F7EE' : '#FDECEC', color: ok ? '#15803D' : '#DC2626',
      }}>
        {ok ? <Check size={11} strokeWidth={3.2} /> : <X size={11} strokeWidth={3.2} />}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: ok ? '#374151' : '#1A1D26', fontWeight: ok ? 500 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {detalle && <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#9CA3AF' }}>{detalle}</span>}
      <ChevronRight size={13} style={{ flexShrink: 0, color: '#D1D5DB' }} />
    </button>
  );
}

function Grupo({ titulo, children }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: '#AEB4BF', padding: '0 8px 3px' }}>{titulo}</div>
      {children}
    </div>
  );
}

export default function FunnelPanoramaBlock({ funnelId, onIr }) {
  // Se cachea por funnel: abrir y cerrar la misma tarea no vuelve a consultar.
  // El estado de cada funnel es el dato, o el string 'error'; "cargando" se deduce
  // de que todavía no haya ninguno de los dos, sin un useState aparte.
  const [porFunnel, setPorFunnel] = useState({});
  const pedidos = useRef(new Set());

  useEffect(() => {
    if (!funnelId || pedidos.current.has(funnelId)) return undefined;
    pedidos.current.add(funnelId);
    let vivo = true;
    supabase.rpc('panorama_funnel', { p_funnel_id: funnelId })
      // supabase-js NO lanza excepción: el error llega como valor, hay que mirarlo.
      .then(({ data, error }) => {
        if (vivo) setPorFunnel((m) => ({ ...m, [funnelId]: (error || !data) ? 'error' : data }));
      })
      .catch(() => { if (vivo) setPorFunnel((m) => ({ ...m, [funnelId]: 'error' })); });
    return () => { vivo = false; };
  }, [funnelId]);

  if (!funnelId) return null;
  const r = porFunnel[funnelId];
  const d = r && r !== 'error' ? r : null;

  if (!d) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#9CA3AF', padding: '10px 8px' }}>
        {r === 'error'
          ? 'No se pudo traer el estado del funnel.'
          : <><Loader2 size={13} className="animate-spin" />Buscando cómo viene el funnel…</>}
      </div>
    );
  }

  const aviso = (texto, tono) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: tono.bg, color: tono.fg }}>{texto}</span>
  );
  const ambar = { bg: '#FFFBEB', fg: '#B45309' };
  const nGrabar = d.guiones_para_grabar || 0;
  const nRevisar = d.esperando_revision || 0;
  const target = d.ads_target;
  const entregados = d.ads_entregados || 0;

  return (
    <div>
      {/* Lo que está frenado del lado del cliente. Va primero porque es lo único
          que no se resuelve trabajando: hay que ir a pedirlo. */}
      {(nGrabar > 0 || nRevisar > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 8px 6px' }}>
          {nGrabar > 0 && aviso(`${nGrabar} ${nGrabar === 1 ? 'guión' : 'guiones'} esperando grabación`, ambar)}
          {nRevisar > 0 && aviso(`${nRevisar} ${nRevisar === 1 ? 'sección' : 'secciones'} sin revisar`, ambar)}
        </div>
      )}

      <Grupo titulo="Documento">
        <Fila ok={!!d.del_ok}        label="DEL vinculado"       onIr={() => onIr('estrategia', 'del')} />
        <Fila ok={!!d.tiene_avatar}  label="Avatar"              onIr={() => onIr('avatares', 'del')} />
        <Fila ok={!!d.vsl_guionado}  label="Guión del VSL"       onIr={() => onIr('vsl', 'del')} />
        <Fila ok={!!d.ads_guionado}  label="Guiones de anuncios" onIr={() => onIr('anuncios', 'del')} />
      </Grupo>

      <Grupo titulo="Material">
        <Fila ok={!!d.vsl_editado} label="VSL editado" onIr={() => onIr('vsl_edit', 'recursos')} />
        <Fila ok={!!d.ads_editado} label="Anuncios editados"
          detalle={target ? `${entregados} de ${target}` : (entregados ? String(entregados) : null)}
          onIr={() => onIr('ad_edit', 'recursos')} />
        <Fila ok={(d.testimonios_files || 0) > 0} label="Testimonios"
          detalle={d.testimonios_files ? String(d.testimonios_files) : null}
          onIr={() => onIr('testimonios', 'recursos')} />
      </Grupo>

      <Grupo titulo="Publicación">
        <Fila ok={!!d.dominio}       label="Dominio" detalle={d.dominio ? null : undefined} onIr={() => onIr('official_domain', 'config')} />
        <Fila ok={!!d.tiene_pixel}   label="Pixel de Meta"       onIr={() => onIr('pixel_id', 'config')} />
        <Fila ok={!!d.tiene_clarity} label="Microsoft Clarity"   onIr={() => onIr('clarity_id', 'config')} />
        <Fila ok={!!d.tiene_eventos} label="Eventos de conversión" onIr={() => onIr('eventos', 'config')} />
      </Grupo>
    </div>
  );
}
