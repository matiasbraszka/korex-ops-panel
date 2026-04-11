import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LayoutDashboard, Users, ClipboardList, FileText, Settings as SettingsIcon } from 'lucide-react';
import { useApp } from './context/AppContext';
import ClientsPage from './pages/ClientsPage';
import TareasPage from './pages/TareasPage';
import PublicidadPage from './pages/PublicidadPage';
import InformePage from './pages/InformePage';
import DashboardPage from './pages/DashboardPage';
import FeedbackPage from './pages/FeedbackPage';
import SettingsPage from './pages/SettingsPage';
import Modal from './components/Modal';
import { today } from './utils/helpers';

function LoginPage() {
  const { doLogin } = useApp();
  const handleSubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const user = form.user.value;
    const pass = form.pass.value;
    const ok = await doLogin(user, pass);
    if (!ok) {
      form.querySelector('.login-error').style.display = 'block';
      form.pass.value = '';
    }
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
            type="text"
            name="user"
            className="w-full bg-blue-bg2 border border-border rounded-[10px] py-3.5 px-4 text-text text-sm font-sans mb-5 outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]"
            placeholder="usuario@email.com"
            autoFocus
          />
          <label className="block text-[13px] font-semibold text-text mb-2">Contraseña</label>
          <input
            type="password"
            name="pass"
            className="w-full bg-blue-bg2 border border-border rounded-[10px] py-3.5 px-4 text-text text-sm font-sans mb-5 outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]"
            placeholder={'\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
          />
          <button
            type="submit"
            className="w-full py-3.5 bg-blue text-white border-none rounded-[10px] text-[15px] font-semibold font-sans cursor-pointer mt-1 hover:bg-blue-dark"
          >
            Iniciar sesión
          </button>
          <div className="login-error text-red text-xs text-center mt-3.5 hidden">
            Usuario o contraseña incorrectos
          </div>
        </form>
        <div className="text-center mt-6">
          <a href="#" className="text-blue text-[13px] no-underline">
            {'\u00BF'}Olvidaste tu contraseña?
          </a>
        </div>
        <div className="text-center mt-10 text-xs text-text3">
          Política de Privacidad &middot; Términos y Condiciones
        </div>
      </div>
    </div>
  );
}

