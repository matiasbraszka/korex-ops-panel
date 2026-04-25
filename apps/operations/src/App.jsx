import { useState, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Users, ClipboardList, Settings as SettingsIcon, Play, Phone, Shield } from 'lucide-react';
import { useAuth, useCan, signIn, sendPasswordReset } from '@korex/auth';
import { salesNavItems } from '@korex/sales';
import { useApp } from './context/AppContext';
import ClientsPage from './pages/ClientsPage';
import TareasPage from './pages/TareasPage';
import PublicidadPage from './pages/PublicidadPage';
import DashboardPage from './pages/DashboardPage';
import FeedbackPage from './pages/FeedbackPage';
import SettingsPage from './pages/SettingsPage';
import VideosPage from './pages/VideosPage';
import LlamadasPage from './pages/LlamadasPage';
import SearchBar from './components/SearchBar';
import Modal from './components/Modal';
import { today } from './utils/helpers';

// Lazy-load del modulo Ventas: el chunk se baja solo si el usuario entra.
const SalesRoutes = lazy(() =>
  import('@korex/sales').then((m) => ({ default: m.SalesRoutes }))
);

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResetMsg('');
    setSubmitting(true);
    const { error: authError } = await signIn(email.trim().toLowerCase(), password);
    setSubmitting(false);
    if (authError) {
      setError('Email o contraseña incorrectos');
      setPassword('');
    }
  };

  const handleReset = async () => {
    setResetMsg('');
    if (!email.trim()) { setError('Ingresá tu email primero'); return; }
    setError('');
    const { error: resetError } = await sendPasswordReset(email.trim().toLowerCase());
    if (resetError) setError('No se pudo enviar el email de reseteo');
    else setResetMsg('Te mandamos un email con un link para resetear la contraseña.');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="w-full max-w-[380px] px-8">
        <div className="text-center mb-10">
          <img src="https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38d8184c045c2748d55e8.png" alt="Método Korex" className="h-[48px] w-auto mx-auto" />
        </div>
        <form onSubmit={handleSubmit}>
          <label className="block text-[13px] font-semibold text-text mb-2">Correo electrónico</label>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-blue-bg2 border border-border rounded-xl py-3.5 px-4 text-text text-sm font-sans mb-5 outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]"
            placeholder="usuario@email.com"
            autoFocus
            required
          />
          <label className="block text-[13px] font-semibold text-text mb-2">Contraseña</label>
          <input
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-blue-bg2 border border-border rounded-xl py-3.5 px-4 text-text text-sm font-sans mb-5 outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]"
            placeholder={'••••••••••'}
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 bg-blue text-white border-none rounded-xl text-[15px] font-semibold font-sans cursor-pointer mt-1 hover:bg-blue-dark disabled:opacity-60"
          >
            {submitting ? 'Entrando...' : 'Iniciar sesión'}
          </button>
          {error && <div className="text-red text-xs text-center mt-3.5">{error}</div>}
          {resetMsg && <div className="text-green-600 text-xs text-center mt-3.5">{resetMsg}</div>}
        </form>
        <div className="text-center mt-6">
          <button type="button" onClick={handleReset} className="text-blue text-[13px] no-underline bg-transparent border-0 cursor-pointer">
            {'¿'}Olvidaste tu contraseña?
          </button>
        </div>
        <div className="text-center mt-10 text-xs text-text3">
          Política de Privacidad &middot; Términos y Condiciones
        </div>
      </div>
    </div>
  );
}

function AccountPending({ email }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="w-full max-w-[440px] px-8 text-center">
        <h1 className="text-lg font-bold text-text mb-3">Cuenta sin acceso</h1>
        <p className="text-sm text-text2 mb-6">
          Tu email ({email}) está autenticado pero todavía no está vinculado a ningún
          perfil del equipo ni tiene roles asignados. Contactá a un administrador
          para que complete la configuración de tu cuenta.
        </p>
      </div>
    </div>
  );
}

