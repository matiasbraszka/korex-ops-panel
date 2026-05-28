import { useState, useEffect, useMemo } from 'react';
import { Check } from 'lucide-react';
import Modal from '../Modal';
import { useApp } from '../../context/AppContext';
import RichTextEditor from './RichTextEditor';
import TagInput from './TagInput';
import SharePicker from './SharePicker';
import { sanitizeNoteHtml } from './sanitize';
import { NOTE_COLORS, NOTE_COLOR_KEYS, getNoteColor } from './colors';

// Modal de crear/editar nota. Mismo patron que CrearInformeModal/CrearIdeaModal:
// - dismissOnOverlay/Escape: false (no se cierra por accidente).
// - Validacion explicita (no boton silent disabled).

export default function CrearNotaModal({ open, onClose, note = null }) {
  const { currentUser, teamMembers, notas, addNota, updateNota } = useApp();
  const editing = !!note;

  const [title, setTitle] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [tags, setTags] = useState([]);
  const [shareWithIds, setShareWithIds] = useState([]);
  const [color, setColor] = useState('white');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(note?.title || '');
    setBodyHtml(note?.body_html || '');
    setTags(Array.isArray(note?.tags) ? note.tags : []);
    setShareWithIds(Array.isArray(note?.share_with_ids) ? note.share_with_ids : []);
    setColor(note?.color || 'white');
    setError('');
  }, [open, note]);

  // Tags ya usados por todo el equipo para sugerirlos como chips clickeables.
  const knownTags = useMemo(() => {
    const set = new Set();
    (notas || []).forEach((n) => (n.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [notas]);

  const isValid = () => title.trim().length > 0 && !!currentUser?.id;

  const handleSubmit = async () => {
    if (!isValid()) {
      setError('Falta el título de la nota.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const cleanBody = sanitizeNoteHtml(bodyHtml || '');
      if (editing) {
        await updateNota(note.id, {
          title: title.trim(),
          body_html: cleanBody,
          tags,
          share_with_ids: shareWithIds,
          color,
        });
      } else {
        await addNota({
          title: title.trim(),
          body_html: cleanBody,
          tags,
          share_with_ids: shareWithIds,
          author_id: currentUser.id,
          color,
          _allNotas: notas || [],
        });
      }
      onClose();
    } catch (e) {
      setError('Error al guardar: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const authorId = note?.author_id || currentUser?.id;

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={editing ? 'Editar nota' : 'Nueva nota'}
      maxWidth={620}
      dismissOnOverlay={false}
      dismissOnEscape={false}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="py-2 px-4 bg-transparent border border-gray-200 text-gray-600 text-[13px] rounded-lg cursor-pointer font-sans hover:bg-gray-50 disabled:opacity-40"
          >Cancelar</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white text-[13px] font-semibold rounded-lg border-none cursor-pointer font-sans disabled:opacity-40"
          >{saving ? 'Guardando…' : (editing ? 'Guardar cambios ✓' : 'Crear nota ✓')}</button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Título *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej: Estrategia Q3, ideas para onboarding, reunion semanal…"
            autoFocus
            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Contenido</label>
          <RichTextEditor value={bodyHtml} onChange={setBodyHtml} placeholder="Empezá a escribir. Usá la barra de arriba para títulos, negritas y listas." />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Color</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {NOTE_COLOR_KEYS.map(k => {
              const c = getNoteColor(k);
              const selected = color === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setColor(k)}
                  title={c.label}
                  className={`w-7 h-7 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all ${selected ? 'scale-110 shadow-md' : 'hover:scale-105'}`}
                  style={{ background: c.bg, borderColor: selected ? c.dot : c.border }}
                >
                  {selected && <Check size={12} style={{ color: c.dot }} strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Tags (categorías libres)</label>
          <TagInput tags={tags} onChange={setTags} suggestions={knownTags} />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Compartir con</label>
          <SharePicker
            selectedIds={shareWithIds}
            onChange={setShareWithIds}
            teamMembers={teamMembers || []}
            excludeIds={authorId ? [authorId] : []}
            placeholder="Solo yo (privada)"
          />
        </div>

        <div className="text-[10.5px] text-gray-400 leading-relaxed">
          La nota la ven: vos, las personas con las que la compartas y los admins.
          El contenido se limpia automáticamente antes de guardar.
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-[12px] rounded-md py-2 px-3 whitespace-pre-line">{error}</div>
        )}
      </div>
    </Modal>
  );
}