function MainLayout() {
  const { view, setView, setSelectedId, currentUser, doLogout, syncStatus, tasks, taskProposals, createClient: ctxCreateClient, briefing, appSettings } = useApp();
  const [newClientModal, setNewClientModal] = useState(false);
  const services = appSettings?.services && appSettings.services.length > 0
    ? appSettings.services
    : ['Funnel completo + Ads'];
  const [ncForm, setNcForm] = useState({ firstName: '', lastName: '', company: '', phone: '', slackChannel: '', service: services[0], avatarUrl: '' });

  const allNavItems = [
    { id: 'dashboard', label: 'Dashboard',     Icon: LayoutDashboard },
    { id: 'clients',   label: 'Clientes',      Icon: Users },
    { id: 'tasks',     label: 'Tareas',        Icon: ClipboardList },
    { id: 'informe',   label: 'Informe',       Icon: FileText },
    { id: 'settings',  label: 'Configuración', Icon: SettingsIcon, requiresPerm: true },
  ];
  const canAccessSettings = currentUser?.role === 'COO' || currentUser?.canAccessSettings === true;
  const navItems = allNavItems.filter(item => !item.requiresPerm || canAccessSettings);

  const urgentCount = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length;
  const pendingProposals = taskProposals.filter(p => p.approval === 'pending').length;

  const switchView = (v) => {
    setView(v);
    setSelectedId(null);
  };

  const titles = {
    dashboard: ['Dashboard', 'Panel ejecutivo de operaciones'],
    clients: ['Clientes', 'Perfiles, ads, feedback y recursos'],
    publicidad: ['Publicidad', 'Métricas de Meta Ads por cliente'],
    tasks: ['Tareas', 'Roadmap, Timeline y Lista unificados'],
    informe: ['Informe Diario', briefing?.date ? 'Último: ' + briefing.date : 'Sin informe aún'],
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

  const pages = {
    dashboard: <DashboardPage />,
    clients: <ClientsPage />,
    publicidad: <PublicidadPage />,
    tasks: <TareasPage />,
    settings: <SettingsPage />,
    informe: <InformePage />,
    feedback: <FeedbackPage />,
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — hidden on mobile */}
      <div className="w-[240px] bg-white border-r border-border flex flex-col fixed h-screen z-30 max-md:hidden">
        <div className="h-[60px] flex items-center px-5 gap-2.5 border-b border-border shrink-0">
          <img src="https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38d814cde4bbc2afc8dc3.png" alt="Método Korex" className="h-[28px] w-auto" />
        </div>
        <nav className="p-3 flex-1">
          <div className="text-[10px] font-semibold text-text3 uppercase tracking-[1px] px-3 pt-3 pb-1.5">Menu</div>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => switchView(item.id)}
              className={`flex items-center gap-2.5 py-2 px-3 cursor-pointer text-[13px] font-medium w-full text-left font-sans rounded-md mb-0.5 border-none transition-all duration-150
                ${view === item.id ? 'text-blue bg-blue-bg font-semibold' : 'text-text2 bg-transparent hover:text-text hover:bg-surface2'}`}
            >
              <item.Icon size={17} strokeWidth={view === item.id ? 2.25 : 1.75} className="shrink-0" />
              {item.label}
              {item.id === 'tasks' && urgentCount > 0 && (
                <span className="ml-auto bg-red text-white text-[10px] font-bold py-[1px] px-1.5 rounded-[10px] min-w-[18px] text-center">{urgentCount}</span>
              )}
              {item.id === 'informe' && pendingProposals > 0 && (
                <span className="ml-auto text-white text-[10px] font-bold py-[1px] px-1.5 rounded-[10px] min-w-[18px] text-center" style={{ background: 'var(--color-orange)' }}>{pendingProposals}</span>
              )}
            </button>
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
            {'\u2192'}
          </button>
        </div>
      </div>

      {/* Bottom nav — mobile only */}
      <div className="hidden max-md:flex mobile-bottom-nav fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50 justify-around items-center px-1 py-1 safe-bottom">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => switchView(item.id)}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg border-none cursor-pointer font-sans transition-all duration-150 relative min-w-0 flex-1
              ${view === item.id ? 'text-blue bg-blue-bg' : 'text-text3 bg-transparent'}`}
          >
            <item.Icon size={18} strokeWidth={view === item.id ? 2.25 : 1.75} className="shrink-0" />
            <span className="text-[9px] font-medium leading-none truncate w-full text-center">{item.label}</span>
            {item.id === 'tasks' && urgentCount > 0 && (
              <span className="absolute -top-0.5 right-1 bg-red text-white text-[8px] font-bold w-[14px] h-[14px] rounded-full flex items-center justify-center">{urgentCount}</span>
            )}
            {item.id === 'informe' && pendingProposals > 0 && (
              <span className="absolute -top-0.5 right-1 text-white text-[8px] font-bold w-[14px] h-[14px] rounded-full flex items-center justify-center" style={{ background: 'var(--color-orange)' }}>{pendingProposals}</span>
            )}
          </button>
        ))}
        <button
          onClick={doLogout}
          className="flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg border-none cursor-pointer font-sans text-text3 bg-transparent min-w-0 flex-1"
          title="Cerrar sesión"
        >
          <span className="text-[18px] leading-none">{'\u2192'}</span>
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
            <span className={`inline-flex items-center gap-1 text-[10px] py-0.5 px-2 rounded-[10px] bg-surface2 max-md:hidden ${syncStatus === 'syncing' ? 'text-blue' : syncStatus === 'error' ? 'text-red' : 'text-text3'}`}>
              {syncStatus === 'syncing' ? '\u21BB Guardando...' : syncStatus === 'error' ? '\u2715 Error sync' : '\u25CF Sincronizado'}
            </span>
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

        {/* Content area */}
        <div className="p-6 px-7 max-md:p-2.5 max-md:px-2.5 min-w-0 overflow-x-hidden">
          {pages[view] || <div className="text-text3 text-center py-20">Vista no encontrada</div>}
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
  const { currentUser } = useApp();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={currentUser ? <MainLayout /> : <LoginPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;