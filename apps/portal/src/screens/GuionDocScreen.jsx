import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import { Loading, useAsync } from '../components/ui';
import { api } from '../data/portalApi';

const BADGE = {
  Anuncio: { bg: '#EEF2FF', color: '#2E69E0' },
  VSL: { bg: '#F5F3FF', color: '#8B5CF6' },
};

export default function GuionDocScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: g, loading } = useAsync(() => api.guion(id), [id]);

  return (
    <PhoneFrame>
      <div style={{ position: 'sticky', top: 0, background: '#F7F8FA', padding: '14px 18px 10px', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => nav(-1)} style={backBtn}>
          <ChevronLeft size={20} /> Volver
        </button>
        <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid #D0D5DD', background: '#FFFFFF', color: '#1A1D26', fontSize: 13, fontWeight: 700, borderRadius: 999, padding: '8px 12px', cursor: 'pointer' }}>
          <Download size={16} color="#5B7CF5" /> PDF
        </button>
      </div>

      {loading ? <Loading /> : !g ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No encontramos ese guion.</div>
      ) : (
        <div style={{ padding: '8px 14px 24px', overflowY: 'auto' }}>
          <div id="print-doc" style={{ background: '#FFFFFF', border: '1px solid #E2E5EB', borderRadius: 6, boxShadow: '0 4px 12px rgba(10,22,40,.06)', padding: '34px 28px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, background: (BADGE[g.tipo] || BADGE.Anuncio).bg, color: (BADGE[g.tipo] || BADGE.Anuncio).color }}>{g.tipo}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F0F2F5', padding: '3px 9px', borderRadius: 999 }}>{g.avatar}</span>
            </div>
            <h1 style={{ margin: '0 0 6px', fontSize: 27, fontWeight: 800, color: '#0A0A0A', letterSpacing: '-0.02em', lineHeight: 1.15 }}>{g.titulo}</h1>
            <div style={{ fontSize: 13, color: '#9CA3AF', paddingBottom: 18, borderBottom: '1px solid #EAECF0', marginBottom: 22 }}>Método Korex · {g.tipo} · Guion del DEL</div>

            {/* El guion COMPLETO, tal cual está en el DEL (sin recortar). */}
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 16.5, lineHeight: 1.7, color: '#1A1D26', fontFamily: 'inherit' }}>
              {(g.texto && g.texto.trim())
                ? g.texto
                : (g.bloques || []).map((b) => `${b.label}${b.marca ? ` (${b.marca})` : ''}\n${b.texto}`).join('\n\n')}
            </div>

            <div style={{ marginTop: 26, paddingTop: 18, borderTop: '1px solid #EAECF0', fontSize: 14, lineHeight: 1.6, color: '#6B7280' }}>
              Graba mirando a la cámara. No hace falta memorizar palabra por palabra: cuéntalo natural. Cuando termines, sube el video en <b style={{ color: '#5B7CF5' }}>Recursos → Grabaciones</b>.
            </div>
          </div>
        </div>
      )}
    </PhoneFrame>
  );
}

const backBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: '#5B7CF5', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: '6px 0' };
