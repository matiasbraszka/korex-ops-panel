import { useState } from 'react';
import { LayoutGrid, Tag, Briefcase } from 'lucide-react';
import TemplateEditor from '../components/settings/TemplateEditor';
import ServicesEditor from '../components/settings/ServicesEditor';
import PrioritiesEditor from '../components/settings/PrioritiesEditor';

// Configuración del módulo Operaciones. La gestión de usuarios/equipo vive
// en Administración > Usuarios y equipo.
const TABS = [
  { id: 'template',   label: 'Plantilla de Roadmap', Icon: LayoutGrid },
  { id: 'services',   label: 'Servicios',             Icon: Briefcase },
  { id: 'priorities', label: 'Prioridades',           Icon: Tag },
];

export default function SettingsPage() {
  const [tab, setTab] = useState('template');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[20px] font-bold text-gray-800">Configuración</h1>
        <p className="text-xs text-gray-400 mt-0.5">Personalizá el sistema sin tocar código.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map(t => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 py-2 px-3 text-[13px] font-medium border-b-2 cursor-pointer font-sans bg-transparent transition-colors ${
                isActive
                  ? 'text-blue-600 border-blue-500'
                  : 'text-gray-500 border-transparent hover:text-gray-800'
              }`}
            >
              <t.Icon size={15} strokeWidth={isActive ? 2.25 : 1.75} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === 'template'   && <TemplateEditor />}
        {tab === 'services'   && <ServicesEditor />}
        {tab === 'priorities' && <PrioritiesEditor />}
      </div>
    </div>
  );
}
