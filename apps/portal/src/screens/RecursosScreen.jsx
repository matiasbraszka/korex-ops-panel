import { useNavigate } from 'react-router-dom';
import { ChevronRight, Upload, Check, Award, Package, Sun, Palette, Building2 } from 'lucide-react';
import { Screen, Card, Loading, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';

// Carpetas de material de MARCA (a nivel cliente: se comparten entre todos los
// funnels). Las grabaciones y los testimonios viven adentro de cada funnel.
const CARPETAS = [
  { id: 'branding', label: 'Branding (colores, logo)', Icon: Palette, color: '#7C3AED', bg: '#EDE9FE', required: true },
  { id: 'autoridad', label: 'Fotos de Autoridad', Icon: Award, color: '#D97706', bg: '#FEF3C7' },
  { id: 'productos', label: 'Foto de productos', Icon: Package, color: '#059669', bg: '#D1FAE5' },
  { id: 'estilo', label: 'Fotos Estilo de vida', Icon: Sun, color: '#E11D48', bg: '#FFE4E6' },
  { id: 'empresa', label: 'Material de la empresa', Icon: Building2, color: '#0D9488', bg: '#CCFBF1' },
];

export default function RecursosScreen() {
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.recursos(), []);
  if (loading) return <Loading label="Cargando tus recursos…" />;
  const counts = data || {};

  return (
    <Screen>
      {isDemo() && <DemoBanner />}
      <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.03em' }}>Recursos</h1>
      <p style={{ margin: '0 0 20px', fontSize: 15, color: '#6B7280', lineHeight: 1.4 }}>Fotos y materiales de tu marca. Se usan en todos tus funnels: toca una carpeta para subir.</p>

      <div className="mk-grid2">
        {CARPETAS.map((f) => {
          const count = counts[f.id] || 0;
          const filled = count > 0;
          const falta = !filled && f.required;
          return (
            <Card key={f.id} onClick={() => nav(`/carpetas/${f.id}`, { state: { label: f.label } })} style={{ padding: 15, display: 'flex', alignItems: 'center', gap: 13, background: falta ? '#FFFBEB' : '#FFFFFF', border: `1px solid ${falta ? '#FDE68A' : '#E2E5EB'}` }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <f.Icon size={22} color={f.color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: '#1A1D26', lineHeight: 1.25 }}>{f.label}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 2, color: filled ? '#059669' : falta ? '#B45309' : '#9CA3AF' }}>
                  {filled ? `${count} ${count === 1 ? 'archivo' : 'archivos'} · subido` : falta ? 'Vacía · falta subir' : 'Vacía'}
                </div>
              </div>
              {filled ? (
                <div style={{ width: 26, height: 26, borderRadius: 999, background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={15} color="#FFFFFF" strokeWidth={3.5} /></div>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: falta ? '#B45309' : f.color, flexShrink: 0 }}><Upload size={15} /> Subir</div>
              )}
              <ChevronRight size={18} color="#C4C9D4" style={{ flexShrink: 0 }} />
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}
