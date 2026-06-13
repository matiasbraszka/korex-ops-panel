import { useState } from 'react';
import { CheckCircle2, Upload, User, MapPin, IdCard, Phone, Wallet, ShieldCheck, Lock } from 'lucide-react';
import { supabase } from '@korex/db';

const LOGO = 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38d8184c045c2748d55e8.png';

// Lee un archivo como dataURL (base64) para mandarlo a la edge function.
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const EMPTY = {
  name: '', role: '', gender: '', document_number: '', birth_date: '',
  address_street: '', address_city: '', address_zip: '', address_state: '', address_country: '',
  whatsapp: '', personal_email: '', emergency_contact: '', payment_info: '',
};

// Formulario público (sin login) de onboarding: cada persona que entra a Korex
// carga sus datos y sus dos fotos. Cae en staff_onboarding (staging) para que
// un admin lo convierta en ficha.
export default function OnboardingForm() {
  const [form, setForm] = useState(EMPTY);
  const [profilePhoto, setProfilePhoto] = useState(null);   // File
  const [documentPhoto, setDocumentPhoto] = useState(null); // File
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError('');
    if (form.name.trim().length < 2) { setError('Escribí tu nombre completo.'); return; }
    setSaving(true);
    try {
      const body = { ...form };
      if (profilePhoto) body.profile_photo = await fileToDataUrl(profilePhoto);
      if (documentPhoto) body.document_photo = await fileToDataUrl(documentPhoto);

      const { data, error: fnErr } = await supabase.functions.invoke('staff-onboarding', { body });
      if (fnErr || data?.error) {
        const code = data?.error || fnErr?.message;
        setError(code === 'file_too_large'
          ? 'Alguna foto pesa más de 8 MB. Subí una más liviana.'
          : 'No se pudo enviar. Revisá los datos e intentá de nuevo.');
        setSaving(false);
        return;
      }
      setDone(true);
    } catch (e) {
      console.error(e);
      setError('No se pudo enviar. Intentá de nuevo.');
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="w-full max-w-[460px] bg-white border border-border rounded-2xl shadow-sm p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-green-bg flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={30} className="text-green-600" />
          </div>
          <h1 className="text-[18px] font-bold text-text mb-1.5">¡Listo, {form.name.split(' ')[0]}!</h1>
          <p className="text-[13px] text-text2">
            Recibimos tus datos. El equipo de Korex los va a revisar y queda todo registrado. ¡Bienvenido/a!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center p-4 py-8">
      <div className="w-full max-w-[560px]">
        <div className="text-center mb-6">
          <img src={LOGO} alt="Método Korex" className="h-[40px] w-auto mx-auto mb-4" />
          <h1 className="text-[20px] font-bold text-text">Onboarding del equipo</h1>
          <p className="text-[13px] text-text2 mt-1">
            Completá tus datos para sumarte a Korex.
          </p>
        </div>

        {/* Cartel de confianza: explica en simple cómo se protegen los datos. */}
        <div className="bg-green-bg/60 border border-green-600/25 rounded-2xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={17} className="text-green-700 shrink-0" />
            <span className="text-[13.5px] font-bold text-green-900">Tus datos están protegidos</span>
          </div>
          <ul className="space-y-1.5 text-[12px] text-text2">
            <li className="flex items-start gap-2">
              <Lock size={13} className="text-green-700 mt-0.5 shrink-0" />
              Viajan por una conexión segura y encriptada (el candado 🔒 de tu navegador).
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-700 mt-px">•</span>
              Solo el equipo de administración de Korex puede verlos.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-700 mt-px">•</span>
              Se usan únicamente para tu legajo, tus pagos y tu contacto.
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-700 mt-px">•</span>
              Tu documento y tu información no se comparten con nadie más.
            </li>
          </ul>
        </div>

        <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden">
          {/* Datos personales */}
          <Section icon={User} title="Datos personales">
            <Field label="Nombre completo *">
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Juan Pérez" className={inp} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rol / puesto">
                <input value={form.role} onChange={(e) => set('role', e.target.value)} placeholder="Diseñador, Closer…" className={inp} />
              </Field>
              <Field label="Género">
                <select value={form.gender} onChange={(e) => set('gender', e.target.value)} className={inp}>
                  <option value="">Elegir…</option>
                  <option>Femenino</option>
                  <option>Masculino</option>
                  <option>Otro</option>
                  <option>Prefiero no decir</option>
                </select>
              </Field>
            </div>
            <Field label="Fecha de nacimiento">
              <input type="date" value={form.birth_date} onChange={(e) => set('birth_date', e.target.value)} className={inp} />
            </Field>
            <Field label="Foto de perfil">
              <FileInput file={profilePhoto} onChange={setProfilePhoto} accept="image/*" hint="Una foto tuya, tipo carnet." />
            </Field>
          </Section>

          {/* Documento */}
          <Section icon={IdCard} title="Documento de identidad">
            <Field label="Número de documento">
              <input value={form.document_number} onChange={(e) => set('document_number', e.target.value)} placeholder="DNI / Pasaporte" className={inp} />
            </Field>
            <Field label="Foto del documento">
              <FileInput file={documentPhoto} onChange={setDocumentPhoto} accept="image/*,application/pdf" hint="Frente del documento (foto o PDF)." />
            </Field>
          </Section>

          {/* Dirección */}
          <Section icon={MapPin} title="Dirección">
            <Field label="Calle y número">
              <input value={form.address_street} onChange={(e) => set('address_street', e.target.value)} placeholder="Av. Siempre Viva 742" className={inp} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ciudad">
                <input value={form.address_city} onChange={(e) => set('address_city', e.target.value)} className={inp} />
              </Field>
              <Field label="Código postal">
                <input value={form.address_zip} onChange={(e) => set('address_zip', e.target.value)} className={inp} />
              </Field>
              <Field label="Provincia / Estado">
                <input value={form.address_state} onChange={(e) => set('address_state', e.target.value)} className={inp} />
              </Field>
              <Field label="País">
                <input value={form.address_country} onChange={(e) => set('address_country', e.target.value)} className={inp} />
              </Field>
            </div>
          </Section>

          {/* Contacto */}
          <Section icon={Phone} title="Contacto">
            <div className="grid grid-cols-2 gap-3">
              <Field label="WhatsApp">
                <input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+54 9 11 …" className={inp} />
              </Field>
              <Field label="Mail personal">
                <input type="email" value={form.personal_email} onChange={(e) => set('personal_email', e.target.value)} placeholder="vos@email.com" className={inp} />
              </Field>
            </div>
            <Field label="Contacto de emergencia">
              <input value={form.emergency_contact} onChange={(e) => set('emergency_contact', e.target.value)} placeholder="Nombre, vínculo y teléfono" className={inp} />
            </Field>
          </Section>

          {/* Pago */}
          <Section icon={Wallet} title="Datos para el pago">
            <Field label="¿Cómo te pagamos?">
              <textarea value={form.payment_info} onChange={(e) => set('payment_info', e.target.value)} rows={3}
                        placeholder="CBU / Alias / cuenta bancaria, PayPal, Wise, cripto… lo que uses para cobrar."
                        className={inp + ' resize-y'} />
            </Field>
          </Section>

          <div className="p-5 border-t border-border">
            {error && <div className="bg-red-bg border border-red/30 text-red text-[12.5px] rounded-lg p-3 mb-3">{error}</div>}
            <button onClick={submit} disabled={saving}
                    className="w-full py-3 rounded-xl bg-blue text-white text-[15px] font-bold hover:bg-blue-dark disabled:opacity-60 cursor-pointer shadow-sm">
              {saving ? 'Enviando…' : 'Enviar mis datos'}
            </button>
          </div>
        </div>

        <div className="text-center text-[11px] text-text3 mt-6 flex items-center justify-center gap-1.5">
          <Lock size={11} /> Información confidencial · Método Korex
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="p-5 border-b border-border space-y-3">
      <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-text3">
        <Icon size={14} /> {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-text mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function FileInput({ file, onChange, accept, hint }) {
  return (
    <div>
      <label className="flex items-center gap-2 border border-dashed border-border rounded-lg px-3 py-2.5 cursor-pointer hover:border-blue text-[13px] text-text2">
        <Upload size={15} className="text-text3 shrink-0" />
        <span className="truncate">{file ? file.name : 'Tocá para subir una foto'}</span>
        <input type="file" accept={accept} className="hidden"
               onChange={(e) => onChange(e.target.files?.[0] || null)} />
      </label>
      {hint && <p className="text-[10.5px] text-text3 mt-1">{hint}</p>}
    </div>
  );
}

const inp = 'w-full text-[14px] border border-border rounded-lg px-3 py-2.5 outline-none focus:border-blue bg-white';
