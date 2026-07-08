// Acceso de invitados por CÓDIGO (sin correo). Un invitado entra escribiendo
// solo un código; ese código ES su credencial. Por detrás se crea una cuenta de
// Supabase con un correo "inventado" derivado del código (que el invitado nunca
// ve) y con el mismo código como contraseña. Así el login es un único campo.
//
// El código tiene que ser ÚNICO por persona: es lo que identifica al invitado
// (dos personas con el mismo código serían la misma cuenta y verían lo mismo).

export const GUEST_EMAIL_DOMAIN = 'invitados.metodokorex.com';

// Normaliza el código: minúsculas, sin espacios. Se aplica al crear y al entrar
// para que el correo derivado y la contraseña siempre coincidan.
export function normalizeGuestCode(code) {
  return String(code || '').trim().toLowerCase().replace(/\s+/g, '');
}

// Correo sintético derivado del código (nunca se le muestra al invitado).
export function guestEmailForCode(code) {
  return `${normalizeGuestCode(code)}@${GUEST_EMAIL_DOMAIN}`;
}

// Genera un código legible de 8 caracteres, sin caracteres ambiguos (0/o/1/l/i)
// para que sea fácil de dictar por WhatsApp. Supabase exige contraseña ≥ 6;
// 8 cubre cualquier política. No usa Math.random de forma sensible a seguridad
// crítica, pero es suficiente para un acceso acotado de solo-lectura de tareas.
export function generateGuestCode() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