function MainLayout() {
  const { view, setSelectedId, currentUser, doLogout, syncStatus, tasks, createClient: ctxCreateClient, appSettings, loomVideos } = useApp();
  const navigate = useNavigate();
  const [newClientModal, setNewClientModal] = useState(false);
  const services = appSettings?.services && appSettings.services.length > 0
    ? appSettings.services
    : ['Funnel completo + Ads'];
  const [ncForm, setNcForm] = useState({ firstName: '', lastName: '', company: '', phone: '', slackChannel: '', service: services[0], avatarUrl: '' });

  // Contar videos no vistos para badge
  const seenKey = `loom_seen_${currentUser?.id || 'anon'}`;
  const seenVideos = (() => { try { return JSON.parse(localStorage.getItem(seenKey) || '[]'); } catch { return []; } })();
  const unseenVideoCount = (loomVideos || []).filter(v => !seenVideos.includes(v.id)).length;

  const canAccessSettings = currentUser?.isAdmin || currentUser?.canAccessSettings === true;
  const canAccessOperations = useCan('operations', 'read');
  const canAccessSales = useCan('sales', 'read');
  const location = useLocation();

  // Menu organizado por macro pestaña (area). Cada seccion se esconde si
  // el usuario no tiene permiso de lectura sobre el modulo.
  const opsItems = [
    { id: 'clients',   label: 'Clientes',      Icon: Users,          path: '/operations/clients' },
    { id: 'tasks',     label: 'Tareas',        Icon: ClipboardList,  path: '/operations/tasks' },
    { id: 'llamadas',  label: 'Llamadas',      Icon: Phone,          path: '/operations/llamadas' },
    { id: 'videos',    label: 'Tutoriales',    Icon: Play,           path: '/operations/videos' },
  ];
  const salesItems = salesNavItems;
  const adminItems = [
    { id: 'settings', label: 'Configuración', Icon: SettingsIcon, path: '/admin/settings' },
  ];
  const sections = [
    canAccessOperations && { id: 'operations', label: 'Operaciones', items: opsItems },
    canAccessSales      && { id: 'sales',      label: 'Ventas',      items: salesItems },
    currentUser?.isAdmin && { id: 'admin',     label: 'Administración', items: adminItems },
  ].filter(Boolean);

  const urgentCount = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length;
  const activeModule = location.pathname.split('/').filter(Boolean)[0] || 'operations';
  const mobileItems = (sections.find(s => s.id === activeModule) || sections[0] || { items: [] }).items;

  const switchTo = (path) => {
    setSelectedId(null);
    navigate(path);
  };

  const titles = {
    dashboard: ['Dashboard', 'Panel ejecutivo de operaciones'],
    clients: ['Clientes', 'Perfiles, ads, feedback y recursos'],
    publicidad: ['Publicidad', 'Métricas de Meta Ads por cliente'],
    tasks: ['Tareas', 'Roadmap, Timeline y Lista unificados'],
    llamadas: ['Llamadas', 'Registro de llamadas procesadas por IA'],
    videos: ['Tutoriales', 'Videos de Loom para el equipo'],
    feedback: ['Feedback', 'Feedback de todos los clientes'],
    settings: ['Configuración', 'Plantilla, equipo, servicios y prioridades'],
  };

  const [title, subtitle] = titles[view] || ['', ''];

  const handleCreateClient = () => {
    if (!ncForm.firstName.trim() || !ncForm.lastName.trim() || !ncForm.company.trim()) { alert('Completa nombre, apellido y empresa.'); return; }
    const fullName = ncForm.firstName.trim() + ' ' + ncForm.lastName.trim();
    ctxCreateClient(fullName, ncForm.company.trim(), ncForm.service.trim(), today(), '', {
      phone: ncForm.phone.trim(),
      slackChannel: ncForm.slackChannel.trim(),
      avatarUrl: ncForm.avatarUrl.trim(),
    });
    setNewClientModal(false);
    setNcForm({ firstName: '', lastName: '', company: '', phone: '', slackChannel: '', service: 'Funnel completo + Ads', avatarUrl: '' });
  };

  // Rutas del modulo Operaciones bajo el prefix /operations. El shell a
  // futuro (Fase 1+) va a agregar mas prefixes como /sales.
  const routes = (
    <Routes>
      <Route path="/" element={<Navigate to="/operations/clients" replace />} />
      <Route path="/operations" element={<Navigate to="/operations/clients" replace />} />
      <Route path="/operations/clients" element={<ClientsPage />} />
      <Route path="/operations/tasks" element={<TareasPage />} />
      <Route path="/operations/llamadas" element={<LlamadasPage />} />
      <Route path="/operations/videos" element={<VideosPage />} />
      <Route path="/operations/publicidad" element={<PublicidadPage />} />
      <Route path="/operations/feedback" element={<FeedbackPage />} />
      <Route path="/operations/dashboard" element={<DashboardPage />} />
      {/* Compat: rutas viejas redirigen a /admin/settings. */}
      <Route path="/operations/settings" element={<Navigate to="/admin/settings" replace />} />
      <Route path="/admin/users" element={<Navigate to="/admin/settings" replace />} />
      <Route
        path="/admin/settings"
        element={currentUser?.isAdmin ? <SettingsPage /> : <Navigate to="/operations/clients" replace />}
      />
      <Route
        path="/sales/*"
        element={
          canAccessSales ? (
            <Suspense fallback={<div className="text-text3 text-center py-20">Cargando…</div>}>
              <SalesRoutes />
            </Suspense>
          ) : (
            <Navigate to="/operations/clients" replace />
          )
        }
      />
      <Route path="*" element={<div className="text-text3 text-center py-20">Vista no encontrada</div>} />
    </Routes>
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — hidden on mobile */}
      <div className="w-[240px] bg-white border-r border-border flex flex-col fixed h-screen z-30 max-md:hidden">
        <div className="h-[60px] flex items-center px-5 gap-2.5 border-b border-border shrink-0">
          <img src="https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38d814cde4bbc2afc8dc3.png" alt="Método Korex" className="h-[28px] w-auto" />
          <span className="text-[13px] font-bold text-gray-700">Método Korex</span>
        </div>
        <nav className="p-3 flex-1 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.id} className="mb-3">
              <div className="text-[10px] font-semibold text-text3 uppercase tracking-[1px] px-3 pt-3 pb-1.5">{section.label}</div>
              {section.items.map((item) => {
                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                return (
                  <button
                    key={item.id}
                    onClick={() => switchTo(item.path)}
                    className={`flex items-center gap-2.5 py-2 px-3 cursor-pointer text-[13px] font-medium w-full text-left font-sans rounded-md mb-0.5 border-none transition-all duration-150
                      ${isActive ? 'text-blue bg-blue-bg font-semibold' : 'text-text2 bg-transparent hover:text-text hover:bg-surface2'}`}
                  >
                    <item.Icon size={17} strokeWidth={isActive ? 2.25 : 1.75} className="shrink-0" />
                    {item.label}
                    {item.id === 'tasks' && urgentCount > 0 && (
                      <span className="ml-auto bg-red text-white text-[10px] font-bold py-[1px] px-1.5 rounded-xl min-w-[18px] text-center">{urgentCount}</span>
                    )}
                    {item.id === 'videos' && unseenVideoCount > 0 && (
                      <span className="ml-auto bg-blue-500 text-white text-[10px] font-bold py-[1px] px-1.5 rounded-xl min-w-[18px] text-center">{unseenVideoCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="p-3.5 px-4 border-t border-border flex items-center gap-2.5">
          {currentUser?.avatar ? (
            <img src={currentUser.avatar} alt={currentUser.name} className="w-[34px] h-[34px] rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center font-bold text-xs shrink-0" style={{ background: currentUser?.color + '18', color: currentUser?.color }}>
              {currentUser?.initials}
            </div>
          )}
          <div>
            <div className="text-[13px] font-semibold">{currentUser?.name}</div>
            <div className="text-[11px] text-text3">{currentUser?.role}</div>
          </div>
          <button
            onClick={doLogout}
            className="ml-auto bg-transparent border-none text-text3 cursor-pointer text-sm p-1 rounded hover:text-red"
            title="Cerrar sesión"
          >
            {'→'}
          </button>
        </div>
      </div>

      {/* Bottom nav — mobile only (items del modulo activo) */}
      <div className="hidden max-md:flex mobile-bottom-nav fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50 justify-around items-center px-1 py-1 safe-bottom">
        {mobileItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <button
              key={item.id}
              onClick={() => switchTo(item.path)}
              className={`flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg border-none cursor-pointer font-sans transition-all duration-150 relative min-w-0 flex-1
                ${isActive ? 'text-blue bg-blue-bg' : 'text-text3 bg-transparent'}`}
            >
              <item.Icon size={18} strokeWidth={isActive ? 2.25 : 1.75} className="shrink-0" />
              <span className="text-[9px] font-medium leading-none truncate w-full text-center">{item.label}</span>
              {item.id === 'tasks' && urgentCount > 0 && (
                <span className="absolute -top-0.5 right-1 bg-red text-white text-[8px] font-bold w-[14px] h-[14px] rounded-full flex items-center justify-center">{urgentCount}</span>
              )}
            </button>
          );
        })}
        <button
          onClick={doLogout}
          className="flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg border-none cursor-pointer font-sans text-text3 bg-transparent min-w-0 flex-1"
          title="Cerrar sesión"
        >
          <span className="text-[18px] leading-none">{'→'}</span>
          <span className="text-[9px] font-medium leading-none">Salir</span>
        </button>
      </div>

      {/* Main area */}
      <div className="main-content ml-[240px] min-h-screen max-md:ml-0 max-md:pb-16 overflow-x-hidden">
        {/* Topbar */}
        <div className="h-[60px] bg-white border-b border-border flex items-center justify-between px-7 sticky top-0 z-10 max-md:px-4 max-md:h-[52px]">
          <div className="flex items-center gap-2.5 max-md:gap-2 min-w-0">
            <img src="https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38d814cde4bbc2afc8dc3.png" alt="MK" className="hidden max-md:block h-[22px] w-auto shrink-0" />
            <div className="min-w-0">
              <div className="text-[17px] font-bold max-md:text-[15px] truncate">{title}</div>
              <div className="text-xs text-text3 max-md:text-[10px] truncate max-md:hidden">{subtitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-2.5 max-md:gap-1.5 shrink-0">
            <span className={`inline-flex items-center gap-1 text-[10px] py-0.5 px-2 rounded-xl bg-surface2 max-md:hidden ${syncStatus === 'syncing' ? 'text-blue' : syncStatus === 'error' ? 'text-red' : 'text-text3'}`}>
              {syncStatus === 'syncing' ? '↻ Guardando...' : syncStatus === 'error' ? '✕ Error sync' : '● Sincronizado'}
            </span>
            <SearchBar />
            {view === 'clients' && (
              <button
                className="py-1.5 px-2.5 rounded-md border-none bg-blue text-white text-xs font-medium cursor-pointer font-sans hover:bg-blue-dark flex items-center gap-1.5 max-md:py-1 max-md:px-2 max-md:text-[11px]"
                onClick={() => setNewClientModal(true)}
              >
                + <span className="max-md:hidden">Nuevo cliente</span><span className="hidden max-md:inline">Nuevo</span>
              </button>
            )}
          </div>
        </div>

        {/* Content area — sales pages handle their own scroll, ops pages use parent scroll */}
        <div className={`p-6 px-7 max-md:p-2.5 max-md:px-2.5 min-w-0 overflow-x-hidden h-[calc(100vh-60px)] max-md:h-[calc(100vh-52px-64px)] ${location.pathname.startsWith('/sales') ? 'overflow-y-hidden' : 'overflow-y-auto'}`}>
          {routes}
        </div>
      </div>

      {/* New Client Modal */}
      <Modal
        open={newClientModal}
        onClose={() => setNewClientModal(false)}
        title="Nuevo cliente"
        footer={<>
          <button className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] cursor-pointer font-sans hover:bg-surface2" onClick={() => setNewClientModal(false)}>Cancelar</button>
          <button className="py-2 px-4 rounded-md border-none bg-blue text-white text-[13px] cursor-pointer font-sans hover:bg-blue-dark" onClick={handleCreateClient}>Crear</button>
        </>}
      >
        <div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Nombre <span className="text-red">*</span></label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]" placeholder="Juan" value={ncForm.firstName} onChange={e => setNcForm(f => ({ ...f, firstName: e.target.value }))} autoFocus /></div>
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Apellido <span className="text-red">*</span></label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]" placeholder="Garcia" value={ncForm.lastName} onChange={e => setNcForm(f => ({ ...f, lastName: e.target.value }))} /></div>
        </div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Empresa <span className="text-red">*</span></label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]" placeholder="Garcia Store" value={ncForm.company} onChange={e => setNcForm(f => ({ ...f, company: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Teléfono</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]" placeholder="+34 612 345 678" value={ncForm.phone} onChange={e => setNcForm(f => ({ ...f, phone: e.target.value }))} /></div>
          <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Canal de Slack</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]" placeholder="nombre-del-canal" value={ncForm.slackChannel} onChange={e => setNcForm(f => ({ ...f, slackChannel: e.target.value }))} /></div>
        </div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Servicio</label><select className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)] cursor-pointer" value={ncForm.service} onChange={e => setNcForm(f => ({ ...f, service: e.target.value }))}>{services.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <div className="mb-3.5"><label className="block text-xs font-semibold text-text2 mb-[5px]">Foto de perfil</label><input type="text" className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] font-sans outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]" placeholder="URL de la foto (opcional)" value={ncForm.avatarUrl} onChange={e => setNcForm(f => ({ ...f, avatarUrl: e.target.value }))} /></div>
      </Modal>
    </div>
  );
}

function App() {
  const { user: authUser, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-text3 text-sm">Cargando...</div>
      </div>
    );
  }
  if (!authUser) return <LoginPage />;
  if (!profile) return <AccountPending email={authUser.email} />;
  return <MainLayout />;
}

export default App;
