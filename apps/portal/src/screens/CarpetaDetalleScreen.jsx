import { useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Upload, Check, Loader2, Film, Image as ImageIcon, FolderOpen } from 'lucide-react';
import PhoneFrame from '../components/PhoneFrame';
import { useAsync } from '../components/ui';
import { api, isDemo, uploadRecurso, simulateUpload } from '../data/portalApi';
import { RECURSO_FOLDERS } from '../data/mockData';

let _uid = 0;
const isVideo = (f) => (f.type || '').startsWith('video');

export default function CarpetaDetalleScreen() {
  // `fid` = el funnel desde el que se abrió (si vino de un funnel): con eso la
  // subida cae en la carpeta REAL de ese funnel en operaciones (vsl_rec/ad_rec…).
  const { id, fid } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const inputRef = useRef(null);

  const { data: detalle, reload } = useAsync(() => api.carpeta(id, fid || null), [id, fid]);
  const [uploads, setUploads] = useState([]);

  // El nombre viaja desde la pantalla del funnel; fallbacks para links directos.
  const recurso = RECURSO_FOLDERS.find((f) => f.id === String(id));
  const title = location.state?.label || recurso?.label
    || (String(id) === 'vsl_rec' ? 'Grabaciones · VSL' : String(id).startsWith('ad_rec__') ? 'Grabaciones · Anuncios' : 'Subir archivos');
  const items = detalle?.items || [];
  const demo = isDemo();

  const onPick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    files.forEach((file) => {
      const uid = `u${++_uid}`;
      const entry = { uid, name: file.name, kind: isVideo(file) ? 'video' : 'image', pct: 0, done: false, error: false };
      setUploads((prev) => [entry, ...prev]);

      const onProgress = (frac) => setUploads((prev) => prev.map((u) => (u.uid === uid ? { ...u, pct: Math.round(frac * 100) } : u)));
      const markDone = () => { setUploads((prev) => prev.map((u) => (u.uid === uid ? { ...u, pct: 100, done: true } : u))); reload?.(); };
      const markError = () => setUploads((prev) => prev.map((u) => (u.uid === uid ? { ...u, error: true } : u)));

      if (demo) {
        simulateUpload(file, onProgress, markDone);
      } else {
        uploadRecurso(id, file, onProgress, { strategyId: fid || null }).then(markDone).catch((err) => { console.warn('upload error', err); markError(); });
      }
    });
  };

  return (
    <PhoneFrame>
      <div style={{ position: 'sticky', top: 0, background: '#F7F8FA', padding: '14px 18px 10px', zIndex: 10 }}>
        <button onClick={() => nav(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: '#5B7CF5', fontSize: 16, fontWeight: 600, cursor: 'pointer', padding: '6px 0' }}>
          <ChevronLeft size={20} /> Volver
        </button>
      </div>

      <div style={{ padding: '4px 18px 24px', overflowY: 'auto' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: '#1A1D26', letterSpacing: '-0.02em' }}>{title}</h1>
        <p style={{ margin: '0 0 18px', fontSize: 14, color: '#6B7280' }}>{items.length === 0 ? 'Vacía · todavía sin archivos' : `${items.length} ${items.length === 1 ? 'archivo' : 'archivos'}`}</p>

        <label style={{ width: '100%', minHeight: 120, borderRadius: 16, border: '2px dashed #B9C4E8', background: '#F5F7FF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', marginBottom: 20, padding: 16 }}>
          <input ref={inputRef} type="file" multiple onChange={onPick} accept="image/*,video/*" style={{ display: 'none' }} />
          <Upload size={34} color="#5B7CF5" />
          <span style={{ fontSize: 17, fontWeight: 700, color: '#5B7CF5' }}>Subir archivos</span>
          <span style={{ fontSize: 13, color: '#6B7280' }}>Fotos o videos desde tu teléfono</span>
        </label>

        {uploads.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <Label>Subidas</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {uploads.map((u) => (
                <div key={u.uid} style={{ background: '#FFFFFF', border: '1px solid #E2E5EB', borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: u.kind === 'video' ? '#F5F3FF' : '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {u.kind === 'video' ? <Film size={20} color="#8B5CF6" /> : <ImageIcon size={20} color="#2E69E0" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: '#1A1D26', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: u.error ? '#DC2626' : u.done ? '#16A34A' : '#5B7CF5' }}>
                        {u.error ? 'No se pudo subir · reintenta' : u.done ? 'Subido correctamente' : `Subiendo… ${u.pct}%`}
                      </div>
                    </div>
                    <div style={{ width: 28, height: 28, borderRadius: 999, background: u.done ? '#22C55E' : '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {u.done ? <Check size={16} color="#FFFFFF" strokeWidth={3.5} /> : <Loader2 size={15} color="#5B7CF5" className="mk-spin" />}
                    </div>
                  </div>
                  {!u.done && !u.error && (
                    <div style={{ height: 8, borderRadius: 999, background: '#F0F2F5', overflow: 'hidden', marginTop: 12 }}>
                      <div style={{ height: '100%', borderRadius: 999, background: '#5B7CF5', width: `${u.pct}%`, transition: 'width .2s ease' }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {items.length > 0 ? (
          <div>
            <Label>En esta carpeta</Label>
            <div className="mk-mediagrid">
              {items.map((t, i) => (
                <a key={t.id || i} href={t.public_url || t.url || '#'} target="_blank" rel="noreferrer" style={{ aspectRatio: '1', borderRadius: 12, background: i % 2 ? '#F0F2F5' : '#F7F8FA', border: '1px solid #E2E5EB', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', overflow: 'hidden' }}>
                  {(t.kind === 'image' && (t.public_url || t.url))
                    ? <img src={t.public_url || t.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (t.kind === 'video' ? <Film size={26} color="#B9C0CC" /> : <ImageIcon size={26} color="#B9C0CC" />)}
                </a>
              ))}
            </div>
          </div>
        ) : uploads.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 20px', color: '#9CA3AF' }}>
            <FolderOpen size={40} color="#C4C9D4" style={{ marginBottom: 10 }} />
            <p style={{ margin: 0, fontSize: 15 }}>Todavía no hay archivos aquí.<br />Toca <b style={{ color: '#5B7CF5' }}>Subir archivos</b> para empezar.</p>
          </div>
        )}
      </div>
    </PhoneFrame>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9CA3AF', margin: '0 2px 12px' }}>{children}</div>;
}
