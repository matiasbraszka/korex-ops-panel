// Portal del cliente — acceso desde la ficha del cliente en operaciones.
// Muestra la cuenta del portal (email + contraseña generada) para pasársela al
// cliente o entrar a su cuenta, y permite crearla si todavía no existe.
// Backend: RPCs portal_admin_estado / portal_admin_activar (solo equipo).
import { useEffect, useState } from 'react';
import { supabase } from '@korex/db';
import { Smartphone, Copy, Check, ExternalLink, RefreshCw, Eye, EyeOff } from 'lucide-react';
import Modal from '../Modal';

// URL pública del portal. Configurable por env; fallback al dominio previsto.
const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://cliente.metodokorex.com';

export default function PortalClienteModal({ client, onClose }) {
  const [estado, setEstado] = useState(null);   // respuesta de portal_admin_estado
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [showPwd, setShowPwd] = useState({});   // login_email -> bool
  const [copied, setCopied] = useState('');     // qué se copió (feedback)

  const cargar = async () => {
    setErr('');
    const { data, error } = await supabase.rpc('portal_admin_estado', { p_client_id: client.id });
    if (error || !data?.ok) { setErr(data?.error || error?.message || 'No pude leer el estado.'); return; }
    setEstado(data);
    if (!email) setEmail(data.person?.email || data.client?.email || '');
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [client.id]);

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

  const cuentas = estado?.cuentas || [];
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
