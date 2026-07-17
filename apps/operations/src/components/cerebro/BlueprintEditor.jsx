// BlueprintEditor — ver y editar el BLUEPRINT MAESTRO DE ANUNCIOS (marketing_ad_library id=mal_blueprint),
// que incluye la GUARDIA DE COMPLIANCE META. Es el método fijo que el agente sigue al pie. Editable por Matías
// sin tocar la base a mano. Un atajo salta directo a la sección de compliance.
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@korex/db';
import { BookOpen, Save, Loader2, ShieldCheck } from 'lucide-react';

const BLUE = '#5B7CF5';
const COMPLIANCE_MARK = 'GUARDIA DE COMPLIANCE META';

export default function BlueprintEditor() {
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const taRef = useRef(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('marketing_ad_library').select('content').eq('id', 'mal_blueprint').maybeSingle();
    setContent(data?.content || '');
    setDirty(false); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    await supabase.from('marketing_ad_library').update({ content, char_count: content.length }).eq('id', 'mal_blueprint');
    setDirty(false); setSaving(false);
  };

  const jumpToCompliance = () => {
    const idx = content.indexOf(COMPLIANCE_MARK);
    if (idx < 0 || !taRef.current) return;
    const ta = taRef.current;
    ta.focus();
    ta.setSelectionRange(idx, idx + COMPLIANCE_MARK.length);
    // Aproximar el scroll a la línea de la sección.
    const before = content.slice(0, idx).split('\n').length;
    ta.scrollTop = Math.max(0, (before - 2) * 18);
  };

  const hasCompliance = content.includes(COMPLIANCE_MARK);

  if (loading) return <div className="text-[#9CA3AF] text-center py-16 text-[13px]"><Loader2 size={18} className="animate-spin inline mr-2" />Cargando blueprint…</div>;

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[15px] font-bold text-[#1A1D26] flex items-center gap-2"><BookOpen size={17} className="text-[#5B7CF5]" /> Blueprint maestro de anuncios</div>
          <p className="text-[12.5px] text-[#6B7280] mt-1 max-w-[620px]">El método oficial que el agente sigue al pie: ángulos, hooks, textos base y la <strong>Guardia de Compliance de Meta</strong>. {content.length.toLocaleString('es-AR')} caracteres.</p>
        </div>
        <div className="flex gap-2">
          {hasCompliance && (
            <button onClick={jumpToCompliance} className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg text-[12px] font-semibold cursor-pointer border border-[#F3C9C9] text-[#DC2626] bg-white hover:bg-[#FEF2F2]"><ShieldCheck size={14} /> Ir a Compliance</button>
          )}
          <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg text-white text-[12.5px] font-semibold cursor-pointer disabled:opacity-50" style={{ background: dirty ? BLUE : '#C4C9D2' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      {!hasCompliance && (
        <div className="bg-[#FEF9E7] border border-[#FBE7A1] rounded-lg p-2.5 text-[12px] text-[#7A5B00]">
          Ojo: no encuentro la sección "GUARDIA DE COMPLIANCE META" en el blueprint. Conviene tenerla para cuidar las reglas de Meta.
        </div>
      )}

      <textarea
        ref={taRef}
        className="w-full py-3 px-3.5 text-[12.5px] border border-[#E2E5EB] rounded-xl outline-none focus:border-[#5B7CF5] bg-white resize-y min-h-[460px] leading-relaxed font-mono"
        value={content}
        onChange={e => { setContent(e.target.value); setDirty(true); }}
      />
    </div>
  );
}
