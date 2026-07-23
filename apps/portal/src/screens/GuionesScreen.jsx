import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, Download } from 'lucide-react';
import { Screen, Card, Loading, SectionLabel, DemoBanner } from '../components/ui';
import { api, isDemo } from '../data/portalApi';
import { useAsync } from '../components/ui';

export const BADGE = {
  Anuncio: { bg: '#EEF2FF', color: '#2E69E0' },
  VSL: { bg: '#F5F3FF', color: '#8B5CF6' },
};

export default function GuionesScreen() {
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.guiones(), []);
  const [guiones, setGuiones] = useState([]);

  useEffect(() => { if (data) setGuiones(data); }, [data]);

  if (loading) return <Loading label="Cargando tus guiones…" />;

  const toggle = async (g) => {
    const next = !g.grabado;
    setGuiones((prev) => prev.map((x) => (x.id === g.id ? { ...x, grabado: next } : x)));
    try { await api.toggleGuion(g.id, next); }
    catch { setGuiones((prev) => prev.map((x) => (x.id === g.id ? { ...x, grabado: !next } : x))); }
  };

  const porGrabar = guiones.filter((g) => !g.grabado);
  const grabados = guiones.filter((g) => g.grabado);
  const grupos = [
    { label: 'Por grabar', color: '#F97316', items: porGrabar },
    { label: 'Ya grabados', color: '#16A34A', items: grabados },
  ];

  return (
    <Screen>
      {isDemo() && <DemoBanner />}
      <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.03em' }}>Guiones</h1>
      <p style={{ margin: '0 0 20px', fontSize: 15, color: '#6B7280', lineHeight: 1.4 }}>Tocá el círculo cuando ya lo grabaste, o abrí cualquiera para leerlo.</p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <Stat n={porGrabar.length} label="Por grabar" color="#F97316" />
        <Stat n={`${grabados.length} / ${guiones.length}`} label="Ya grabados" color="#16A34A" />
      </div>

      {grupos.map((grp) => grp.items.length > 0 && (
        <div key={grp.label} style={{ marginBottom: 22 }}>
          <SectionLabel color={grp.color}>{grp.label}</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {grp.items.map((g) => {
              const badge = BADGE[g.tipo] || BADGE.Anuncio;
              return (
                <Card key={g.id} onClick={() => nav(`/guiones/${g.id}`)} style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggle(g); }}
                    aria-label="Marcar grabado"
                    style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${g.grabado ? '#22C55E' : '#D0D5DD'}`, background: g.grabado ? '#22C55E' : '#FFFFFF' }}
                  >
                    <Check size={18} color="#FFFFFF" strokeWidth={3.5} style={{ opacity: g.grabado ? 1 : 0 }} />
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, background: badge.bg, color: badge.color }}>{g.tipo}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F0F2F5', padding: '3px 9px', borderRadius: 999 }}>{g.avatar}</span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: g.grabado ? '#9CA3AF' : '#1A1D26', lineHeight: 1.3, textDecoration: g.grabado ? 'line-through' : 'none' }}>{g.titulo}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{g.grabado ? `Grabado ✓ · ${g.dur}` : `Guion listo · ${g.fecha}`}</div>
                  </div>
                  <ChevronRight size={20} color="#C4C9D4" style={{ flexShrink: 0 }} />
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      <button onClick={() => window.print()} style={{ width: '100%', height: 54, borderRadius: 14, border: '1px solid #D0D5DD', background: '#FFFFFF', color: '#1A1D26', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 6 }}>
        <Download size={20} color="#5B7CF5" /> Descargar todos los guiones (PDF)
      </button>

      <PrintDoc guiones={guiones} />
    </Screen>
  );
}

function Stat({ n, label, color }) {
  return (
    <div style={{ flex: 1, background: '#FFFFFF', border: '1px solid #E2E5EB', borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
      <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function PrintDoc({ guiones }) {
  return (
    <div id="print-doc" style={{ fontFamily: 'Inter, sans-serif', color: '#0A0A0A', padding: 20 }}>
      <h1 style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 26, margin: '0 0 4px' }}>Guiones para grabar</h1>
      <p style={{ margin: '0 0 22px', color: '#555', fontSize: 13 }}>Método Korex · documento generado desde tu plataforma</p>
      {guiones.map((g) => (
        <div key={g.id} style={{ pageBreakInside: 'avoid', marginBottom: 26, paddingBottom: 18, borderBottom: '1px solid #ddd' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#5B7CF5' }}>{g.tipo} · {g.avatar} · {g.dur}</div>
          <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontSize: 19, margin: '4px 0 12px' }}>{g.titulo}</h2>
          {(g.bloques || []).map((b, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888' }}>{b.label} · {b.marca}</div>
              <p style={{ margin: '3px 0 0', fontSize: 14, lineHeight: 1.5 }}>{b.texto}</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
