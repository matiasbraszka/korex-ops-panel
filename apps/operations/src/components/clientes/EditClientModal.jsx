import { useState, useEffect } from 'react';
import Modal from '../Modal';
import { User, Briefcase, CreditCard, Handshake, FileText, Scale } from 'lucide-react';

const CYCLE_OPTIONS = [
  ['mensual', 'Mensual'], ['trimestral', 'Trimestral'], ['semestral', 'Semestral'],
  ['anual', 'Anual'], ['unico', 'Pago único'],
];
const PAYMENT_METHODS = ['Stripe', 'Transferencia', 'PayPal', 'Mercury', 'Efectivo', 'Otro'];
const BILLING_STATUS = {
  al_dia:    { bg: '#ECFDF5', fg: '#16A34A', label: 'Al día' },
  pendiente: { bg: '#FEFCE8', fg: '#CA8A04', label: 'Pendiente' },
  impago:    { bg: '#FEF2F2', fg: '#EF4444', label: 'Impago' },
};

function Section({ icon: Icon, title, desc, children }) {
  return (
    <div className="mb-5">
      <div className="flex items-start gap-3 mb-3 pb-2 border-b border-[#F0F2F5]">
        <span className="w-8 h-8 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: '#EEF2FF' }}>
          <Icon size={15} className="text-blue" />
        </span>
        <div>
          <div className="text-[13px] font-bold" style={{ color: '#1A1D26' }}>{title}</div>
          {desc && <div className="text-[11px]" style={{ color: '#9CA3AF' }}>{desc}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11.5px] font-semibold inline-flex items-center gap-1" style={{ color: '#1A1D26' }}>
        {label}{required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <span className="text-[10.5px]" style={{ color: '#9CA3AF' }}>{hint}</span>}
    </div>
  );
}

