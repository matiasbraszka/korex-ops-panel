import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Users, ClipboardList, Settings as SettingsIcon, Play, Phone, Shield, ChevronLeft, ChevronRight, ChevronDown, X, FileText, Lightbulb } from 'lucide-react';
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
import InformesPage from './pages/InformesPage';
import IdeasPage from './pages/IdeasPage';
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

// AreaDropdown — selector compacto de area (Operaciones / Ventas / Administracion).
// Funciona expandido (muestra label + chevron) y colapsado (solo icono).
// Cuando colapsado el popover se posiciona FIJO a la derecha del sidebar.
function AreaDropdown({ areas, activeArea, onSwitch, collapsed = false }) {
  const [open, setOpen] = useState(false);
  const [popPos, setPopPos] = useState(null);
  const ref = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && ref.current.contains(e.target)) return;
      // Click en el popover fixed tampoco cierra
      if (e.target.closest('[data-area-popover]')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const togglePop = () => {
    if (!open && collapsed && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopPos({ left: rect.right + 8, top: rect.top, minWidth: 200 });
    }
    setOpen(!open);
  };

  const ActiveIcon = activeArea.icon;

  return (
    <div className={`relative ${collapsed ? 'px-2 pt-3 pb-1 flex justify-center' : 'px-2.5 pt-3 pb-1'}`} ref={ref}>
      {!collapsed && (
        <div className="text-[9.5px] font-bold tracking-[0.08em] text-text3 uppercase px-2 mb-1.5">Área</div>
      )}
      {collapsed ? (
        <button ref={triggerRef} type="button" onClick={togglePop}
                title={`Área: ${activeArea.label}`}
                className="w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-all relative"
                style={{ background: activeArea.color }}>
          <ActiveIcon size={14} strokeWidth={2.25} className="text-white" />
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-white rounded-full border border-border flex items-center justify-center">
            <ChevronDown size={8} className="text-text3" strokeWidth={2.5} />
          </span>
        </button>
      ) : (
        <button ref={triggerRef} type="button" onClick={togglePop}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg border bg-white hover:bg-surface2 transition-colors cursor-pointer"
                style={{ borderColor: activeArea.color + '40' }}>
          <span className="w-5 h-5 rounded shrink-0 flex items-center justify-center text-white"
                style={{ background: activeArea.color }}>
            <ActiveIcon size={11} strokeWidth={2.25} />
          </span>
          <span className="text-[12px] font-semibold flex-1 text-left" style={{ color: activeArea.color }}>
            {activeArea.label}
          </span>
          <ChevronDown size={12} className="text-text3 transition-transform"
                       style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
        </button>
      )}

      {open && !collapsed && (
        <div className="absolute left-2.5 right-2.5 top-full mt-1 bg-white border border-border rounded-lg shadow-lg z-40 overflow-hidden">
          {areas.map((a) => {
            const isOn = a.id === activeArea.id;
            const Icon = a.icon;
            return (
              <button key={a.id} type="button"
                      onClick={() => { setOpen(false); onSwitch(a.items[0].path); }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-surface2 transition-colors cursor-pointer text-left"
                      style={{ background: isOn ? a.bg : 'transparent', color: isOn ? a.color : 'var(--color-text2)' }}>
                <span className="w-5 h-5 rounded shrink-0 flex items-center justify-center text-white"
                      style={{ background: a.color }}>
                  <Icon size={11} strokeWidth={2.25} />
                </span>
                <span className="text-[12px] font-semibold flex-1">{a.label}</span>
                {isOn && <span className="text-[10px]" style={{ color: a.color }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Popover fixed para sidebar colapsado */}
      {open && collapsed && popPos && (
        <div data-area-popover
             style={{ position: 'fixed', left: popPos.left, top: popPos.top, minWidth: popPos.minWidth, zIndex: 60 }}
             className="bg-white border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="text-[9.5px] font-bold tracking-[0.08em] text-text3 uppercase px-3 py-2 border-b border-border">Área</div>
          {areas.map((a) => {
            const isOn = a.id === activeArea.id;
            const Icon = a.icon;
            return (
              <button key={a.id} type="button"
                      onClick={() => { setOpen(false); onSwitch(a.items[0].path); }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface2 transition-colors cursor-pointer text-left"
                      style={{ background: isOn ? a.bg : 'transparent', color: isOn ? a.color : 'var(--color-text2)' }}>
                <span className="w-5 h-5 rounded shrink-0 flex items-center justify-center text-white"
                      style={{ background: a.color }}>
                  <Icon size={11} strokeWidth={2.25} />
                </span>
                <span className="text-[12px] font-semibold flex-1">{a.label}</span>
                {isOn && <span className="text-[10px]" style={{ color: a.color }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MainLayout() {
  const { view, setSelectedId, currentUser, doLogout, syncStatus, tasks, createClient: ctxCreateClient, appSettings, loomVideos } = useApp();
  const navigate = useNavigate();
  const [newClientModal, setNewClientModal] = useState(false);
  // Sidebar colapsable (PC) — persiste en localStorage
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('korex_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const toggleSidebar = () => {
    setSidebarCollapsed((v) => {
      const nv = !v;
      try { localStorage.setItem('korex_sidebar_collapsed', nv ? '1' : '0'); } catch {}
      return nv;
    });
  };
  // Drawer mobile para cambiar de area
  const [areaDrawerOpen, setAreaDrawerOpen] = useState(false);
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

  // Areas del panel: cada una tiene color propio, ruta base y modulos.
  // El sidebar muestra un "area switcher" arriba (si el usuario tiene >1)
  // y abajo los modulos del area activa, coloreados con ese mismo color.
  const opsItems = [
    { id: 'clients',   label: 'Clientes',      Icon: Users,          path: '/operations/clients' },
    { id: 'tasks',     label: 'Tareas',        Icon: ClipboardList,  path: '/operations/tasks' },
    { id: 'llamadas',  label: 'Llamadas',      Icon: Phone,          path: '/operations/llamadas' },
    { id: 'informes',  label: 'Informes',      Icon: FileText,       path: '/operations/informes' },
    { id: 'ideas',     label: 'Ideas',         Icon: Lightbulb,      path: '/operations/ideas' },
    { id: 'videos',    label: 'Tutoriales',    Icon: Play,           path: '/operations/videos' },
  ];
  // Contactos solo visible para admins. Si no es admin, ocultar del nav.
  const salesItems = currentUser?.isAdmin
    ? salesNavItems
    : salesNavItems.filter((it) => it.id !== 'contacts');
  const adminItems = [
    { id: 'settings', label: 'Configuración', Icon: SettingsIcon, path: '/admin/settings' },
  ];
  // Tokens de color por area (mantienen consistencia con la paleta Korex).
  const areaTokens = {
    operations: { color: '#22C55E', bg: '#ECFDF5', short: 'Ops',    icon: ClipboardList,  base: '/operations' },
    sales:      { color: '#5B7CF5', bg: '#EEF2FF', short: 'Ventas', icon: Users,          base: '/sales' },
    admin:      { color: '#8B5CF6', bg: '#F5F3FF', short: 'Admin',  icon: Shield,         base: '/admin' },
  };
  const areas = [
    canAccessOperations && { id: 'operations', label: 'Operaciones',    items: opsItems,   ...areaTokens.operations },
    canAccessSales      && { id: 'sales',      label: 'Ventas',         items: salesItems, ...areaTokens.sales },
    currentUser?.isAdmin && { id: 'admin',     label: 'Administración', items: adminItems, ...areaTokens.admin },
  ].filter(Boolean);

  const urgentCount = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length;
  const pathPrefix = location.pathname.split('/').filter(Boolean)[0] || 'operations';
  const activeArea = areas.find((a) => a.id === pathPrefix) || areas[0];
  const mobileItems = activeArea?.items || [];
  const hasMultipleAreas = areas.length > 1;

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
    informes: ['Informes', 'Informes diarios y semanales del equipo'],
    ideas: ['Ideas', 'Cajón de ideas del equipo por departamento'],
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
      <Route path="/operations/informes" element={<InformesPage />} />
      <Route path="/operations/ideas" element={<IdeasPage />} />
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
      {/* Sidebar — colapsable en PC · oculto en mobile */}
      <div className="bg-white border-r border-border flex flex-col fixed h-screen z-30 max-md:hidden transition-[width] duration-200"
           style={{ width: sidebarCollapsed ? 60 : 240 }}>
        {/* Logo + boton colapsar */}
        <div className="h-[60px] flex items-center border-b border-border shrink-0"
             style={{ paddingLeft: sidebarCollapsed ? 0 : 16, paddingRight: sidebarCollapsed ? 0 : 8, justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: 10 }}>
          <img src="https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38d814cde4bbc2afc8dc3.png" alt="Método Korex" className="h-[28px] w-auto shrink-0" />
          {!sidebarCollapsed && (
            <>
              <span className="text-[13px] font-bold text-text flex-1">Método Korex</span>
              <button onClick={toggleSidebar} title="Ocultar sidebar"
                      className="bg-transparent border-0 text-text3 hover:text-text hover:bg-surface2 rounded w-6 h-6 flex items-center justify-center cursor-pointer transition-colors">
                <ChevronLeft size={14} />
              </button>
            </>
          )}
        </div>

        {sidebarCollapsed ? (
          <button onClick={toggleSidebar} title="Mostrar sidebar"
                  className="bg-transparent border-0 text-text3 hover:text-text hover:bg-surface2 rounded w-8 h-8 flex items-center justify-center cursor-pointer transition-colors mx-auto mt-2">
            <ChevronRight size={14} />
          </button>
        ) : null}

        {/* Area switcher · dropdown compacto que ahorra espacio */}
        {!sidebarCollapsed && hasMultipleAreas && activeArea && (
          <AreaDropdown areas={areas} activeArea={activeArea} onSwitch={switchTo} />
        )}

        {/* Header informativo del area · solo expandido y si tiene 1 sola area */}
        {!sidebarCollapsed && !hasMultipleAreas && activeArea && (
          <div className="px-3.5 pt-3 pb-1">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md"
                 style={{ background: activeArea.bg, color: activeArea.color }}>
              <activeArea.icon size={12} strokeWidth={2.25} />
              <span className="text-[11.5px] font-bold">{activeArea.label}</span>
            </div>
          </div>
        )}

        {/* Colapsado: el mismo AreaDropdown pero en modo mini con popover lateral */}
        {sidebarCollapsed && hasMultipleAreas && activeArea && (
          <AreaDropdown areas={areas} activeArea={activeArea} onSwitch={switchTo} collapsed />
        )}

        {/* Modulos del area activa */}
        <nav className="py-2 flex-1 overflow-y-auto"
             style={{ paddingLeft: sidebarCollapsed ? 6 : 8, paddingRight: sidebarCollapsed ? 6 : 8 }}>
          {(activeArea?.items || []).map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            const badge = item.id === 'tasks' && urgentCount > 0 ? urgentCount
                        : item.id === 'videos' && unseenVideoCount > 0 ? unseenVideoCount : null;
            return (
              <button key={item.id}
                      onClick={() => switchTo(item.path)}
                      title={sidebarCollapsed ? item.label : undefined}
                      className="cursor-pointer text-[13px] font-medium w-full text-left font-sans rounded-md mb-0.5 border-none transition-all flex items-center"
                      style={{
                        background: isActive ? activeArea.bg : 'transparent',
                        color: isActive ? activeArea.color : 'var(--color-text2)',
                        padding: sidebarCollapsed ? '8px 0' : '8px 10px',
                        gap: sidebarCollapsed ? 0 : 10,
                        justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                        position: 'relative',
                      }}
                      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--color-surface2)'; e.currentTarget.style.color = 'var(--color-text)'; } }}
                      onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text2)'; } }}>
                <item.Icon size={16} strokeWidth={isActive ? 2.25 : 1.75} className="shrink-0" />
                {!sidebarCollapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {badge && (
                      <span className="text-[10px] font-bold py-[1px] px-1.5 rounded-full min-w-[18px] text-center"
                            style={{ background: isActive ? activeArea.color : 'var(--color-red)', color: '#fff' }}>{badge}</span>
                    )}
                  </>
                )}
                {sidebarCollapsed && badge && (
                  <span className="absolute top-1 right-1 text-[8px] font-bold w-3 h-3 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--color-red)', color: '#fff' }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer · usuario + rol pill */}
        <div className="border-t border-border flex items-center gap-2.5"
             style={{ padding: sidebarCollapsed ? 8 : 12, justifyContent: sidebarCollapsed ? 'center' : 'flex-start' }}>
          {currentUser?.avatar ? (
            <img src={currentUser.avatar} alt={currentUser.name} className="w-[32px] h-[32px] rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-[32px] h-[32px] rounded-full flex items-center justify-center font-bold text-[11px] shrink-0"
                 style={{ background: (currentUser?.color || '#5B7CF5') + '24', color: currentUser?.color || '#5B7CF5' }}>
              {currentUser?.initials}
            </div>
          )}
          {!sidebarCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-semibold truncate">{currentUser?.name}</div>
                <div className="flex items-center gap-1 mt-px">
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-px rounded"
                        style={{ background: activeArea?.bg, color: activeArea?.color }}>
                    {currentUser?.isAdmin ? 'Admin' : (activeArea?.short || 'User')}
                  </span>
                </div>
              </div>
              <button onClick={doLogout}
                      className="bg-transparent border-none text-text3 cursor-pointer text-sm p-1 rounded hover:text-red shrink-0"
                      title="Cerrar sesión">
                {'→'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom nav mobile · 4 modulos del area + boton Menu (drawer).
          Color del area activa para destacar la pantalla. */}
      <div className="hidden max-md:flex mobile-bottom-nav fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50 justify-around items-center px-1 py-1 safe-bottom">
        {mobileItems.slice(0, 4).map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <button key={item.id}
                    onClick={() => switchTo(item.path)}
                    className="flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg border-none cursor-pointer font-sans transition-all duration-150 relative min-w-0 flex-1"
                    style={{
                      background: isActive ? activeArea?.bg : 'transparent',
                      color: isActive ? activeArea?.color : 'var(--color-text3)',
                    }}>
              <item.Icon size={18} strokeWidth={isActive ? 2.25 : 1.75} className="shrink-0" />
              <span className="text-[9px] font-medium leading-none truncate w-full text-center">{item.label}</span>
              {item.id === 'tasks' && urgentCount > 0 && (
                <span className="absolute -top-0.5 right-1 bg-red text-white text-[8px] font-bold w-[14px] h-[14px] rounded-full flex items-center justify-center">{urgentCount}</span>
              )}
            </button>
          );
        })}
        {/* Boton "Más" abre drawer con todas las areas y modulos */}
        <button onClick={() => setAreaDrawerOpen(true)}
                className="flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg border-none cursor-pointer font-sans bg-transparent min-w-0 flex-1"
                style={{ color: 'var(--color-text3)' }}
                title="Menú">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 12h18M3 6h18M3 18h18"/>
          </svg>
          <span className="text-[9px] font-medium leading-none">Menú</span>
        </button>
      </div>

      {/* Drawer mobile · areas + modulos · cierra con tap en backdrop */}
      {areaDrawerOpen && (
        <div className="hidden max-md:flex fixed inset-0 z-[60] bg-black/45"
             onClick={() => setAreaDrawerOpen(false)}>
          <div className="ml-auto bg-white h-full w-[85%] max-w-[340px] flex flex-col shadow-2xl"
               onClick={(e) => e.stopPropagation()}>
            {/* Header del drawer · usuario */}
            <div className="px-4 py-3.5 border-b border-border flex items-center gap-2.5">
              {currentUser?.avatar ? (
                <img src={currentUser.avatar} alt={currentUser.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[12px] shrink-0"
                     style={{ background: (currentUser?.color || '#5B7CF5') + '24', color: currentUser?.color || '#5B7CF5' }}>
                  {currentUser?.initials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate">{currentUser?.name}</div>
                <div className="text-[10.5px] text-text3 truncate">{currentUser?.role || (currentUser?.isAdmin ? 'Administrador' : 'Usuario')}</div>
              </div>
              <button onClick={() => setAreaDrawerOpen(false)}
                      className="bg-transparent border-0 text-text3 hover:text-text rounded p-1 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {/* Areas · solo si tiene >1 */}
            {hasMultipleAreas && (
              <div className="px-3 pt-3">
                <div className="text-[9.5px] font-bold tracking-[0.08em] text-text3 uppercase px-1 mb-1.5">Áreas</div>
                <div className="flex flex-col gap-1">
                  {areas.map((a) => {
                    const isOn = a.id === activeArea?.id;
                    const Icon = a.icon;
                    return (
                      <button key={a.id}
                              onClick={() => { switchTo(a.items[0].path); setAreaDrawerOpen(false); }}
                              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left border cursor-pointer transition-all"
                              style={{
                                background: isOn ? a.bg : 'transparent',
                                borderColor: isOn ? a.color + '40' : 'transparent',
                                color: isOn ? a.color : 'var(--color-text)',
                              }}>
                        <span className="w-7 h-7 rounded-md shrink-0 flex items-center justify-center text-white"
                              style={{ background: a.color }}>
                          <Icon size={13} strokeWidth={2.25} />
                        </span>
                        <span className="text-[13px] font-semibold flex-1">{a.label}</span>
                        {isOn && <span className="text-[10px] font-bold uppercase tracking-wider">activa</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Modulos del area activa */}
            <div className="px-3 pt-3 flex-1 overflow-y-auto">
              <div className="text-[9.5px] font-bold tracking-[0.08em] text-text3 uppercase px-1 mb-1.5 flex items-center gap-1.5">
                {activeArea?.short || 'Módulos'} · módulos
              </div>
              <div className="flex flex-col gap-0.5">
                {(activeArea?.items || []).map((item) => {
                  const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                  const badge = item.id === 'tasks' && urgentCount > 0 ? urgentCount
                              : item.id === 'videos' && unseenVideoCount > 0 ? unseenVideoCount : null;
                  return (
                    <button key={item.id}
                            onClick={() => { switchTo(item.path); setAreaDrawerOpen(false); }}
                            className="flex items-center gap-3 px-2.5 py-2.5 rounded-md text-left border-0 cursor-pointer transition-all"
                            style={{
                              background: isActive ? activeArea.bg : 'transparent',
                              color: isActive ? activeArea.color : 'var(--color-text2)',
                            }}>
                      <item.Icon size={17} strokeWidth={isActive ? 2.25 : 1.75} className="shrink-0" />
                      <span className="text-[13px] font-medium flex-1">{item.label}</span>
                      {badge && (
                        <span className="text-[10px] font-bold py-px px-1.5 rounded-full min-w-[18px] text-center"
                              style={{ background: isActive ? activeArea.color : 'var(--color-red)', color: '#fff' }}>{badge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer · logout */}
            <div className="border-t border-border p-3">
              <button onClick={() => { doLogout(); setAreaDrawerOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md bg-transparent hover:bg-red/10 text-red text-[13px] font-medium border-0 cursor-pointer transition-colors">
                <span>→</span> Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main area · margen reactivo al colapso (CSS var leida en .main-content) */}
      <div className="main-content min-h-screen max-md:ml-0 max-md:pb-16 overflow-x-hidden transition-[margin] duration-200"
           style={{ '--sb-w': (sidebarCollapsed ? 60 : 240) + 'px' }}>
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
            {/* SearchBar global solo busca clientes/tareas de Operaciones — ocultar en area Ventas */}
            {pathPrefix !== 'sales' && <SearchBar />}
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
        <div className="p-6 px-7 max-md:p-2.5 max-md:px-2.5 min-w-0 overflow-x-hidden h-[calc(100dvh-60px)] max-md:h-[calc(100dvh-52px-64px)] overflow-y-auto">
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
