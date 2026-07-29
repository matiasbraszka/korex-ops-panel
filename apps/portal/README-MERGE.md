# Portal del cliente — "Grabaciones Korex" (mobile-first)

App **independiente** que se construyó **aparte** del monorepo `korex-ops-panel`
(para no chocar con la otra sesión de trabajo). Cuando quieras, se pliega adentro
como `apps/portal` con un `git mv`. Se conecta al **mismo Supabase** que el panel
(`cgdwieoxjoexzlfbxrfc`) vía RPCs `portal_cliente_*`.

Es el piloto para **Sergio Cánovas**: guiones para grabar, carpetas para subir
contenido, avance/pipeline con fechas, y tutoriales — todo super simple y mobile.

---

## 1) Correrla ahora (standalone)

```bash
cd korex-portal-cliente
cp .env.example .env      # completá VITE_SUPABASE_ANON_KEY (está en operations/.env)
npm install
npm run dev               # http://localhost:5180
```

En el login, tocá **"Ver demo (sin cuenta)"** para ver TODA la app con datos de
ejemplo de Sergio Cánovas — **no hace falta backend**. Un banner amarillo indica
"modo demo".

### Cómo funciona la conexión al backend
- `src/data/portalApi.js` llama a las RPCs `portal_cliente_*`. **Si una RPC no
  existe todavía** (o entrás en demo sin sesión), cae solo a `src/data/mockData.js`.
- Apenas apliques las migraciones (paso 3) y provisiones el login del cliente, la
  misma app pasa a datos reales **sin tocar código**.
- Las **subidas** ya están cableadas igual que el panel: video → Bunny (TUS, edge
  function `bunny-video`), foto/recurso → Supabase Storage (`funnel-recursos`); el
  registro en `funnel_resources` lo hace la RPC `portal_cliente_registrar_recurso`.
  En demo, la subida se **simula** (barra de progreso) para ver la UX.

---

## 2) Mergear al monorepo (`apps/portal`)

Cuando la otra sesión libere el repo:

1. Mové la carpeta adentro:
   ```bash
   git mv korex-portal-cliente korex-ops-panel/apps/portal
   ```
   (`workspaces: ["apps/*"]` ya la toma; no hay que editar el array.)
2. En `korex-ops-panel/package.json` (raíz) agregá scripts:
   ```json
   "dev:portal": "npm run dev -w @korex/portal",
   "build:portal": "npm run build -w @korex/portal"
   ```
3. (Opcional, recomendado) Reemplazá el cliente self-contained por el del monorepo:
   - Borrá `apps/portal/src/lib/supabase.js`.
   - En los imports (`data/portalApi.js`, `auth/PortalAuthProvider.jsx`,
     `components/Layout.jsx`) cambiá `../lib/supabase` → `@korex/db`, y agregá
     `"@korex/db": "*"` a `apps/portal/package.json`. (El `STORAGE_BUCKET` pasalo a
     una constante local.)
4. **Deploy separado en Vercel**: nuevo proyecto Vercel apuntando a este repo con
   `buildCommand: npm run build -w @korex/portal` y `outputDirectory:
   apps/portal/dist`, mismas env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`),
   dominio tipo `cliente.metodokorex.com`. (Ver `vercel.json` del panel como
   referencia de rewrites SPA.)

---

## 3) Aplicar las migraciones (revisar primero)

Están en `migrations/` — **borradores para revisar, NO aplicados**. Antes de
correr, resolvé cada `CONFIRMAR:` contra el esquema real (sobre todo el vínculo
`portal_access.person_id → fin_directory → clients` y el shape de
`clients.custom_phases` / `pending_resources`).

Aplicar en orden (con la CLI/PAT como el resto del panel):
1. `portal_cliente_v1_schema.sql` — columnas/tablas: `del_sections.para_grabar`,
   `portal_guion_status`, `funnel_resources.visible_cliente`, `portal_tutorials`,
   policy de Storage para subir bajo `portal/`.
2. `portal_cliente_v2_rpcs.sql` — RPCs `portal_cliente_*` (identidad, home, guiones,
   toggle, carpetas, carpeta, registrar_recurso, pipeline, tutoriales).
3. `portal_cliente_v3_whatsapp.sql` — avisos WhatsApp (equipo cuando sube el
   cliente; cliente cuando el equipo marca una edición `visible_cliente`).

> Recomendado: probar primero en una **branch de Supabase** (`create_branch`) y
> validar con la cuenta de Sergio antes de tocar producción.

---

## 4) Piloto Sergio Cánovas — checklist

1. Aplicar migraciones v1–v3 (tras revisar los `CONFIRMAR:`).
2. Provisionar login de portal para Sergio en `portal_access` (reusar
   `portal_provision_account` / edge function `portal-admin` / `admin-create-user`).
3. En el panel, marcar sus secciones de DEL como **"para grabar"** (`para_grabar`) y
   confirmar sus carpetas de recursos.
4. Abrir el portal → login → Inicio / Guiones / Carpetas / Avance / Tutoriales con
   datos reales.
5. Probar subida: un video (→ Bunny) y una foto (→ Supabase) → verificar que
   aparecen en el panel de operaciones.
6. WhatsApp: al subir el cliente llega DM al equipo; al marcar una edición
   `visible_cliente=true` llega WhatsApp a Sergio.

---

## Estructura

```
src/
  lib/supabase.js            cliente Supabase (swap por @korex/db al mergear)
  auth/PortalAuthProvider.jsx login de cliente (Supabase Auth) + modo demo
  data/mockData.js           datos demo (= contrato de las RPCs)
  data/portalApi.js          RPCs portal_cliente_* + subidas (Bunny/Storage) + fallback demo
  components/                PhoneFrame, Layout (header/nav/tutoriales), ui primitives
  screens/                   Login, Inicio, Guiones, GuionDoc, Carpetas, CarpetaDetalle, Pipeline
migrations/                  v1 schema · v2 rpcs · v3 whatsapp  (revisar y aplicar aparte)
```

**Lo que la app NO hace todavía / decisiones abiertas**
- Provisión automática de cuentas de cliente (se hace desde el panel/edge function).
- Los `bloques` de un guion salen hoy como un bloque único con el texto de la
  sección de DEL; se pueden enriquecer parseando el HTML en sub-bloques.
- Notificación por *fecha* de pipeline: dejar un `pg_cron` (nota al pie de v3).
