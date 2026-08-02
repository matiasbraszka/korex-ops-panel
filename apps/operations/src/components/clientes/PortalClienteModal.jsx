// Portal del cliente — acceso desde la ficha del cliente en operaciones.
// Muestra la cuenta del portal (email + contraseña generada) para pasársela al
// cliente o entrar a su cuenta, y permite crearla si todavía no existe.
// Backend: RPCs portal_admin_estado / portal_admin_activar (solo equipo).
import { useEffect, useState } from 'react';
import { supabase } from '@korex/db';
import { Smartphone, Copy, Check, ExternalLink, RefreshCw, Eye, EyeOff, Plus, Trash2, ClipboardList, BadgeCheck, Activity, Users, Link2, Power, Film } from 'lucide-react';
import Modal from '../Modal';

// URL pública del portal. Configurable por env; fallback al dominio previsto.
const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://clientes.metodokorex.com';

// Carpetas del cliente donde puede caer el material de un pedido.
const BUCKETS_PEDIDO = [
  { key: 'autoridad', label: 'Fotos de Autoridad' },
  { key: 'branding', label: 'Branding (logo, colores)' },
  { key: 'productos', label: 'Foto de productos' },
  { key: 'estilo_vida', label: 'Fotos Estilo de vida' },
  { key: 'empresa', label: 'Material de la empresa' },
  { key: 'testimonios_korex', label: 'Testimonios' },
  { key: 'sin_clasif', label: 'Sin clasificar' },
];
const ESTADO_PEDIDO = {
  pendiente: { label: 'Pendiente', bg: '#FEF3C7', c: '#B45309' },
  cliente_dice_listo: { label: 'Cliente dice listo · validar', bg: '#DBEAFE', c: '#1D4FD8' },
  completo: { label: 'Completo', bg: '#DCFCE7', c: '#15803D' },
  validado: { label: 'Validado', bg: '#DCFCE7', c: '#15803D' },
};
const EVENTO_LABEL = {
  subida: '📤 Subió material', guion_grabado: '🎬 Marcó grabado', comentario: '💬 Comentó un guion',
  acceso_meta_listo: '✅ Dice que dio acceso a Meta', pedido_completo: '📦 Completó un pedido',
};

