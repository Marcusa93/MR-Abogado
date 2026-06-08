# CLAUDE.md — Guía rápida del repo

Este archivo se carga automáticamente en cada sesión de Claude Code sobre este repo. No es para humanos — es contexto que ayuda a Claude a actuar correctamente. Lo que es para humanos vive en `README.md`.

## Identidad del proyecto

- **Nombre real**: MR Abogado System (no "Alba Guerra" — fue un sistema base previo, ya no aplica el nombre).
- **Dueño**: Estudio Jurídico del Dr. Marco Rossi, Tucumán, Argentina.
- **Dominio**: derecho civil, laboral, familia, previsional. Foro local de Tucumán + nacional.

## Stack en una línea

Vite 6 + React 19 + TS + Tailwind 4 + zustand + react-query + react-router 7 contra Supabase (PG 17, Auth, Storage, Edge Functions Deno). LLM por OpenRouter. Frontend en Vercel.

## Layout

- `frontend/src/{pages,components,hooks,lib,stores,providers,types}/`
- `supabase/migrations/*.sql` — versionado. **Dos esquemas conviven**: `00001_*..00065_*` (legacy) y `20260525...*` (timestamp). Para nuevas migraciones: timestamp (sale solo con `supabase migration new`).
- `supabase/functions/<fn>/index.ts` — handler Deno
- `supabase/functions/_shared/*` — helpers compartidos. **Lectura obligatoria al tocar functions**: `cors.ts`, `llm-guard.ts`, `bogabot-tools.ts`.
- Sin tests salvo unitarios de utils (~11 archivos en `frontend/src/test/` y `__tests__/`).

## Convenciones que NO debés romper

### CORS en edge functions
`corsHeaders` es **función**, no objeto. Se importa así:
```ts
import { corsHeaders } from '../_shared/cors.ts'
// uso:
new Response(body, { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })
```
Echa Origin solo si está en allowlist (env `ALLOWED_ORIGINS`, defaults seguros). Nunca dejarlo con `'*'`.

### Helpers `json()` top-level
La mayoría de functions tienen `function json(req: Request, body, status)` arriba del handler. Las llamadas son `json(req, {...}, 400)`. Si agregás una function nueva, seguí ese patrón.

### LLM guard
Toda function nueva que llame a OpenRouter debe integrar `_shared/llm-guard.ts`:
```ts
import { checkLlmGuard, logLlmCall } from '../_shared/llm-guard.ts'
const FUNCTION_NAME = '<fn-name>'
// después de autenticar al user:
const guard = await checkLlmGuard(adminClient, user.id, FUNCTION_NAME, inputBytes)
if (!guard.ok) return json(req, { error: guard.error }, guard.status)
// ... llamada al LLM ...
logLlmCall(adminClient, user.id, FUNCTION_NAME, inputBytes)
```
Defaults: 200KB input, 30 req/min/user. Tabla: `llm_call_log`. RPC: `llm_recent_count`.

### Supabase client en frontend
Único punto de entrada: `frontend/src/lib/supabase/client.ts`. Solo usa `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. **Jamás importes service_role en el bundle del browser.**

### Auth
- Sesión en zustand `auth-store` (`useAuthStore`).
- `AuthGuard` (`components/auth/auth-guard.tsx`) checkea sesión, perfil, `must_change_password`, `activo`.
- RBAC real vive en RLS de Postgres. El guard del frontend solo redirige por UX.
- Landing condicional por rol: SECRETARIA → `/hoy`, resto → `/dashboard` (`router.tsx` `HomeRedirect`).

### Data fetching
- `@tanstack/react-query` para todo lo que viene de Supabase.
- Hooks por entidad en `frontend/src/hooks/use-*.ts`.
- `queryKey` namespaced (ej. `['expedientes', filters]`, `['tareas', expedienteId]`).
- Mutations invalidan los keys que tocan.

### Naming y dominio (español argentino)
Usar siempre los términos del dominio en español: `expediente`, `actuación`, `escrito`, `notificación`, `audiencia`, `caratula`, `fuero`, `juzgado`, `cliente`. **No traducir** ni en código ni en UI.

## Cosas que rompieron antes y no querés repetir

- Frontend incorrecto que invocaba `SERVICE_ROLE_KEY` → era un bug catastrófico. Nunca.
- CORS `'*'` en functions sensibles — ya fue. Ahora allowlist en `_shared/cors.ts`.
- LLM calls sin tope de input → factura sin techo. Pasa por `llm-guard`.
- Migrations con prefix inconsistente — para una nueva, usá `supabase migration new <nombre>` (genera timestamp).
- TODOs marcados `abogado_id removed → use expediente_miembros` siguen abiertos en varios `pages/*.tsx` y `hooks/*.ts` — chequeá antes de tocar filtros por abogado.

## Comandos útiles

```bash
# dev
npm run dev                                    # frontend en :3001
cd frontend && npm test                        # vitest

# migrations
supabase migration new <nombre>
supabase db push                               # remoto linkeado

# functions
supabase functions serve <fn> --env-file ...
supabase functions deploy <fn>
```

## No hacer sin pedir

- Tocar `SAE_ENCRYPTION_KEY`: rotarla obliga a re-cifrar `sae_credentials.encrypted_secret` fila a fila.
- `git push --force` o reescritura de historia.
- Agregar dependencias pesadas al bundle del browser (PDF, OCR, ML). Mirá `vite.config.ts manualChunks` y mantené lazy-loading.
- Eliminar/renombrar columnas que estén en `database.types.ts` sin regenerar tipos.

## Saludos de cierre

Marco habla español rioplatense formal. Conciso, sin emojis, sin moralejas. Igual que el resto del equipo del estudio.
