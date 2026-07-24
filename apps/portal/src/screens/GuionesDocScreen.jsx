import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import { Loading, useAsync } from '../components/ui';
import { api } from '../data/portalApi';

// Muestra TODOS los guiones de un tipo (Anuncios o VSL) en UN solo documento,
// tal cual aparecen en el DEL (texto completo, con sus hooks y todo).
const META = {
  anuncios: { titulo: 'Anuncios para grabar', match: (g) => g.tipo !== 'VSL', badge: { bg: '#EEF2FF', color: '#2E69E0' }, label: 'ANUNCIOS' },
  vsl: { titulo: 'VSL para grabar', match: (g) => g.tipo === 'VSL', badge: { bg: '#F5F3FF', color: '#8B5CF6' }, label: 'VSL' },
};

export default function GuionesDocScreen() {
  const { id, tipo } = useParams();
  const nav = useNavigate();
  const meta = META[tipo] || META.anuncios;
  const { data, loading } = useAsync(() => api.funnel(id), [id]);

  const guiones = (data?.guiones || []).filter(meta.match);

  return (
    <PhoneFrame>
      <div style={{ position: 'sticky', top: 0, background: '#F7F8FA', padding: '14px 18px 10px', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => nav(-1)} style={backBtn}><ChevronLeft size={20} /> Volver</button>
        <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #D0D5DD', background: '#FFFFFF', color: '#1A1D26', fontSize: 13, fontWeight: 700, borderRadius: 999, padding: '8px 12px', cursor: 'pointer' }}>
          <Download size={16} color="#5B7CF5" /> PDF
        </button>
      </div>

      {loading ? <Loading /> : guiones.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Todavía no hay guiones aquí.</div>
      ) : (
        <div style={{ padding: '8px 14px 24px', overflowY: 'auto' }}>
          <div id="print-doc" style={{ background: '#FFFFFF', border: '1px solid #E2E5EB', borderRadius: 6, boxShadow: '0 4px 12px rgba(10,22,40,.06)', padding: '32px 26px 40px' }}>
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, background: meta.badge.bg, color: meta.badge.color, marginBottom: 12 }}>{meta.label}</span>
            <h1 style={{ margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#0A0A0A', letterSpacing: '-0.02em', lineHeight: 1.15 }}>{meta.titulo}</h1>
            <div style={{ fontSize: 13, color: '#9CA3AF', paddingBottom: 18, borderBottom: '1px solid #EAECF0', marginBottom: 8 }}>
              {data?.name ? `${data.name} · ` : ''}{guiones.length} {guiones.length === 1 ? 'guion' : 'guiones'} · texto completo del DEL
            </div>

            {guiones.map((g, i) => {
              const texto = (g.texto && g.texto.trim())
                ? g.texto
                : (g.bloques || []).map((b) => `${b.label}${b.marca ? ` (${b.marca})` : ''}\n${b.texto}`).join('\n\n');
              return (
                <div key={g.id} style={{ paddingTop: i === 0 ? 20 : 30, marginTop: i === 0 ? 0 : 12, borderTop: i === 0 ? 'none' : '2px solid #EEF0F4' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: meta.badge.color, marginBottom: 4 }}>{meta.label} {guiones.length > 1 ? i + 1 : ''}</div>
                  <h2 style={{ margin: '0 0 14px', fontSize: 20, fontWeight: 800, color: '#0A0A0A', letterSpacing: '-0.01em' }}>{g.titulo}</h2>
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 16, lineHeight: 1.7, color: '#1A1D26' }}>{texto}</div>
                </div>
              );
            })}

            <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid #EAECF0', fontSize: 14, lineHeight: 1.6, color: '#6B7280' }}>
              Graba mirando a la cámara, natural, con tus palabras. Cuando termines, sube los videos en <b style={{ color: '#5B7CF5' }}>Recursos → Grabaciones</b>.
            </div>
          </div>
        </div>
      )}
    </PhoneFrame>
  );
}

const backBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: '#5B7CF5', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: '6px 0' };