const inputClass = 'text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue focus:ring focus:ring-blue-bg bg-white';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function EditClientModal({ open, onClose, client, updateClient, createClient, onCreated, existingClients = [], getAllPriorityLabels }) {
  // Mismo formulario para crear y editar. Si no llega `client`, es modo "nuevo".
  const isCreate = !client;
  const [form, setForm] = useState({});
  useEffect(() => {
    if (!open) return;
    const c = client || {};
    setForm({
      name: c.name || '',
      company: c.company || '',
      niche: c.niche || '',
      teamName: c.teamName || '',
      email: c.email || '',
      phone: c.phone || '',
      country: c.country || '',
      tier: c.tier || 'starter',
      avatarUrl: c.avatarUrl || '',
      slackChannel: c.slackChannel || '',
      service: c.service || (isCreate ? 'Funnel completo + Ads' : ''),
      startDate: c.startDate || (isCreate ? todayStr() : ''),
      priority: c.priority || 5,
      status: c.status || 'active',
      billingAmount: c.billingAmount ?? '',
      billingCurrency: c.billingCurrency || 'EUR',
      billingCycle: c.billingCycle || 'mensual',
      billingInstallments: c.billingInstallments || 1,
      nextChargeDate: c.nextChargeDate || '',
      paymentMethod: c.paymentMethod || '',
      billingStatus: c.billingStatus || 'al_dia',
      conector: c.conector || '',
      closer: c.closer || '',
      contractData: c.contractData || '',
      driveFolderUrl: c.driveFolderUrl || '',
      notes: c.notes || '',
    });
  }, [open, client, isCreate]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.name.trim() || !form.company.trim()) {
      alert('Nombre y empresa son obligatorios');
      return;
    }
    if (isCreate) {
      // Evitar duplicados: avisar si ya existe un cliente con el mismo nombre.
      const dup = (existingClients || []).some(c => (c.name || '').trim().toLowerCase() === form.name.trim().toLowerCase());
      if (dup && !window.confirm(`Ya existe un cliente llamado "${form.name.trim()}". ¿Crear otro igual de todas formas?`)) {
        return;
      }
      const created = createClient(form.name.trim(), form.company.trim(), form.service.trim(), form.startDate || todayStr(), '', {
        niche: form.niche.trim(),
        teamName: form.teamName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        country: form.country.trim(),
        tier: form.tier || 'starter',
        avatarUrl: form.avatarUrl.trim(),
        slackChannel: form.slackChannel.trim(),
        priority: Number(form.priority) || 5,
        status: form.status,
        billingAmount: form.billingAmount === '' ? null : Number(form.billingAmount),
        billingCurrency: form.billingCurrency,
        billingCycle: form.billingCycle,
        billingInstallments: Number(form.billingInstallments) || 1,
        nextChargeDate: form.nextChargeDate || null,
        paymentMethod: form.paymentMethod || null,
        billingStatus: form.billingStatus,
        conector: form.conector.trim(),
        closer: form.closer.trim(),
        contractData: form.contractData.trim(),
        driveFolderUrl: form.driveFolderUrl.trim(),
        notes: form.notes,
      });
      onClose();
      // Abrir la ficha del cliente recién creado para que no "se pierda" en la
      // lista (los clientes nuevos van al grupo NUEVOS, al final del listado).
      if (created?.id) onCreated?.(created);
      return;
    }
    updateClient(client.id, {
      name: form.name.trim(),
      company: form.company.trim(),
      niche: form.niche.trim() || null,
      teamName: form.teamName.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim(),
      country: form.country.trim() || null,
      tier: form.tier || 'starter',
      avatarUrl: form.avatarUrl.trim(),
      slackChannel: form.slackChannel.trim(),
      service: form.service.trim(),
      startDate: form.startDate || null,
      priority: Number(form.priority) || 5,
      status: form.status,
      billingAmount: form.billingAmount === '' ? null : Number(form.billingAmount),
      billingCurrency: form.billingCurrency,
      billingCycle: form.billingCycle,
      billingInstallments: Number(form.billingInstallments) || 1,
      nextChargeDate: form.nextChargeDate || null,
      paymentMethod: form.paymentMethod || null,
      billingStatus: form.billingStatus,
      conector: form.conector.trim() || null,
      closer: form.closer.trim() || null,
      contractData: form.contractData.trim() || null,
      driveFolderUrl: form.driveFolderUrl.trim() || null,
      notes: form.notes,
    });
    onClose();
  };

  if (!open) return null;
  const priorityLabels = getAllPriorityLabels ? getAllPriorityLabels() : {};
  // Ordenar por rango configurado (`order`) con fallback al número de slot.
  const priorityEntries = Object.entries(priorityLabels)
    .filter(([, v]) => v)
    .sort((a, b) => ((a[1].order ?? Number(a[0])) - (b[1].order ?? Number(b[0]))));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isCreate ? 'Nuevo cliente' : `Editar cliente · ${client.name}`}
      maxWidth={740}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-[11px]" style={{ color: '#9CA3AF' }}>Los campos con <span className="text-red-500">*</span> son obligatorios</span>
          <div className="flex gap-2">
            <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
            <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark" onClick={handleSave}>{isCreate ? 'Crear cliente' : 'Guardar cambios'}</button>
          </div>
        </div>
      }
    >
      <div className="p-1">
        {/* 1. Datos del cliente */}
        <Section icon={User} title="Datos del cliente" desc="Información básica de contacto y perfil">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <Field label="Nombre completo" required>
              <input type="text" value={form.name || ''} onChange={e => set('name', e.target.value)} className={inputClass} placeholder="Sergio Cánovas" />
            </Field>
            <Field label="Empresa MLM" required>
              <input type="text" value={form.company || ''} onChange={e => set('company', e.target.value)} className={inputClass} placeholder="Farmasi, InCruises, Vida Divina…" />
            </Field>
            <Field label="Nicho / sector">
              <input type="text" value={form.niche || ''} onChange={e => set('niche', e.target.value)} className={inputClass} placeholder="Salud, Finanzas, Network Marketing…" />
            </Field>
            <Field label="Nombre de equipo">
              <input type="text" value={form.teamName || ''} onChange={e => set('teamName', e.target.value)} className={inputClass} placeholder="Ej. Los Imparables (opcional)" />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} className={inputClass} placeholder="cliente@empresa.com" />
            </Field>
            <Field label="Teléfono / WhatsApp">
              <input type="tel" value={form.phone || ''} onChange={e => set('phone', e.target.value)} className={inputClass} placeholder="+34 600 000 000" />
            </Field>
            <Field label="País">
              <input type="text" value={form.country || ''} onChange={e => set('country', e.target.value)} className={inputClass} placeholder="España, México, Argentina…" />
            </Field>
            <Field label="Canal de Slack">
              <input type="text" value={form.slackChannel || ''} onChange={e => set('slackChannel', e.target.value)} className={inputClass} placeholder="nombre-del-canal" />
            </Field>
            <Field label="Nivel">
              <div className="flex gap-2">
                {[
                  { k: 'starter', label: 'Starter', color: '#6B7280', bg: '#F3F4F6' },
                  { k: 'partner', label: 'Partner', color: '#5B7CF5', bg: '#EEF2FF' },
                ].map(opt => (
                  <button key={opt.k} type="button"
                    className={`flex-1 text-[11.5px] py-2 px-3 rounded-lg cursor-pointer font-semibold border ${form.tier === opt.k ? 'border-2' : 'bg-white'}`}
                    style={form.tier === opt.k ? { borderColor: opt.color, background: opt.bg, color: opt.color } : { borderColor: '#E2E5EB', color: '#6B7280' }}
                    onClick={() => set('tier', opt.k)}
                  >{opt.label}</button>
                ))}
              </div>
            </Field>
            <Field label="Foto de perfil (URL)" hint="Pegá la URL de la imagen. Si está vacío, se usan las iniciales.">
              <input type="url" value={form.avatarUrl || ''} onChange={e => set('avatarUrl', e.target.value)} className={inputClass} placeholder="https://..." />
            </Field>
          </div>
        </Section>

        {/* 2. Servicio & seguimiento */}
        <Section icon={Briefcase} title="Servicio y seguimiento" desc="Tipo de proyecto y prioridad">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <Field label="Servicio" required>
              <input type="text" value={form.service || ''} onChange={e => set('service', e.target.value)} className={inputClass} placeholder="Funnel + Ads, Solo Ads…" />
            </Field>
            <Field label="Fecha de ingreso" required>
              <input type="date" value={form.startDate || ''} onChange={e => set('startDate', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Estado del proyecto">
              <select value={form.status} onChange={e => set('status', e.target.value)} className={inputClass}>
                <option value="active">Activo</option>
                <option value="paused">Pausado</option>
                <option value="completed">Completado</option>
              </select>
            </Field>
            <Field label="Prioridad">
              <div className="flex flex-wrap gap-1.5">
                {priorityEntries.map(([k, v]) => (
                  <button key={k} type="button"
                    className={`text-[11.5px] py-1.5 px-2.5 rounded-lg cursor-pointer font-medium inline-flex items-center gap-1 border ${Number(form.priority) === Number(k) ? 'border-2' : 'bg-white'}`}
                    style={Number(form.priority) === Number(k) ? { borderColor: v.color, background: v.color + '15', color: v.color } : { borderColor: '#E2E5EB', color: '#6B7280' }}
                    onClick={() => set('priority', Number(k))}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: v.color }} />{v.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Carpeta de Drive (link)" hint="Se crea sola al cargar la venta. Si falta o cambió, pegá acá el link de la carpeta del cliente — de ahí el panel sincroniza el árbol todos los días.">
              <input type="url" value={form.driveFolderUrl || ''} onChange={e => set('driveFolderUrl', e.target.value)} className={inputClass} placeholder="https://drive.google.com/drive/folders/..." />
            </Field>
          </div>
        </Section>

        {/* 3. Facturación */}
        <Section icon={CreditCard} title="Facturación" desc="Importe, ciclo y estado de cobros">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <Field label="Importe">
              <div className="flex gap-1.5">
                <select value={form.billingCurrency} onChange={e => set('billingCurrency', e.target.value)} className={inputClass + ' w-20'}>
                  <option value="EUR">€</option><option value="USD">$</option><option value="ARS">AR$</option><option value="MXN">MX$</option>
                </select>
                <input type="number" step="0.01" value={form.billingAmount} onChange={e => set('billingAmount', e.target.value)} className={inputClass + ' flex-1'} placeholder="1500" />
              </div>
            </Field>
            <Field label="Ciclo">
              <select value={form.billingCycle} onChange={e => set('billingCycle', e.target.value)} className={inputClass}>
                {CYCLE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Cuotas">
              <input type="number" min="1" value={form.billingInstallments} onChange={e => set('billingInstallments', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Próximo cobro">
              <input type="date" value={form.nextChargeDate || ''} onChange={e => set('nextChargeDate', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Método de pago">
              <select value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)} className={inputClass}>
                <option value="">—</option>
                {PAYMENT_METHODS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Estado de cobros">
              <div className="flex gap-1.5">
                {Object.entries(BILLING_STATUS).map(([k, v]) => (
                  <button key={k} type="button"
                    className={`text-[11.5px] py-1.5 px-3 rounded-lg border cursor-pointer font-medium ${form.billingStatus === k ? 'border-2' : 'bg-white'}`}
                    style={form.billingStatus === k ? { borderColor: v.fg, background: v.bg, color: v.fg } : { borderColor: '#E2E5EB', color: '#6B7280' }}
                    onClick={() => set('billingStatus', k)}
                  >{v.label}</button>
                ))}
              </div>
            </Field>
          </div>
        </Section>

        {/* 4. Equipo asignado */}
        <Section icon={Handshake} title="Equipo asignado" desc="Quién originó la oportunidad y quién cerró la venta">
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <Field label="Conector" hint="Persona o partner que conectó al cliente con Korex">
              <input type="text" value={form.conector || ''} onChange={e => set('conector', e.target.value)} className={inputClass} placeholder="Nombre del conector" />
            </Field>
            <Field label="Closer" hint="Persona que cerró la venta">
              <input type="text" value={form.closer || ''} onChange={e => set('closer', e.target.value)} className={inputClass} placeholder="Nombre del closer" />
            </Field>
          </div>
        </Section>

        {/* 5. Datos para el contrato */}
        <Section icon={Scale} title="Datos para el contrato" desc="Razón social, NIF/RFC, dirección fiscal, etc. — info que copiamos al armar el contrato">
          <textarea value={form.contractData || ''} onChange={e => set('contractData', e.target.value)} className={inputClass + ' w-full resize-y min-h-[110px] leading-relaxed font-mono text-[12.5px]'} placeholder={`Razón social: ...\nNIF / RFC / CUIT: ...\nDirección fiscal: ...\nRepresentante legal: ...`} />
        </Section>

        {/* 5. Notas internas */}
        <Section icon={FileText} title="Notas internas" desc="Visible sólo para el equipo, no para el cliente">
          <textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} className={inputClass + ' w-full resize-y min-h-[100px] leading-relaxed'} placeholder="Cualquier observación interna que no querés perder…" />
        </Section>
      </div>
    </Modal>
  );
}
