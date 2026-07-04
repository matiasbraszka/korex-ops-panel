// Helpers para transcribir un audio suelto con la edge function transcribir-audio
// y descargar el resultado. Se usa en la bandeja de WhatsApp (botón por audio) y
// en cualquier otro lugar que quiera "audio → texto" con un click.

import { invokeTranscribir } from './api.js';

// Blob/ArrayBuffer → base64 (sin prefijo dataURL), por chunks para no reventar
// el call stack con archivos grandes.
export async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// Transcribe un audio (Blob o File) y devuelve { ok, text } | { ok:false, error }.
export async function transcribeAudioBlob(blob, filename) {
  const base64 = await blobToBase64(blob);
  const mimetype = blob.type || 'audio/ogg';
  return invokeTranscribir({ base64, mimetype, filename: filename || 'audio.ogg' });
}

// Descarga la URL de un audio (bandeja) y lo transcribe.
export async function transcribeAudioUrl(url, filename) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('fetch_failed');
  const blob = await resp.blob();
  return transcribeAudioBlob(blob, filename);
}

// Descarga un texto como archivo .txt.
export function downloadTextFile(name, text) {
  const safe = (name || 'transcripcion').replace(/[^\w\s.-]+/g, '').trim() || 'transcripcion';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe.endsWith('.txt') ? safe : `${safe}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Traduce el código de error de la función a un texto para el usuario.
export function transcribeErrorLabel(code) {
  switch (code) {
    case 'no_transcription_key': return 'Falta configurar la key de transcripción en Supabase.';
    case 'file_too_big': return 'El audio supera 25 MB (límite del servicio).';
    case 'empty_file': return 'El audio está vacío.';
    case 'rate_limited': return 'Límite temporal del servicio, probá de nuevo en unos segundos.';
    case 'timeout': return 'La transcripción tardó demasiado.';
    case 'provider_unreachable': return 'No se pudo contactar al servicio de transcripción.';
    default:
      if (typeof code === 'string' && code.startsWith('provider_')) return 'El servicio de transcripción devolvió un error.';
      return 'No se pudo transcribir el audio.';
  }
}
