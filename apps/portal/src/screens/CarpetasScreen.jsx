import { useNavigate } from 'react-router-dom';
import { Film, Image as ImageIcon, FolderClosed, Sparkles, ChevronRight } from 'lucide-react';
import { Screen, Card, Loading, SectionLabel, DemoBanner, useAsync } from '../components/ui';
import { api, isDemo } from '../data/portalApi';

const ICON = { film: Film, image: ImageIcon, folder: FolderClosed, sparkle: Sparkles };

export default function CarpetasScreen() {
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.carpetas(), []);
  if (loading) return <Loading label="Cargando tus carpetas…" />;
  const secciones = data || [];

  return (
    <Screen>
      {isDemo() && <DemoBanner />}
      <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.03em' }}>Carpetas</h1>
      <p style={{ margin: '0 0 22px', fontSize: 15, color: '#6B7280', lineHeight: 1.4 }}>Sube tus grabaciones y recursos aquí. Toca una carpeta para abrirla.</p>

      {secciones.map((sec) => (
        <div key={sec.key} style={{ marginBottom: 24 }}>
          <SectionLabel color={sec.labelColor}>{sec.label}</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sec.items.map((f) => {
              const Icon = ICON[f.iconKey] || FolderClosed;
              const count = f.count || 0;
              const vacia = count === 0;
              const esGrab = f.group === 'grabacion';
              const esEdit = f.group === 'ediciones';
              // Grabaciones y recursos "needed": resaltan si están vacías (falta) o completas (subido).
              const resalta = esGrab || f.needed;
              let borderColor = '#E2E5EB', borderWidth = 1, iconBg = '#F0F2F5', iconColor = '#6B7280';
              if (f.iconKey === 'film') { iconBg = '#F5F3FF'; iconColor = '#8B5CF6'; }
              if (f.iconKey === 'image') { iconBg = '#EEF2FF'; iconColor = '#2E69E0'; }
              if (esEdit) { iconBg = '#ECFDF5'; iconColor = '#16A34A'; }
              if (resalta) {
                borderWidth = 2;
                if (vacia) { borderColor = '#FDBA74'; iconBg = '#FFF7ED'; iconColor = '#F97316'; }
                else { borderColor = '#86EFAC'; iconBg = '#ECFDF5'; iconColor = '#16A34A'; }
              }
              return (
                <Card key={f.id} onClick={() => nav(`/carpetas/${f.id}`)} style={{ padding: 16, border: `${borderWidth}px solid ${borderColor}`, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 13, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={24} color={iconColor} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#1A1D26', lineHeight: 1.25 }}>{f.cardLabel}</div>
                    <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 2 }}>{vacia ? 'Vacía' : `${count} ${count === 1 ? 'archivo' : 'archivos'}`}</div>
                  </div>
                  {resalta && vacia && <span style={pill('#FFF7ED', '#F97316')}>Falta subir</span>}
                  {resalta && !vacia && <span style={pill('#ECFDF5', '#16A34A')}>Subido</span>}
                  {esEdit && count > 0 && <span style={pill('#ECFDF5', '#16A34A')}>Nuevo</span>}
                  <ChevronRight size={20} color="#C4C9D4" style={{ flexShrink: 0 }} />
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </Screen>
  );
}

const pill = (bg, color) => ({ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: bg, color, flexShrink: 0, whiteSpace: 'nowrap' });
