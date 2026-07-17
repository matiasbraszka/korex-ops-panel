# Panel Korex — reglas de trabajo

Matías corre **varias sesiones de Claude en paralelo sobre este mismo repo**.
Estas reglas existen para que dos sesiones no se pisen ni suban trabajo atrasado.
No son sugerencias. Leelas antes de escribir la primera línea de código.

## 1. Nunca trabajes en la carpeta `panel/`

`panel/` es el repo principal: solo para consultar y para que cuelguen los worktrees.
Si tu sesión arrancó ahí y vas a modificar archivos: **pará y pedí un worktree propio**.

Cada sesión trabaja en su carpeta hermana: `Developers/korex-ops/s-<nombre-corto>/`

Se crea así, desde `Developers/korex-ops/`:

```powershell
.\nueva-sesion.ps1 -Nombre agentes-vsl
```

Eso crea rama + carpeta **naciendo de `origin/main` fresco**. Nunca de una rama vieja.

## 2. Tu rama nace de `origin/main` y muere en `origin/main`

El bug histórico de este repo: ramas que viven semanas, acumulan cientos de commits de
atraso, y al mergearse **revierten trabajo nuevo de otras sesiones**.

Reglas duras:

- **Nunca** crees una rama a partir de otra rama de feature. Siempre `origin/main`.
- Si tu rama tiene más de ~2 días: `git fetch origin && git rebase origin/main` antes de seguir.
- Una rama terminada se mergea **el mismo día**. No se deja "para después".

Para ver el atraso de todas las sesiones:

```powershell
.\estado-sesiones.ps1
```

La columna `ATRASO` es la que importa. Más de ~20 = esa rama ya es peligrosa.

## 3. Commiteá seguido

Cada cambio que funciona = un commit. No acumules decenas de archivos sin commitear
(pasó de verdad: `feat/agentes-panel` llegó a 25).
Trabajo sin commitear es trabajo que se pierde y que ninguna otra sesión puede ver.

**Nunca** corras `git clean`. Nunca. Puede haber trabajo de otra sesión en el disco.

## 4. Una sesión = un área

Antes de tocar archivos, corré `.\estado-sesiones.ps1` y mirá qué ramas están vivas.
Si tu tarea pisa la misma área que otra sesión activa, **decíselo a Matías** en vez de avanzar.

## 5. Subir a producción

Prod = push a `main` (Vercel deploya solo). Para cerrar una sesión:

```powershell
.\cerrar-sesion.ps1 -Nombre agentes-vsl
```

Rebasa contra `origin/main`, corre el build, pide confirmación, sube y borra el worktree.
**No hagas el merge a mano.**

### Migraciones `.sql`

La base de Supabase es **una sola y está viva**. Una migración aplicada no se "desmergea".
Se aplican con el CLI y PAT, nunca transcribiendo por MCP.
El `.sql` va igual al repo, pero aplicar ≠ mergear: coordinalo con Matías siempre.

## 6. Contexto de Matías

Es COO, **no programa**. Explicá en castellano, sin jerga, y decí qué va a ver él en pantalla.
Decisión de negocio → preguntá. Decisión técnica → resolvela vos.
