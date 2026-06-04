import { Bell } from 'lucide-react';
import { useApp } from '../../context/AppContext';

// Campana del topbar: abre el buzón y muestra el contador de no leídas.
export default function NotificationBell() {
  const { unreadNotifCount, openNotifications } = useApp();
  const has = unreadNotifCount > 0;

  return (
    <button
      type="button"
      onClick={openNotifications}
      title="Notificaciones"
      aria-label={has ? `${unreadNotifCount} notificaciones sin leer` : 'Notificaciones'}
      className="relative w-9 h-9 rounded-lg bg-transparent border-none text-text2 hover:bg-surface2 hover:text-blue cursor-pointer flex items-center justify-center transition-colors max-md:w-8 max-md:h-8"
    >
      <Bell size={19} className={has ? 'text-blue' : ''} />
      {has && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
          style={{ background: 'var(--color-red, #EF4444)' }}
        >
          {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
        </span>
      )}
    </button>
  );
}
