# MR Abogado System

CRM jurídico para el Estudio del Dr. Marco Rossi (Tucumán, Argentina). Web app que centraliza expedientes, escritos, notificaciones SAE, jurisprudencia y normativa, con asistentes IA para diagnóstico y redacción.

## Stack

- **Frontend**: Vite 6 · React 19 · TypeScript 5.7 · Tailwind CSS 4 · React Router 7
- **Estado**: Zustand 5 (UI) + TanStack Query 5 (server cache)
- **Forms**: React Hook Form 7 + Zod 3
- **Backend**: Supabase (PostgreSQL 17 · Auth · Storage · Edge Functions Deno)
- **LLM**: OpenRouter (Claude Sonnet 4 + GPT-4o-mini, según función)
- **Integraciones**: SAE (Sistema de Actuación Electrónica de Tucumán) · Google Drive (OAuth) · Push Web (VAPID) · Resend (email)
- **Deploy**: Vercel (frontend) + Supabase (DB + edge functions)

## Estructura

```
.
├── frontend/                  # Vite + React app
│   └── src/
│       ├── pages/             # Una por ruta (lazy-loaded)
│       ├── components/        # Por dominio: auth/, expedientes/, clientes/, ...
│       ├── hooks/             # useQuery + useMutation por entidad
│       ├── lib/               # supabase/client.ts, utils/, push/
│       ├── stores/            # zustand stores (auth, toast, ...)
│       ├── providers/         # QueryProvider, ThemeProvider
│       ├── router.tsx         # rutas con AuthGuard
│       └── types/             # database.types.ts (autogen Supabase)
├── supabase/
│   ├── migrations/            # SQL versionado (más detalle abajo)
│   └── functions/
│       ├── _shared/           # cors.ts, llm-guard.ts, sae-*, bogabot-tools
│       └── <fn-name>/         # index.ts por función
├── docs/                      # contrato, sprints, normativa
├── scripts/                   # migraciones excel, ingest normativa
└── CLAUDE.md                  # contexto para Claude Code
```

## Módulos (lo que ve el usuario)

| Grupo | Módulos | Notas |
|---|---|---|
| Operación | Hoy · Dashboard · Tareas · Agenda · Notificaciones | "Hoy" solo para SECRETARIA |
| Casos | Clientes · Expedientes · Profesionales · Kanban (`/kanban`, no en menú) | |
| Inteligencia | Audiencias · Normativa · Jurisprudencia · Aprendizajes · Informes | Oculto para SECRETARIA |
| Gestión | Caja · Contenidos · Actividad | Caja: roles habilitados · Actividad: solo ADMIN |
| Sistema | Configuración | |

## Roles

Los permisos reales viven en RLS de Postgres; el frontend redirige por UX. Roles esperados en `profiles.rol`: `DIRECTOR`, `ADMIN`, `SECRETARIA`, más usuario standard. La landing condicional vive en `router.tsx` (`HomeRedirect`).

## Setup local

Requiere Node 20+ y la CLI de Supabase (`brew install supabase/tap/supabase` o `npm i -g supabase`).

```bash
# 1) Dependencias
cd frontend && npm install && cd ..

# 2) Variables de entorno
cp .env.example frontend/.env.local
# Editá frontend/.env.local con los valores reales:
#   VITE_SUPABASE_URL
#   VITE_SUPABASE_ANON_KEY
#   VITE_VAPID_PUBLIC_KEY

# 3) Dev server
npm run dev                  # arranca en http://localhost:3001
```

El backend (DB + edge functions) corre en Supabase. Para iterar sobre una function sin push directo:

```bash
supabase functions serve <function-name> --env-file ./supabase/functions/.env.local
```

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `frontend/.env.local` | Cliente browser → Supabase (RLS-respecting) |
| `VITE_VAPID_PUBLIC_KEY` | `frontend/.env.local` | Web push subscribe |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase secrets set` | Solo edge functions, jamás frontend |
| `OPENROUTER_API_KEY` | `supabase secrets set` | LLM (Claude, GPT) |
| `SAE_ENCRYPTION_KEY` | `supabase secrets set` | Cifra passwords SAE en DB. **Rotar = re-cifrar fila a fila.** |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `supabase secrets set` | Push notifications |
| `ALLOWED_ORIGINS` | `supabase secrets set` | Allowlist de CORS para edge functions |
| `LLM_MAX_INPUT_BYTES`, `LLM_RATE_LIMIT_PER_MIN` | `supabase secrets set` (opcional) | Tuning del guard LLM |

Lista completa con ejemplos: `.env.example`.

## Migraciones

Hay 80+ migrations en `supabase/migrations/` con dos esquemas de naming (cosa pendiente de consolidar):

- `00001_*` a `00065_*` — esquema viejo de la primera fase.
- `20260525...sql` en adelante — timestamp generado por `supabase migration new`.

Para aplicar a un proyecto:
```bash
supabase link --project-ref <ref>
supabase db push
```

## Deploy

- **Frontend**: push a `main` dispara build en Vercel (`vercel.json` define `framework: vite`).
- **Edge functions**: deploy manual por ahora.
  ```bash
  supabase functions deploy <fn-name>
  # o todas:
  supabase functions deploy
  ```

## Tests

Frontend usa Vitest:
```bash
cd frontend && npm test
```

Cobertura actual es baja (~4% de archivos). Prioridad alta: hooks de data y AuthGuard.

## Seguridad — invariantes que no se rompen

- `SUPABASE_SERVICE_ROLE_KEY` jamás en frontend ni en archivo trackeado.
- Cualquier secreto va a `supabase secrets set` o `vercel env add`, nunca a `.env.example` con valor real.
- Todas las edge functions importan `corsHeaders` como **función** (toma `req` y echa Origin solo si está en allowlist). No volver a la constante con `'*'`.
- Functions que llaman a OpenRouter integran `_shared/llm-guard.ts` para tope de bytes + rate limit por usuario.

## Soporte y contexto

- Contrato y alcance original: `docs/CONTRATO-ALCANCE-SISTEMA.md`.
- Sprints: `docs/sprint-*.md`.
- Pipeline de normativa: `docs/normativa-pipeline.md`.
- Para guía de Claude Code en este repo: `CLAUDE.md`.
