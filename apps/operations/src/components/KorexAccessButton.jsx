// Botón de llave en la barra superior de Operaciones: accesos GENERALES de Método
// Korex (los que no pertenecen a un cliente). Reusa el diseño de tarjeta de acceso
// (usuario/contraseña con mostrar y copiar) que ya usamos en la ficha del cliente.
import { useState } from 'react';
import { Key, Plus, Pencil, ExternalLink } from 'lucide-react';
import { sbFetch } from '@korex/db';
import Modal from './Modal';
import { AccessFormModal, CredRow, openUrl } from './clientes/recursosShared';

export default function KorexAccessButton() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(null); // { initial, ref } | { initial: null }

  const load = async () => {
    setLoading(true);
    try {
      const rows = await sbFetch('korex_access?select=*&order=position.asc,label.asc');
      setItems(Array.isArray(rows) ? rows : []);
    } catch { setItems([]); } finally { setLoading(false); }
  };
  const openPanel = () => { setOpen(true); load(); };

  const save = async (data, ref) => {
    if (ref) {
      await sbFetch('korex_access?id=eq.' + encodeURIComponent(ref.id), {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(data), throwOnError: true,
      });
    } else {
      const row = { id: 'kax_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), ...data, position: items.length };
      await sbFetch('korex_access', {
        method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row), throwOnError: true,
      });
    }
    await load();
  };
  const remove = async (item) => {
    await sbFetch('korex_access?id=eq.' + encodeURIComponent(item.id), { method: 'DELETE' });
    await load();
  };

  return (
    <>
      <button onClick={openPanel} title="Accesos generales de Método Korex"
        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E5EB] bg-white text-[#6B7280] cursor-pointer shrink-0 hover:bg-[#F7F4FE] hover:border-[#E0D4FB] hover:text-[#7C3AED] max-md:w-8 max-md:h-8">
        <Key size={16} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Accesos generales · Método Korex" maxWidth={540}
        footer={
          <div className="flex items-center justify-between gap-2 w-full">
            <button onClick={() => setForm({ initial: null })} className="inline-flex items-center gap-1.5 text-[12.5px] py-2 px-3.5 rounded-lg border border-[#DCE3FF] bg-[#F5F7FF] text-[#2E69E0] font-semibold cursor-pointer hover:bg-[#EEF2FF]"><Plus size={14} />Agregar acceso</button>
            <button onClick={() => setOpen(false)} className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2">Cerrar</button>
          </div>
        }>
        <div className="flex flex-col gap-2.5 p-1">
          <div className="text-[11.5px] text-[#9CA3AF] -mt-1 mb-0.5">Accesos de la empresa que no pertenecen a un cliente (Meta Business, hosting, dominios, etc.).</div>
          {loading && <div className="text-[12.5px] text-[#AEB4BF] py-6 text-center">Cargando accesos…</div>}
          {!loading && items.length === 0 && (
            <div className="border border-dashed border-[#D0D5DD] rounded-xl text-center py-8 px-5">
              <div className="text-[13px] font-semibold mb-1" style={{ color: '#1A1D26' }}>Todavía no hay accesos</div>
              <div className="text-[11.5px] text-text2">Agregá el primero con “Agregar acceso”.</div>
            </div>
          )}
          {!loading && items.map(a => (
            <div key={a.id} className="border border-[#E8EBF0] rounded-xl bg-white overflow-hidden">
              <div className="flex items-center gap-2.5 py-2.5 px-3 border-b border-[#F0F2F5]">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: '#F4F1FE', color: '#7C3AED' }}><Key size={15} /></span>
                <div className="flex-1 min-w-0"><div className="text-[13.5px] font-bold truncate" style={{ color: '#1A1D26' }}>{a.label}</div>{a.notes && <div className="text-[11px] text-[#9CA3AF] truncate">{a.notes}</div>}</div>
                {a.url && <button onClick={() => openUrl(a.url)} title="Abrir sitio" className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[#E2E5EB] bg-white text-[#B0B6C0] cursor-pointer shrink-0 hover:bg-[#EEF2FF] hover:text-[#2E69E0]"><ExternalLink size={14} /></button>}
                <button onClick={() => setForm({ initial: a, ref: a })} title="Editar / borrar" className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[#E2E5EB] bg-white text-[#9CA3AF] cursor-pointer shrink-0 hover:bg-[#F7F4FE] hover:text-[#7C3AED]"><Pencil size={13} /></button>
              </div>
              <div className="py-2.5 px-3 flex flex-col gap-2">
                <CredRow label="Correo" value={a.email || a.username} />
                <CredRow label="Contraseña" value={a.password} mono masked />
                {!a.email && !a.password && <div className="text-[11.5px] text-[#AEB4BF]">Sin credenciales cargadas.</div>}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {form && <AccessFormModal open={!!form} onClose={() => setForm(null)} initial={form.initial} onSave={(data) => save(data, form.ref)} onDelete={form.ref ? () => remove(form.ref) : undefined} />}
    </>
  );
}
