import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, AlertCircle, Upload, Check, Megaphone, Clapperboard, Video, Camera, Film, Sparkles, Award, Package, Sun, Palette, Building2, MessageSquareQuote, KeyRound } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import { Loading, SectionLabel, useAsync } from '../components/ui';
import { api } from '../data/portalApi';
import { RECURSO_SECTIONS } from '../data/mockData';

// Cada carpeta tiene su ícono propio (sin repetir) para jerarquizar el contenido.
const ICON = { video: Video, camera: Camera, film: Film, sparkles: Sparkles, award: Award, package: Package, sun: Sun, palette: Palette, building: Building2, quote: MessageSquareQuote, key: KeyRound };

export default function FunnelScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, loading } = useAsync(() => api.funnel(id), [id]);

  const guiones = data?.guiones || [];
  const hayAnuncios = guiones.some((g) => g.tipo !== 'VSL');
  const hayVsl = guiones.some((g) => g.tipo === 'VSL');
  const pendientes = (data?.pendientes || []).filter((p) => !p.ok);
  const enConstruccion = data?.status === 'borrador';

  return (
    <PhoneFrame>
      <div style={{ position: 'sticky', top: 0, background: '#F7F8FA', padding: '14px 18px 10px', zIndex: 10 }}>
        <button onClick={() => nav('/')} style={backBtn}><ChevronLeft size={20} /> Funnels</button>
      </div>

      {loading ? <Loading label="Abriendo el funnel…" /> : !data ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No encontramos ese funnel.</div>
      ) : (
        <div style={{ padding: '4px 18px 28px', overflowY: 'auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, marginBottom: 10, background: enConstruccion ? '#FFF7ED' : '#ECFDF5', color: enConstruccion ? '#C2410C' : '#059669' }}>
            {data.estadoLabel || (enConstruccion ? 'En construcción' : 'Activo')}
          </div>
          <h1 style={{ margin: '0 0 20px', fontSize: 25, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.02em', lineHeight: 1.2 }}>{data.name}</h1>

          {/* Pendientes del funnel */}
          {pendientes.length > 0 && (
            <div style={{ marginBottom: 24, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#B45309', fontSize: 15, fontWeight: 800 }}>
                <AlertCircle size={18} /> Lo que necesitamos de vos
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendientes.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: '#78350F' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: '#F59E0B', flexShrink: 0 }} /> {p.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Guiones: un documento por tipo. Solo aparecen si hay algo para grabar. */}
          {(hayAnuncios || hayVsl) && (
            <>
              <SectionLabel color="#5B7CF5">Guiones para grabar</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 6 }}>
                {hayAnuncios && (
                  <GuionDocCard Icon={Megaphone} color="#2E69E0" bg="#EEF2FF" titulo="Anuncios para grabar" sub="Todos los anuncios, texto completo" onOpen={() => nav(`/funnel/${id}/guiones/anuncios`)} />
                )}
                {hayVsl && (
                  <GuionDocCard Icon={Clapperboard} color="#8B5CF6" bg="#F5F3FF" titulo="VSL para grabar" sub="El guion completo del VSL" onOpen={() => nav(`/funnel/${id}/guiones/vsl`)} />
                )}
              </div>
            </>
          )}

          {/* Recursos: SIEMPRE habilitados, segmentados y con color/ícono propio */}
          {RECURSO_SECTIONS.map((sec) => {
            const SecIcon = ICON[sec.iconKey] || Sparkles;
            return (
              <div key={sec.titulo} style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 2px 12px' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: sec.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SecIcon size={19} color={sec.color} />
                  </div>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1A1D26', lineHeight: 1.1 }}>{sec.titulo}</div>
                    <div style={{ fontSize: 12.5, color: '#9CA3AF' }}>{sec.sub}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sec.items.map((f) => {
                    const Ico = ICON[f.iconKey] || Package;
                    const count = (data?.recursos && data.recursos[f.id]) || 0;
                    const filled = count > 0;
                    const falta = !filled && f.required;
                    return (
                      <div key={f.id} onClick={() => nav(`/carpetas/${f.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: falta ? '#FFFBEB' : '#FFFFFF', border: `1px solid ${falta ? '#FDE68A' : '#E2E5EB'}`, borderRadius: 14, padding: 14, cursor: 'pointer' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 11, background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Ico size={20} color={f.color} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1D26' }}>{f.label}</div>
                          <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 2, color: filled ? '#059669' : falta ? '#B45309' : '#9CA3AF' }}>
                            {filled ? `${count} ${count === 1 ? 'archivo' : 'archivos'} · subido` : falta ? 'Vacía · falta subir' : 'Vacía'}
                          </div>
                        </div>
                        {filled ? (
                          <div style={{ width: 26, height: 26, borderRadius: 999, background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={15} color="#FFFFFF" strokeWidth={3.5} /></div>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: falta ? '#B45309' : f.color, flexShrink: 0 }}><Upload size={15} /> Subir</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PhoneFrame>
  );
}

function GuionDocCard({ Icon, color, bg, titulo, sub, onOpen }) {
  return (
    <div onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 13, background: '#FFFFFF', border: '1px solid #E2E5EB', borderRadius: 16, boxShadow: '0 1px 2px rgba(10,22,40,.04)', padding: 16, cursor: 'pointer' }}>
      <div style={{ width: 46, height: 46, borderRadius: 12, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={23} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16.5, fontWeight: 800, color: '#1A1D26', lineHeight: 1.2 }}>{titulo}</div>
        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>{sub}</div>
      </div>
      <ChevronRight size={20} color="#C4C9D4" style={{ flexShrink: 0 }} />
    </div>
  );
}

const backBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: '#5B7CF5', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: '6px 0' };