export default function PortalClienteModal({ client, onClose }) {
  const [estado, setEstado] = useState(null);   // respuesta de portal_admin_estado
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [showPwd, setShowPwd] = useState({});   // login_email -> bool
  const [copied, setCopied] = useState('');     // qué se copió (feedback)
  const [pedidos, setPedidos] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [nuevo, setNuevo] = useState({ titulo: '', bucket: 'autoridad', target: '', bloqueante: false });

  const [onbEstado, setOnbEstado] = useState(null);
  const [invitando, setInvitando] = useState(false);
  const [invitacion, setInvitacion] = useState(null);   // { magic_link, mensaje_whatsapp, warnings }

  const [collabToken, setCollabToken] = useState(null); // token del link de colaboradores
  const [collabs, setCollabs] = useState([]);           // colaboradores registrados
  const [grab, setGrab] = useState(null);               // resumen de grabaciones

  const cargar = async () => {
    setErr('');
    const { data, error } = await supabase.rpc('portal_admin_estado', { p_client_id: client.id });
    if (error || !data?.ok) { setErr(data?.error || error?.message || 'No pude leer el estado.'); return; }
    setEstado(data);
    if (!email) setEmail(data.person?.email || data.client?.email || '');
  };

  const cargarOnb = async () => {
    const { data } = await supabase.rpc('onboarding_admin_estado', { p_client_id: client.id });
    setOnbEstado(data || null);
  };

  // ── Colaboradores del cliente (link auto-servicio + lista) ──
  const cargarCollab = async () => {
    const [{ data: link }, { data: lista }] = await Promise.all([
      supabase.rpc('portal_collab_link', { p_client_id: client.id }),
      supabase.rpc('portal_collab_list', { p_client_id: client.id }),
    ]);
    if (link?.ok) setCollabToken(link.token);
    if (lista?.ok) setCollabs(lista.colaboradores || []);
  };
  const collabUrl = collabToken ? `${PORTAL_URL}/colaborador?t=${collabToken}` : '';
  const rotarCollab = async () => {
    if (!window.confirm('¿Generar un enlace nuevo? El enlace anterior deja de funcionar (los que ya se sumaron siguen entrando).')) return;
    const { data } = await supabase.rpc('portal_collab_rotate', { p_client_id: client.id });
    if (data?.ok) setCollabToken(data.token);
  };
  const toggleCollab = async (c) => {
    const nuevo = !c.enabled;
    if (!nuevo && !window.confirm(`¿Quitar el acceso de ${c.full_name || c.email}? No podrá entrar hasta que lo vuelvas a habilitar.`)) return;
    const { data } = await supabase.rpc('portal_collab_set_enabled', { p_id: c.id, p_enabled: nuevo });
    if (data?.ok) setCollabs((prev) => prev.map((x) => x.id === c.id ? { ...x, enabled: nuevo } : x));
  };

  // Invita (o reenvía). La edge function verifica PRIMERO que el vínculo
  // cliente ↔ directorio resuelva: si no, no manda nada y avisa por Slack —
  // un cliente mal vinculado entra a la plataforma y la ve vacía, sin error.
  const invitar = async (motivo) => {
    setInvitando(true); setErr(''); setInvitacion(null);
    try {
      const { data, error } = await supabase.functions.invoke('onboarding-invitar', {
        body: { client_id: client.id, email: email.trim() || null, motivo },
      });
      if (error || !data?.ok) {
        setErr(data?.detail || data?.error || error?.message || 'No pude enviar la invitación.');
        return;
      }
      setInvitacion(data);
      cargar(); cargarOnb();
    } finally { setInvitando(false); }
  };

  const reWriteback = async () => {
    const { data } = await supabase.rpc('onboarding_writeback', { p_client_id: client.id, p_force: false });
    if (!data?.ok) setErr(data?.warning || data?.error || 'No se pudo regenerar el documento.');
    else setErr('');
    cargarOnb();
  };
  const cargarPedidos = async () => {
    const [{ data: p }, { data: ev }] = await Promise.all([
      supabase.from('portal_pedidos').select('*').eq('client_id', client.id).eq('activo', true).order('orden'),
      supabase.from('portal_eventos').select('tipo,payload,created_at').eq('client_id', client.id).order('created_at', { ascending: false }).limit(5),
    ]);
    setPedidos(Array.isArray(p) ? p : []);
    setEventos(Array.isArray(ev) ? ev : []);
  };
  const cargarGrab = async () => {
    const { data } = await supabase.rpc('del_grab_resumen_cliente', { p_client_id: client.id });
    if (data?.ok) setGrab(data);
  };
  // El equipo aprueba (o desmarca) que un guión ya está grabado, tras verificarlo.
  const marcarGrabado = async (g, val) => {
    if (val && !window.confirm(`¿Confirmás que "${g.titulo}" ya está grabado y completo?`)) return;
    const { data } = await supabase.rpc('del_grab_marcar_grabado', { p_section_id: g.id, p_grabado: val });
    if (data?.ok) cargarGrab();
  };
  useEffect(() => { cargar(); cargarPedidos(); cargarOnb(); cargarCollab(); cargarGrab(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [client.id]);

  // ── Pedidos al cliente (lo que ve en "Lo que te falta" de su portal) ──
  const sembrar = async () => { await supabase.rpc('portal_pedidos_seed', { p_client: client.id }); cargarPedidos(); };
  const validarPedido = async (p) => {
    await supabase.from('portal_pedidos').update({ estado: 'validado', completado_at: new Date().toISOString() }).eq('id', p.id);
    cargarPedidos();
  };
  const quitarPedido = async (p) => {
    if (!window.confirm(`¿Quitar el pedido "${p.titulo}"? Deja de verse en el portal.`)) return;
    await supabase.from('portal_pedidos').update({ activo: false }).eq('id', p.id);
    cargarPedidos();
  };
  const crearPedido = async () => {
    const t = nuevo.titulo.trim();
    if (!t) return;
    await supabase.from('portal_pedidos').insert({
      client_id: client.id, tipo: 'otro', titulo: t,
      bucket_key: nuevo.bucket || null,
      target_count: nuevo.target ? parseInt(nuevo.target, 10) || null : null,
      bloqueante: !!nuevo.bloqueante, orden: 10, created_by: 'panel',
    });
    setNuevo({ titulo: '', bucket: 'autoridad', target: '', bloqueante: false });
    setNuevoOpen(false);
    cargarPedidos();
  };

  const activar = async () => {
    setBusy(true); setErr('');
    try {
      const { data, error } = await supabase.rpc('portal_admin_activar', { p_client_id: client.id, p_email: email.trim() || null });
      if (error || !data?.ok) { setErr(data?.detail || data?.error || error?.message || 'No pude crear el acceso.'); return; }
      setEstado(data);
    } finally { setBusy(false); }
  };

  const copiar = async (txt, key) => {
    try { await navigator.clipboard.writeText(txt); setCopied(key); setTimeout(() => setCopied(''), 1500); } catch { /* nada */ }
  };

  // Cuentas del cliente en sí (excluye las de colaboradores, que van en su propia sección).
  const cuentas = (estado?.cuentas || []).filter((c) => !String(c.notes || '').toLowerCase().startsWith('colaborador'));
  const rowStyle = { display: 'grid', gridTemplateColumns: '96px 1fr auto', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #F0F1F4' };
  const copyBtn = (txt, key) => (
    <button onClick={() => copiar(txt, key)} title="Copiar" className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[#E2E5EB] bg-white cursor-pointer text-[#6B7280] hover:bg-[#F4F6F9]">
      {copied === key ? <Check size={13} color="#16A34A" /> : <Copy size={13} />}
    </button>
  );

  return (
    <Modal open onClose={onClose} title={`Portal del cliente · ${client.name || ''}`} maxWidth={520}
      footer={
        <div className="flex items-center justify-between w-full gap-2">
          <a href={PORTAL_URL} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#2E69E0] no-underline hover:underline">
            <ExternalLink size={14} /> Abrir el portal
          </a>
          <button onClick={onClose} className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-[#6B7280] font-medium cursor-pointer hover:bg-[#F4F6F9]">Cerrar</button>
        </div>
      }>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2.5 rounded-xl p-3" style={{ background: '#EEF2FF', border: '1px solid #DDE5FB' }}>
          <Smartphone size={17} color="#5B7CF5" style={{ flexShrink: 0, marginTop: 1 }} />
          <div className="text-[12px] leading-relaxed text-[#3B4252]">
            Es la app donde el cliente ve sus funnels, graba los guiones y sube su material.
            Con el email y la contraseña de abajo podés <b>entrar a su cuenta</b> o pasárselos por WhatsApp.
          </div>
        </div>

        {err && <div className="text-[12.5px] font-semibold text-[#DC2626] bg-[#FEF2F2] rounded-lg py-2 px-3">{err}</div>}
        {!estado && !err && <div className="text-[12.5px] text-[#9CA3AF] py-4 text-center">Cargando…</div>}

        {estado && cuentas.length > 0 && (
          <div className="rounded-xl border border-[#E2E5EB] py-1 px-3.5">
            {cuentas.map((c) => (
              <div key={c.login_email}>
                <div style={rowStyle}>
                  <span className="text-[11.5px] text-[#6B7280]">Email</span>
                  <span className="text-[12.5px] font-semibold text-[#1A1D26] truncate">{c.login_email}</span>
                  {copyBtn(c.login_email, 'e:' + c.login_email)}
                </div>
                <div style={{ ...rowStyle, borderBottom: c.notes ? '1px solid #F0F1F4' : 'none' }}>
                  <span className="text-[11.5px] text-[#6B7280]">Contraseña</span>
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="text-[12.5px] font-semibold text-[#1A1D26] truncate" style={{ fontFamily: 'ui-monospace, monospace' }}>
                      {showPwd[c.login_email] ? (c.password || '—') : '••••••••'}
                    </span>
                    <button onClick={() => setShowPwd((p) => ({ ...p, [c.login_email]: !p[c.login_email] }))}
                      className="inline-flex items-center justify-center w-6 h-6 rounded-md border-none bg-transparent cursor-pointer text-[#9CA3AF] hover:text-[#1A1D26]">
                      {showPwd[c.login_email] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </span>
                  {copyBtn(c.password || '', 'p:' + c.login_email)}
                </div>
                {c.notes && <div className="text-[10.5px] text-[#AEB4BF] py-1.5">{c.notes}{c.enabled ? '' : ' · DESHABILITADA'}</div>}
              </div>
            ))}
          </div>
        )}

        {/* ── GRABACIONES: tracking de tiempos por estado + por guión ────── */}
        {grab && ((grab.guiones || []).length > 0 || (grab.recursosDiasSinSubir ?? 0) > 0) && (
          <div className="rounded-xl border border-[#E2E5EB] p-3.5 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <Film size={15} color="#5B7CF5" />
              <span className="text-[12.5px] font-bold text-[#1A1D26] flex-1">Grabaciones</span>
              {typeof grab.recursosDiasSinSubir === 'number' && grab.recursosDiasSinSubir > 3 && (
                <span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: '#FEF3C7', color: '#B45309' }}>
                  sin subir material hace {grab.recursosDiasSinSubir}d
                </span>
              )}
            </div>

            {/* Resumen por estado (cuántos + el más viejo) */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { k: 'revision', t: 'Esperando revisión', c: '#1D4FD8', b: '#EEF3FF' },
                { k: 'grabacion', t: 'Esperando grabación', c: '#15803D', b: '#DCFCE7' },
                { k: 'correccion', t: 'En corrección (Korex)', c: '#B45309', b: '#FEF6E7' },
              ].map((x) => {
                const r = grab.resumen?.[x.k];
                return (
                  <div key={x.k} className="rounded-lg p-2" style={{ background: x.b }}>
                    <div className="text-[18px] font-extrabold leading-none" style={{ color: x.c }}>{r?.n || 0}</div>
                    <div className="text-[9.5px] font-semibold mt-1 leading-tight" style={{ color: x.c }}>{x.t}</div>
                    {r?.n > 0 && <div className="text-[9px] mt-0.5" style={{ color: x.c, opacity: 0.8 }}>el más viejo: {r.dias}d</div>}
                  </div>
                );
              })}
            </div>

            {/* Por guión */}
            {(grab.guiones || []).length > 0 && (
              <div className="flex flex-col">
                {grab.guiones.map((g) => {
                  // Solo VSL y anuncios se graban. Una landing se aprueba y va a
                  // diseño: no le corresponde ni el estado ni el botón de grabado.
                  const grabable = g.kind === 'vsl' || g.kind === 'anuncios';
                  const est = { revision: { t: '👀 Revisión', c: '#1D4FD8' }, correccion: { t: '✏️ Corrección', c: '#B45309' }, grabacion: { t: '🎬 Grabación', c: '#15803D' }, grabado: { t: '✅ Grabado', c: '#15803D' }, aprobado: { t: '✅ Aprobado', c: '#15803D' } }[g.flujo] || { t: g.flujo, c: '#6B7280' };
                  return (
                    <div key={g.id} className="flex items-center gap-2 py-1.5 border-t border-[#F1F3F7]">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-extrabold text-white shrink-0" style={{ background: g.responsable?.color || '#5B7CF5' }} title={g.responsable?.nombre}>
                        {g.responsable?.iniciales || '·'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-[#1A1D26] truncate">{g.titulo}</div>
                        <div className="text-[10px] text-[#AEB4BF] truncate">{g.funnel || ''} · {g.responsable?.nombre}</div>
                      </div>
                      {/* Aprobación del equipo: en "Grabación" se puede marcar grabado;
                          en "Grabado" se puede deshacer. */}
                      {grabable && g.flujo === 'grabacion' ? (
                        <button onClick={() => marcarGrabado(g, true)} title="Marcar como grabado (ya verificado)"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-[#15803D] border border-[#BBF7D0] bg-white rounded-md py-1 px-1.5 cursor-pointer hover:bg-[#ECFDF5] shrink-0">
                          <BadgeCheck size={12} />Grabado
                        </button>
                      ) : grabable && g.flujo === 'grabado' ? (
                        <button onClick={() => marcarGrabado(g, false)} title="Deshacer (volver a grabación)"
                          className="inline-flex items-center gap-1 text-[10px] font-bold shrink-0 rounded-md py-1 px-1.5" style={{ background: '#DCFCE7', color: '#15803D' }}>
                          <BadgeCheck size={12} />Grabado
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold shrink-0" style={{ color: est.c }}>{est.t}</span>
                      )}
                      <span className="text-[10px] text-[#9CA3AF] shrink-0 tabular-nums w-8 text-right">{g.dias}d</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── COLABORADORES DEL CLIENTE: link auto-servicio + lista ───────── */}
        <div className="rounded-xl border border-[#E2E5EB] p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <Users size={15} color="#5B7CF5" />
            <span className="text-[12.5px] font-bold text-[#1A1D26] flex-1">Colaboradores del cliente</span>
            {collabs.length > 0 && <span className="text-[10.5px] text-[#AEB4BF]">{collabs.filter(c => c.enabled).length} con acceso</span>}
          </div>
          <div className="text-[11px] text-[#6B7280] leading-relaxed -mt-1">
            Compartí este enlace con el equipo del cliente (asistente, quien graba, etc.).
            Cada uno crea su cuenta y ve <b>lo mismo que el cliente</b>: onboarding, guiones y material.
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 flex-1 min-w-0 rounded-lg border border-[#E2E5EB] bg-[#F8FAFF] py-1.5 px-2.5">
              <Link2 size={13} className="text-[#9CA3AF] shrink-0" />
              <span className="text-[11.5px] text-[#4B5563] truncate" style={{ fontFamily: 'ui-monospace, monospace' }}>
                {collabUrl || 'Generando enlace…'}
              </span>
            </div>
            <button onClick={() => copiar(collabUrl, 'collab')} disabled={!collabUrl} title="Copiar enlace"
              className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[#C7D2FE] bg-white cursor-pointer text-[#2E69E0] hover:bg-[#F5F8FF] disabled:opacity-50 shrink-0">
              {copied === 'collab' ? <Check size={14} color="#16A34A" /> : <Copy size={14} />}
            </button>
            <button onClick={rotarCollab} disabled={!collabToken} title="Generar un enlace nuevo (invalida el anterior)"
              className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-[#E2E5EB] bg-white cursor-pointer text-[#9CA3AF] hover:text-[#1A1D26] disabled:opacity-50 shrink-0">
              <RefreshCw size={13} />
            </button>
          </div>

          {collabs.length > 0 && (
            <div className="flex flex-col">
              {collabs.map((c) => (
                <div key={c.id} className="flex items-center gap-2 py-1.5 border-t border-[#F1F3F7]">
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-[#1A1D26] truncate">
                      {c.full_name || c.email}
                      <span className="ml-1.5 text-[9px] font-bold uppercase text-[#5B7CF5] bg-[#EEF2FF] rounded px-1 py-px">{c.role || 'Otro'}</span>
                      {!c.enabled && <span className="ml-1.5 text-[9px] font-bold uppercase text-[#B45309] bg-[#FEF3C7] rounded px-1 py-px">sin acceso</span>}
                    </div>
                    <div className="text-[10px] text-[#AEB4BF] truncate">{c.email}{c.phone ? ` · ${c.phone}` : ''}</div>
                  </div>
                  <button onClick={() => toggleCollab(c)} title={c.enabled ? 'Quitar acceso' : 'Volver a dar acceso'}
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-md border bg-white cursor-pointer shrink-0 ${c.enabled ? 'border-[#E2E5EB] text-[#C3C9D4] hover:text-[#DC2626] hover:border-[#FECACA]' : 'border-[#BBF7D0] text-[#15803D] hover:bg-[#ECFDF5]'}`}>
                    <Power size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── ONBOARDING: invitación + avance ─────────────────────────────── */}
        <div className="rounded-xl border border-[#E2E5EB] p-3.5 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <ClipboardList size={15} color="#5B7CF5" />
            <span className="text-[12.5px] font-bold text-[#1A1D26] flex-1">Onboarding</span>
            {onbEstado?.existe && (
              <span className="text-[10px] font-bold rounded-full px-2 py-0.5"
                style={onbEstado.estado === 'completado'
                  ? { background: '#DCFCE7', color: '#15803D' }
                  : { background: '#DBEAFE', color: '#1D4FD8' }}>
                {onbEstado.estado === 'completado' ? 'Completado' : `${onbEstado.progreso}%`}
              </span>
            )}
          </div>

          {onbEstado?.existe ? (
            <>
              <div className="h-1.5 rounded-full bg-[#F0F2F5] overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${onbEstado.progreso || 0}%`, background: '#5B7CF5' }} />
              </div>
              <div className="text-[11px] text-[#6B7280] leading-relaxed">
                {onbEstado.respondidas} de {onbEstado.requeridas} respuestas
                {onbEstado.agenda?.at
                  ? ` · sesión el ${new Date(onbEstado.agenda.at).toLocaleDateString('es-AR')}`
                  : onbEstado.agenda?.estado === 'omitido'
                    ? ' · ⚠️ no agendó la sesión' : ' · sesión sin agendar'}
                {onbEstado.lastSeenAt && ` · última vez ${new Date(onbEstado.lastSeenAt).toLocaleDateString('es-AR')}`}
              </div>
              {/* Dónde se trabó, sin abrir la base. Un 34% no dice nada; "cerró
                  Arranque, va por la mitad de Estrategia" dice qué hacer. */}
              {Array.isArray(onbEstado.bloques) && onbEstado.bloques.length > 0 && (
                <div className="flex gap-1.5">
                  {onbEstado.bloques.map((b) => {
                    const pct = b.total > 0 ? Math.round((b.hechas / b.total) * 100) : 0;
                    return (
                      <div key={b.bkey} className="flex-1" title={`${b.corto}: ${b.hechas} de ${b.total}`}>
                        <div className="h-1 rounded-full bg-[#F0F2F5] overflow-hidden">
                          <div className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: pct === 100 ? '#22C55E' : '#5B7CF5' }} />
                        </div>
                        <div className="text-[9.5px] text-[#AEB4BF] mt-1 truncate">{b.corto}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              {onbEstado.writebackWarning && (
                <div className="text-[11px] text-[#B45309] bg-[#FEF3C7] rounded-lg py-1.5 px-2 leading-relaxed">
                  ⚠️ {onbEstado.writebackWarning}
                </div>
              )}
            </>
          ) : (
            <div className="text-[11.5px] text-[#AEB4BF]">
              Todavía no lo invitaste. Al invitarlo se le crea el acceso y se le manda el link por mail.
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => invitar(onbEstado?.invitadoAt ? 'reenvio' : 'alta')} disabled={invitando}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-white border-none rounded-md py-1.5 px-2.5 cursor-pointer disabled:opacity-60"
              style={{ background: '#2E69E0' }}>
              {invitando ? <RefreshCw size={12} className="animate-spin" /> : <Smartphone size={12} />}
              {onbEstado?.invitadoAt ? 'Reenviar acceso' : 'Invitar al onboarding'}
            </button>
            {onbEstado?.estado === 'completado' && (
              <button onClick={reWriteback}
                className="text-[11px] font-semibold text-[#6B7280] border border-[#E2E5EB] bg-white rounded-md py-1.5 px-2 cursor-pointer hover:bg-[#F4F6F9]">
                Regenerar el documento
              </button>
            )}
            {onbEstado?.inviteCount > 0 && (
              <span className="text-[10.5px] text-[#AEB4BF]">enviado {onbEstado.inviteCount}×</span>
            )}
          </div>

          {invitacion && (
            <div className="rounded-lg bg-[#F8FAFF] border border-[#DDE5FB] p-2.5 flex flex-col gap-2">
              <div className="text-[11.5px] font-semibold text-[#1D4FD8]">
                {invitacion.email_enviado ? 'Mail enviado.' : 'Acceso listo (el mail no salió).'}
                {' '}Copiá el mensaje y pegáselo por WhatsApp.
              </div>
              {(invitacion.warnings || []).map((w, i) => (
                <div key={i} className="text-[10.5px] text-[#B45309] leading-relaxed">⚠️ {w}</div>
              ))}
              <button onClick={() => copiar(invitacion.mensaje_whatsapp, 'wa')}
                className="inline-flex items-center justify-center gap-1.5 text-[11.5px] font-semibold border border-[#C7D2FE] bg-white text-[#2E69E0] rounded-md py-2 cursor-pointer hover:bg-[#F5F8FF]">
                {copied === 'wa' ? <Check size={13} color="#16A34A" /> : <Copy size={13} />}
                {copied === 'wa' ? 'Copiado' : 'Copiar mensaje de bienvenida'}
              </button>
            </div>
          )}
        </div>

        {/* ── PEDIDOS AL CLIENTE: lo que le aparece en "Lo que te falta" del portal ── */}
        <div className="rounded-xl border border-[#E2E5EB] p-3.5 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList size={15} color="#B45309" />
            <span className="text-[12.5px] font-bold text-[#1A1D26] flex-1">Pedidos al cliente</span>
            {pedidos !== null && pedidos.length === 0 && (
              <button onClick={sembrar} className="text-[11px] font-semibold text-[#2E69E0] border border-[#C7D2FE] bg-white rounded-md py-1 px-2 cursor-pointer hover:bg-[#F5F8FF]">Crear los estándar</button>
            )}
            <button onClick={() => setNuevoOpen(o => !o)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6B7280] border border-[#E2E5EB] bg-white rounded-md py-1 px-2 cursor-pointer hover:bg-[#F4F6F9]">
              <Plus size={12} />Pedido
            </button>
          </div>
          <div className="text-[10.5px] text-[#9CA3AF] -mt-1">Los pedidos de GRABAR salen solos de los guiones marcados “Para grabar” en el DEL.</div>

          {nuevoOpen && (
            <div className="rounded-lg border border-dashed border-[#C7D2FE] bg-[#F8FAFF] p-2.5 flex flex-col gap-2">
              <input value={nuevo.titulo} onChange={(e) => setNuevo(n => ({ ...n, titulo: e.target.value }))} placeholder='Ej.: "Sube 3 videos de testimonios"' autoFocus
                className="w-full border border-[#E2E5EB] rounded-lg py-1.5 px-2.5 text-[12px] outline-none" />
              <div className="flex items-center gap-2 flex-wrap">
                <select value={nuevo.bucket} onChange={(e) => setNuevo(n => ({ ...n, bucket: e.target.value }))} className="border border-[#E2E5EB] rounded-lg py-1.5 px-2 text-[11.5px] bg-white">
                  {BUCKETS_PEDIDO.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
                  <option value="">Sin carpeta (solo tarea)</option>
                </select>
                <input value={nuevo.target} onChange={(e) => setNuevo(n => ({ ...n, target: e.target.value.replace(/\D/g, '') }))} placeholder="Cant." title="Cantidad objetivo (ej. 5)" className="w-14 border border-[#E2E5EB] rounded-lg py-1.5 px-2 text-[11.5px] outline-none" />
                <label className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#B45309] cursor-pointer">
                  <input type="checkbox" checked={nuevo.bloqueante} onChange={(e) => setNuevo(n => ({ ...n, bloqueante: e.target.checked }))} />Nos frena
                </label>
                <button onClick={crearPedido} disabled={!nuevo.titulo.trim()} className="ml-auto py-1.5 px-3 rounded-lg border-none bg-[#2E69E0] text-white text-[11.5px] font-semibold cursor-pointer disabled:opacity-50">Crear</button>
              </div>
            </div>
          )}

          {pedidos === null ? (
            <div className="text-[11.5px] text-[#AEB4BF] py-1">Cargando…</div>
          ) : pedidos.length === 0 ? (
            <div className="text-[11.5px] text-[#AEB4BF] py-1">Sin pedidos. “Crear los estándar” arma los 3 de siempre (fotos, logo, acceso a Meta).</div>
          ) : pedidos.map(p => {
            const st = ESTADO_PEDIDO[p.estado] || ESTADO_PEDIDO.pendiente;
            return (
              <div key={p.id} className="flex items-center gap-2 py-1.5 border-t border-[#F1F3F7]">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-semibold text-[#1A1D26] truncate">
                    {p.titulo}{p.target_count ? <span className="text-[#9CA3AF] font-medium"> · objetivo {p.target_count}</span> : null}
                    {p.bloqueante && <span className="ml-1.5 text-[9px] font-extrabold uppercase text-[#B45309] bg-[#FEF3C7] rounded px-1 py-px">frena</span>}
                  </div>
                  <div className="text-[10px] text-[#AEB4BF]">pedido {new Date(p.pedido_at).toLocaleDateString('es-AR')}</div>
                </div>
                <span className="text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0" style={{ background: st.bg, color: st.c }}>{st.label}</span>
                {(p.estado === 'cliente_dice_listo' || p.estado === 'completo') && (
                  <button onClick={() => validarPedido(p)} title="Validar (queda como hecho)" className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[#BBF7D0] bg-white text-[#15803D] cursor-pointer hover:bg-[#ECFDF5]"><BadgeCheck size={14} /></button>
                )}
                <button onClick={() => quitarPedido(p)} title="Quitar del portal" className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[#E2E5EB] bg-white text-[#C3C9D4] cursor-pointer hover:text-[#DC2626] hover:border-[#FECACA]"><Trash2 size={13} /></button>
              </div>
            );
          })}

          {eventos.length > 0 && (
            <div className="mt-1 pt-2 border-t border-[#F1F3F7]">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#9CA3AF] mb-1"><Activity size={11} />Último del cliente en el portal</div>
              {eventos.map((ev, i) => (
                <div key={i} className="text-[11px] text-[#4B5563] py-0.5">
                  {EVENTO_LABEL[ev.tipo] || ev.tipo}
                  {ev.payload?.titulo ? ` · ${ev.payload.titulo}` : ev.payload?.title ? ` · ${ev.payload.title}` : ''}
                  <span className="text-[#C3C9D4]"> — {new Date(ev.created_at).toLocaleDateString('es-AR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {estado && cuentas.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#D0D5DD] p-4 flex flex-col gap-2.5">
            <div className="text-[12.5px] font-semibold text-[#4B5563]">Este cliente todavía no tiene cuenta del portal.</div>
            <label className="text-[11.5px] font-semibold text-[#6B7280]">
              Email del cliente (para su login)
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@gmail.com"
                className="w-full mt-1 border border-[#E2E5EB] rounded-lg py-2 px-3 text-[12.5px] outline-none" />
            </label>
            <button onClick={activar} disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-[9px] border-none text-white text-[12.5px] font-semibold cursor-pointer hover:brightness-95 disabled:opacity-60"
              style={{ background: '#2E69E0' }}>
              {busy ? <RefreshCw size={14} className="animate-spin" /> : <Smartphone size={14} />} Crear acceso al portal
            </button>
            <div className="text-[11px] text-[#9CA3AF] leading-relaxed">
              Le crea el usuario con una contraseña generada (la vas a ver acá mismo). No manda ningún email solo: se la pasás vos.
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
