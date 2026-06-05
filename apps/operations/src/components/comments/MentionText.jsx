import { useApp } from '../../context/AppContext';
import { tokenizeWithMentions } from '../../utils/mentions';

// Renderiza un string con @mentions como chips coloreados. Si una mencion no
// matchea con ningun team_member queda como texto plano.

export default function MentionText({ text, className = '' }) {
  const { teamMembers } = useApp();
  if (!text) return null;
  const tokens = tokenizeWithMentions(text, teamMembers || []);
  return (
    <span className={className}>
      {tokens.map((t, i) => {
        if (t.type === 'mention') {
          const first = (t.member.name || '').split(/\s+/)[0];
          return (
            <span
              key={i}
              title={t.member.name + (t.member.role ? ' · ' + t.member.role : '')}
              className="inline-flex items-baseline rounded-md bg-purple-50 text-purple-700 font-semibold px-1 mx-px"
              style={{ paddingTop: 0, paddingBottom: 0 }}
            >
              @{first}
            </span>
          );
        }
        return <span key={i}>{t.value}</span>;
      })}
    </span>
  );
}
