import { useState, useMemo } from 'react';
import { MessageSquare } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import CommentItem from './CommentItem';
import CommentInput from './CommentInput';

// TaskCommentsPanel — render del thread de comentarios de UNA tarea.
// - Texto plano, hilos de 1 nivel (raiz + respuestas indented).
// - Autor edita/borra los propios; admin/COO puede borrar cualquiera.
// - Optimistic UI a traves de addTaskComment/updateTaskComment/deleteTaskComment.

export default function TaskCommentsPanel({ taskId }) {
  const { currentUser, teamMembers, taskComments, addTaskComment, updateTaskComment, deleteTaskComment } = useApp();
  const [newValue, setNewValue] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [replyTo, setReplyTo] = useState(null); // id del comentario raiz al que estamos respondiendo
  const [replyValue, setReplyValue] = useState('');
  const [savingReply, setSavingReply] = useState(false);

  const isAdmin = !!(currentUser?.isAdmin || currentUser?.role === 'COO');

  const memberById = useMemo(() => {
    const m = {};
    (teamMembers || []).forEach(t => { m[t.id] = t; });
    return m;
  }, [teamMembers]);

  // Comentarios de esta tarea, separados en raiz + respuestas por parent.
  const { roots, repliesByParent } = useMemo(() => {
    const mine = (taskComments || [])
      .filter(c => c.task_id === taskId)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    const roots = mine.filter(c => !c.parent_id);
    const repliesByParent = {};
    mine.forEach(c => {
      if (c.parent_id) {
        if (!repliesByParent[c.parent_id]) repliesByParent[c.parent_id] = [];
        repliesByParent[c.parent_id].push(c);
      }
    });
    return { roots, repliesByParent };
  }, [taskComments, taskId]);

  const total = roots.length + Object.values(repliesByParent).reduce((a, arr) => a + arr.length, 0);

  const handleNewSubmit = async () => {
    if (!newValue.trim() || !currentUser?.id) return;
    setSavingNew(true);
    try {
      await addTaskComment({
        task_id: taskId,
        parent_id: null,
        body: newValue,
        author_id: currentUser.id,
      });
      setNewValue('');
    } catch (e) {
      alert('No se pudo guardar el comentario. Reintentá.');
    } finally {
      setSavingNew(false);
    }
  };

  const handleReplySubmit = async () => {
    if (!replyValue.trim() || !currentUser?.id || !replyTo) return;
    setSavingReply(true);
    try {
      await addTaskComment({
        task_id: taskId,
        parent_id: replyTo,
        body: replyValue,
        author_id: currentUser.id,
      });
      setReplyValue('');
      setReplyTo(null);
    } catch (e) {
      alert('No se pudo guardar la respuesta. Reintentá.');
    } finally {
      setSavingReply(false);
    }
  };

  const handleUpdate = async (id, body) => {
    await updateTaskComment(id, { body });
  };

  const handleDelete = async (id) => {
    await deleteTaskComment(id);
  };

  const canEditOrDelete = (c) => c.author_id === currentUser?.id;
  const canAdminDelete = (c) => canEditOrDelete(c) || isAdmin;

  return (
    <div className="border-t border-gray-100 mt-3 pt-3 space-y-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
        <MessageSquare size={12} />
        Comentarios{total > 0 ? ` (${total})` : ''}
      </div>

      {roots.length === 0 && (
        <div className="text-[12px] text-gray-400 italic">
          Sin comentarios. Empezá la conversación abajo.
        </div>
      )}

      {roots.length > 0 && (
        <div className="space-y-3">
          {roots.map(root => (
            <div key={root.id} className="space-y-2">
              <CommentItem
                comment={root}
                author={memberById[root.author_id]}
                canReply
                canEdit={canEditOrDelete(root)}
                canDelete={canAdminDelete(root)}
                onReply={(id) => { setReplyTo(id); setReplyValue(''); }}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
              {(repliesByParent[root.id] || []).map(rep => (
                <CommentItem
                  key={rep.id}
                  comment={rep}
                  author={memberById[rep.author_id]}
                  isReply
                  canEdit={canEditOrDelete(rep)}
                  canDelete={canAdminDelete(rep)}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
              {replyTo === root.id && (
                <div className="ml-7">
                  <CommentInput
                    value={replyValue}
                    onChange={setReplyValue}
                    onSubmit={handleReplySubmit}
                    onCancel={() => { setReplyTo(null); setReplyValue(''); }}
                    saving={savingReply}
                    autoFocus
                    showCancel
                    submitLabel="Responder"
                    placeholder="Escribí tu respuesta…"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        <CommentInput
          value={newValue}
          onChange={setNewValue}
          onSubmit={handleNewSubmit}
          saving={savingNew}
        />
      </div>
    </div>
  );
}
