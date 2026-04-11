-- ============================================================================
-- Settings Panel — migration one-shot
-- Correr esto en Supabase SQL Editor antes de mergear feat/settings-panel
-- ============================================================================

-- 1) Tabla app_settings (clave/valor jsonb, una sola fila con key='global')
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- 2) Tabla team_members (CRUD desde el panel)
CREATE TABLE IF NOT EXISTS team_members (
  id text PRIMARY KEY,
  name text NOT NULL,
  role text NOT NULL,
  color text DEFAULT '#5B7CF5',
  initials text,
  avatar_url text,
  password text NOT NULL,
  can_access_settings boolean DEFAULT false,
  position int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 3) Seed: 9 usuarios actuales (matias con can_access_settings=true)
INSERT INTO team_members (id, name, role, color, initials, avatar_url, password, can_access_settings, position) VALUES
  ('matias',    'Matias Braszka',     'COO',              '#5B7CF5', 'MB', 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/684cd8d92809a925e80880c2.png', 'korex2026', true,  0),
  ('cristian',  'Cristian Fernandez', 'CEO',              '#06B6D4', 'CF', 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/68a4a3e0afed7575d4e87884.png', 'korex2026', false, 1),
  ('josem',     'Jose Martin',        'CMO',              '#EAB308', 'JM', 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38c2ea7dcb4cff0d974ec.png', 'korex2026', false, 2),
  ('david',     'David Castañeda',    'Trafficker',       '#F97316', 'DC', 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/68a4a3df7842793384dc77b7.png', 'korex2026', false, 3),
  ('marcos',    'Marcos del Rey',     'CTO',              '#22C55E', 'MR', 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38c2e3d829c73b26a9deb.png', 'korex2026', false, 4),
  ('zil',       'Zil Oliveros',       'Coordinación',     '#8B5CF6', 'ZO', 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38ef24cde4bbc2afcd13e.png', 'korex2026', false, 5),
  ('zerillos',  'Jose Zerillo',       'Diseño',           '#EC4899', 'JZ', 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38c8484c045c2748d2fc4.png', 'korex2026', false, 6),
  ('jordi',     'Jordi Miró Nolla',   'Project Manager',  '#14B8A6', 'JM', NULL,                                                                                          'korex2026', false, 7),
  ('christian', 'Christian Uscanga',  'Programador',      '#A855F7', 'CU', 'https://assets.cdn.filesafe.space/yvsigXlQTGQpDlSg1j7X/media/69d38c8484c045c2748d2fc3.png', 'korex2026', false, 8)
ON CONFLICT (id) DO NOTHING;

-- 4) Seed: app_settings global (template + servicios + prioridades)
INSERT INTO app_settings (key, value) VALUES ('global', '{
  "roadmap_template": {
    "phases": [
      { "id": "pre-onboarding",  "label": "Pre-Onboarding",  "color": "#8B5CF6", "order": 0 },
      { "id": "onboarding",      "label": "Onboarding",       "color": "#5B7CF5", "order": 1 },
      { "id": "primera-entrega", "label": "Primera Entrega",  "color": "#EAB308", "order": 2 },
      { "id": "lanzamiento",     "label": "Lanzamiento",      "color": "#22C55E", "order": 3 },
      { "id": "auditoria",       "label": "Auditoría",        "color": "#06B6D4", "order": 4 }
    ],
    "tasks": [
      { "id": "registro",      "name": "Registro en finanzas",             "phaseId": "pre-onboarding",  "assignee": "Zil Oliveros",    "daysFromUnblock": 1, "isClientTask": false, "dependsOn": [] },
      { "id": "investigacion", "name": "Investigación Pre-onboarding",     "phaseId": "pre-onboarding",  "assignee": "Jose Martin",     "daysFromUnblock": 1, "isClientTask": false, "dependsOn": [] },
      { "id": "carpetas",      "name": "Armado de carpetas Drive",         "phaseId": "pre-onboarding",  "assignee": "Zil Oliveros",    "daysFromUnblock": 1, "isClientTask": false, "dependsOn": [] },
      { "id": "onboarding",    "name": "Onboarding + Config Meta",         "phaseId": "onboarding",      "assignee": "Matias",          "daysFromUnblock": 2, "isClientTask": true,  "dependsOn": [] },
      { "id": "estrategia",    "name": "Estrategia, Avatar, Puntos clave", "phaseId": "primera-entrega", "assignee": "Jose Martin",     "daysFromUnblock": 2, "isClientTask": false, "dependsOn": ["onboarding"] },
      { "id": "guiones-ads",   "name": "Guiones de anuncios",              "phaseId": "primera-entrega", "assignee": "Jose Martin",     "daysFromUnblock": 1, "isClientTask": false, "dependsOn": ["estrategia"] },
      { "id": "guion-vsl",     "name": "Guion VSL",                        "phaseId": "primera-entrega", "assignee": "Jose Martin",     "daysFromUnblock": 1, "isClientTask": false, "dependsOn": ["estrategia"] },
      { "id": "landing-texto", "name": "Pre-landing, landing, formulario", "phaseId": "primera-entrega", "assignee": "Jose Martin",     "daysFromUnblock": 1, "isClientTask": false, "dependsOn": ["estrategia"] },
      { "id": "revision",      "name": "REVISIÓN DEL CLIENTE",             "phaseId": "primera-entrega", "assignee": "",                "daysFromUnblock": 7, "isClientTask": true,  "dependsOn": ["guiones-ads","guion-vsl","landing-texto"] },
      { "id": "correcciones",  "name": "Correcciones",                     "phaseId": "primera-entrega", "assignee": "Jose Martin",     "daysFromUnblock": 1, "isClientTask": false, "dependsOn": ["revision"] },
      { "id": "grabacion",     "name": "GRABACIÓN DEL CLIENTE",            "phaseId": "primera-entrega", "assignee": "",                "daysFromUnblock": 7, "isClientTask": true,  "dependsOn": ["correcciones"] },
      { "id": "edicion",       "name": "Edición anuncios y VSL",           "phaseId": "primera-entrega", "assignee": "Matias",          "daysFromUnblock": 4, "isClientTask": false, "dependsOn": ["grabacion"] },
      { "id": "diseno",        "name": "Diseño de la landing",             "phaseId": "primera-entrega", "assignee": "Jose Zerillo",    "daysFromUnblock": 3, "isClientTask": false, "dependsOn": ["landing-texto","revision"] },
      { "id": "revision-dis",  "name": "REVISIÓN DISEÑO",                  "phaseId": "primera-entrega", "assignee": "",                "daysFromUnblock": 3, "isClientTask": true,  "dependsOn": ["diseno"] },
      { "id": "codigo",        "name": "Pasar a código el funnel",         "phaseId": "primera-entrega", "assignee": "Marcos",          "daysFromUnblock": 4, "isClientTask": false, "dependsOn": ["revision-dis"] },
      { "id": "vincular",      "name": "Vincular cuenta y métricas",       "phaseId": "primera-entrega", "assignee": "David Castañeda", "daysFromUnblock": 3, "isClientTask": false, "dependsOn": [] },
      { "id": "cargar-saldo",  "name": "Cargar saldo al networker",        "phaseId": "primera-entrega", "assignee": "Zil Oliveros",    "daysFromUnblock": 1, "isClientTask": false, "dependsOn": ["vincular"] },
      { "id": "reunion",       "name": "REUNIÓN DE PRESENTACIÓN",          "phaseId": "primera-entrega", "assignee": "Matias",          "daysFromUnblock": 1, "isClientTask": true,  "dependsOn": ["codigo","cargar-saldo"] },
      { "id": "lanzamiento",   "name": "Lanzamiento de Ads",               "phaseId": "lanzamiento",     "assignee": "David Castañeda", "daysFromUnblock": 1, "isClientTask": false, "dependsOn": ["reunion"] },
      { "id": "auditoria",     "name": "Auditoría y mejora continua",      "phaseId": "auditoria",       "assignee": "David Castañeda", "daysFromUnblock": 30,"isClientTask": false, "dependsOn": ["lanzamiento"] }
    ]
  },
  "services": ["Funnel completo + Ads"],
  "priority_labels": {
    "1": { "label": "SUPER PRIORITARIO", "color": "#EF4444" },
    "2": { "label": "IMPORTANTES",       "color": "#F97316" },
    "3": { "label": "NORMAL",            "color": "#22C55E" },
    "4": { "label": "POCO IMPORTANTES",  "color": "#9CA3AF" },
    "5": { "label": "NUEVOS",            "color": "#8B5CF6" },
    "6": { "label": "DESCARTADOS",       "color": "#6B7280" }
  }
}'::jsonb)
ON CONFLICT (key) DO NOTHING;
