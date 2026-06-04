import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import TeamAvatar from '../TeamAvatar';
import { notifMeta } from './notifMeta';

// NotificationToast — aviso flotante arriba a la derecha cuando llega una
// notificación nueva (realtime). Auto-cierra a los 5s; al click abre el buzón.
export default function NotificationToast() {
  const { notifToast, dismissNotifToast, openNotifications, teamMembers } = useApp();
  const [visible, setVisible] = useState(false);

  const member = useMemo(
    () => (teamMembers || []).find(m => m.id === notifToast?.actor_id) || null,
    [teamMembers, notifToast],
  );

  // Cada notifToast nuevo reinicia el timer de auto-cierre.
  useEffect(() => {
    if (!notifToast) { setVisible(false); return; }
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), 4800);
    const clear = setTimeout(() => dismissNotifToast(), 5100);
    return () => { clearTimeout(hide); clearTimeout(clear); };
  }, [notifToast, dismissNotifToast]);

  if (!notifToast) return null;
  const { Icon, color } = notifMeta(notifToast.type);

  return (
    <div
      className="fixed top-[70px] right-5 z-[90] max-md:right-3 max-md:left-3 max-md:top-[60px]"
      style={{
        transform: visible ? 'translateX(0)' : 'translateX(120%)',
        opacity: visible ? 1 : 0,
        transition: 'transform .28s cubic-bezier(.4,0,.2,1), opacity .28s',
        fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
      }}
    >
      <div
        className="w-[340px] max-md:w-auto bg-white rounded-[13px] border border-[#E2E5EB] p-3 flex items-start gap-2.5 cursor-pointer hover:border-[#5B7CF5] transition-colors"
        style={{ boxShadow: '0 12px 32px rgba(10,22,40,.16)' }}
        onClick={() => { openNotifications(); dismissNotifToast(); }}
      >
        <div className="relative shrink-0 mt-0.5">
          {member
            ? <TeamAvatar member={member} size={32} />
            : <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: color + '18', color }}><Icon size={16} /></span>}
          <span
            className="absolute -bottom-0.5 -right-0.5 w-[15px] h-[15px] rounded-full flex items-center justify-center border-2 border-white"
            style={{ background: color }}
          ><Icon size={8} className="text-white" /></span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-[#1A1D26] leading-snug break-words">{notifToast.title}</div>
          {notifToast.body && <div className="text-[11.5px] text-[#6B7280] leading-snug mt-0.5 break-words line-clamp-2">{notifToast.body}</div>}
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); dismissNotifToast(); }}
          className="shrink-0 w-6 h-6 rounded-md bg-transparent border-none text-[#9CA3AF] hover:bg-[#F0F2F5] hover:text-[#1A1D26] cursor-pointer flex items-center justify-center transition-colors"
          title="Cerrar"
        ><X size={14} /></button>
      </div>
    </div>
  );
}
