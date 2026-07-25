/* Iconos del prototipo "Portal Korex", con los MISMOS paths SVG (son de la
   familia lucide pero fijados a la versión del prototipo, para que el trazo
   sea idéntico). Cada icono acepta size / stroke / sw (strokeWidth) / style. */

const S = ({ size = 20, stroke = 'currentColor', sw = 2, fill = 'none', style, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={fill === 'none' ? stroke : 'none'}
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
    {children}
  </svg>
);

export const IcoHome = (p) => <S {...p}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></S>;
export const IcoDoc = (p) => <S {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h6" /><path d="M8 13h8" /><path d="M8 17h5" /></S>;
export const IcoFile = (p) => <S {...p}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v5h6" /></S>;
export const IcoEmbudos = (p) => <S {...p}><path d="M3 5h18" /><path d="M6 12h12" /><path d="M10 19h4" /></S>;
export const IcoUpload = (p) => <S {...p}><path d="M12 13v8" /><path d="M4 14.9A5 5 0 0 1 7 6a6 6 0 0 1 11.6 1.6A4.5 4.5 0 0 1 18 21" /><path d="m8 17 4-4 4 4" /></S>;
export const IcoCheck = (p) => <S {...p}><path d="M20 6 9 17l-5-5" /></S>;
export const IcoX = (p) => <S {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></S>;
export const IcoChevR = (p) => <S {...p}><path d="m9 18 6-6-6-6" /></S>;
export const IcoChevL = (p) => <S {...p}><path d="m15 18-6-6 6-6" /></S>;
export const IcoArrowR = (p) => <S {...p}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></S>;
export const IcoArrowUp = (p) => <S {...p}><path d="M12 5v14" transform="rotate(180 12 12)" /><path d="m5 12 7-7 7 7" /></S>;
export const IcoClock = (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>;
export const IcoInfo = (p) => <S {...p}><path d="M12 8v8" /><path d="M8 12h8" /><circle cx="12" cy="12" r="9" /></S>;
export const IcoWarn = (p) => <S {...p}><path d="M12 9v4" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="9" /></S>;
export const IcoVideo = (p) => <S {...p}><path d="m22 8-6 4 6 4V8Z" /><rect width="14" height="12" x="2" y="6" rx="2" /></S>;
export const IcoImage = (p) => <S {...p}><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></S>;
export const IcoKey = (p) => <S {...p}><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3" /></S>;
export const IcoMenu = (p) => <S {...p}><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></S>;
export const IcoCopy = (p) => <S {...p}><rect width="13" height="13" x="9" y="9" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></S>;
export const IcoComment = (p) => <S {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></S>;
export const IcoExternal = (p) => <S {...p}><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></S>;
export const IcoPlay = ({ size = 24, fill = '#fff', style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="none" style={style} aria-hidden="true"><path d="m9 7 9 5-9 5V7Z" /></svg>
);
export const IcoPlaySoft = (p) => <S {...p}><path d="m10 8 6 4-6 4V8Z" /></S>;
export const IcoFolder = (p) => <S {...p}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></S>;
export const IcoPalette = (p) => <S {...p}><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></S>;

/* ── Onboarding ─────────────────────────────────────────────────────────────
   El micrófono es el icono más importante de todo el onboarding: es lo que
   hace que el cliente cuente su historia en dos minutos en vez de escribir
   tres líneas. */
export const IcoMic = (p) => <S {...p}><rect width="6" height="12" x="9" y="2" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1" /><path d="M12 18v4" /></S>;
export const IcoLock = (p) => <S {...p}><rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></S>;
export const IcoCalendar = (p) => <S {...p}><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /><path d="M8 2v4" /><path d="M16 2v4" /></S>;
export const IcoTrofeo = (p) => <S {...p}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></S>;
export const IcoPausa = (p) => <S {...p}><rect width="4" height="16" x="6" y="4" rx="1" /><rect width="4" height="16" x="14" y="4" rx="1" /></S>;
export const IcoBasura = (p) => <S {...p}><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></S>;
export const IcoSparkle = (p) => <S {...p}><path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="m5.6 5.6 2.8 2.8" /><path d="m15.6 15.6 2.8 2.8" /><path d="m18.4 5.6-2.8 2.8" /><path d="m8.4 15.6-2.8 2.8" /></S>;
