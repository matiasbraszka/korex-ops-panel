import { useState } from 'react';
import TeamAvatar from '../TeamAvatar';
import CommentInput from './CommentInput';

// Helpers de fecha — replican los de EquipoPage para no acoplar.
function fmtRelative(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'recién';
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)}h`;
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays === 1) return 'ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function fmtAbsolute(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleString('es-AR', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

// CommentItem — render de un comentario + acciones segun permisos.
// Reutilizable para raiz y respuesta (replies se pasan como children desde
// el panel para no acoplar la logica de threading aca).

export default function CommentItem({
  comment,
  author,        // team_member { name, color, initials, avatar_url } o null si fue dado de baja
  isReply = false,
  canReply = false,
  canEdit = false,
  canDelete = false,
  onReply,       // (parentId) => abre input de respuesta
  onUpdate,      // (id, body) => Promise — guarda edicion
  onDelete,      // (id) => Promise
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(comment.body || '');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const startEdit = () => {
    setEditValue(comment.body || '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditValue('');
  };

  const handleSaveEdit = async () => {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      await onUpdate(comment.id, editValue.trim());
      setEditing(false);
    } catch (e) {
      alert('No se pudo guardar la edición. Reintentá.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDelete(comment.id);
      // No reseteamos saving porque el componente desaparece.
    } catch (e) {
      setSaving(false);
      setConfirmingDelete(false);
      alert('No se pudo borrar. Reintentá.');
    }
  };

  return (
    <div className={`group flex gap-2 ${isReply ? 'ml-7' : ''}`}>
      <div className="shrink-0 mt-0.5">
        {author ? (
          <TeamAvatar
            member={{ ...author, avatar: author.avatar_url || author.avatar }}
            size={isReply ? 22 : 26}
          />
        ) : (
          <div className={`${isReply ? 'w-[22px] h-[22px]' : 'w-[26px] h-[26px]'} rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold flex items-center justify-center`}>
            ?
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[12px] font-semibold text-gray-800">
            {author?.name || 'Usuario eliminado'}
          </span>
          <span
            className="text-[10.5px] text-gray-400"
            title={fmtAbsolute(comment.created_at)}
          >
            {fmtRelative(comment.created_at)}
          </span>
          {comment.edited && (
            <span
              className="text-[10px] text-gray-400 italic"
              title={'Editado · ' + fmtAbsolute(comment.updated_at)}
            >(editado)</span>
          )}
        </div>

        {editing ? (
          <div className="mt-1">
            <CommentInput
              value={editValue}
              onChange={setEditValue}
              onSubmit={handleSaveEdit}
              onCancel={cancelEdit}
              saving={saving}
              autoFocus
              showCancel
              submitLabel="Guardar"
              placeholder="Editá tu comentario…"
            />
          </div>
        ) : (
          <div className="text-[12.5px] text-gray-700 whitespace-pre-wrap break-words mt-0.5 leading-relaxed">
            {comment.body}
          </div>
        )}

        {!editing && (
          <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canReply && (
              <button
                type="button"
                onClick={() => onReply(comment.id)}
                className="text-[11px] text-gray-500 hover:text-blue-600 bg-transparent border-none cursor-pointer p-0 font-semibold"
              >Responder</button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={startEdit}
                className="text-[11px] text-gray-500 hover:text-blue-600 bg-transparent border-none cursor-pointer p-0 font-semibold"
              >Editar</button>
            )}
            {canDelete && !confirmingDelete && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="text-[11px] text-gray-500 hover:text-red-600 bg-transparent border-none cursor-pointer p-0 font-semibold"
              >Borrar</button>
            )}
            {confirmingDelete && (
              <span className="flex items-center gap-1.5">
                <span className="text-[11px] text-red-600 font-semibold">¿Borrar?</span>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="text-[11px] text-white bg-red-500 hover:bg-red-600 border-none rounded px-1.5 py-0.5 cursor-pointer font-semibold disabled:opacity-60"
                >Sí</button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={saving}
                  className="text-[11px] text-gray-600 bg-gray-100 hover:bg-gray-200 border-none rounded px-1.5 py-0.5 cursor-pointer font-semibold disabled:opacity-60"
                >No</button>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
