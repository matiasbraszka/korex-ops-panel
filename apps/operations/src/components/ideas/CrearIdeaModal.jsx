import { useState, useEffect } from 'react';
import Modal from '../Modal';
import { useApp } from '../../context/AppContext';

const DEPARTMENTS = [
  { key: 'marketing',   label: 'Marketing',    color: '#5B7CF5' },
  { key: 'operaciones', label: 'Operaciones',  color: '#22C55E' },
  { key: 'ventas',      label: 'Ventas',       color: '#F97316' },
  { key: 'finanzas',    label: 'Finanzas',     color: '#EAB308' },
  { key: 'legalidad',   label: 'Legalidad',    color: '#8B5CF6' },
];

export default function CrearIdeaModal({ open, onClose, idea = null }) {
  const { currentUser, addIdea, updateIdea } = useApp();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('operaciones');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const editing = !!idea;

  useEffect(() => {
    if (open) {
      setTitle(idea?.title || '');
      setDescription(idea?.description || '');
      setDepartment(idea?.department || 'operaciones');
      setError('');
    }
  }, [open, idea]);

  const isValid = () => title.trim().length > 0 && department && currentUser?.id;

  const handleSubmit = async () => {
    if (!isValid()) return;
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateIdea(idea.id, {
          title: title.trim(),
          description: description.trim(),
          department,
        });
      } else {
        await addIdea({
          title: title.trim(),
          description: description.trim(),
          department,
          author_id: currentUser.id,
        });
      }
      onClose();
    } catch (e) {
      setError('Error al guardar: ' + (e?.message || e));
    }
    setSaving(false);
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={editing ? 'Editar idea' : 'Nueva idea'}
      maxWidth={500}
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
            disabled={!isValid() || saving}
            className="py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white text-[13px] font-semibold rounded-lg border-none cursor-pointer font-sans disabled:opacity-40"
          >{saving ? 'Guardando...' : (editing ? 'Guardar' : 'Crear idea')}</button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Título</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ej: Automatizar el seguimiento post-venta"
            autoFocus
            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1">Descripción (opcional)</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Detalles, contexto o por qué la proponés..."
            rows={4}
            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[13px] font-sans outline-none focus:border-blue-400 resize-y"
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-gray-500 mb-1.5">Departamento</label>
          <div className="flex flex-wrap gap-1.5">
            {DEPARTMENTS.map(d => (
              <button
                key={d.key}
                type="button"
                onClick={() => setDepartment(d.key)}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border cursor-pointer font-sans transition-colors ${
                  department === d.key ? 'text-white border-transparent' : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
                style={department === d.key ? { background: d.color, color: 'white' } : { color: d.color }}
              >{d.label}</button>
            ))}
          </div>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-[12px] rounded-md py-2 px-3">{error}</div>
        )}
      </div>
    </Modal>
  );
}
