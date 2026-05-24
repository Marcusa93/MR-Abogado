# Skill Legal Argentina — copia local

Archivos del skill **claude-for-legal-argentina** de Cristian Aboitiz
copiados a este repo para inyectarlos como system prompt en la edge
function `diagnose-escrito` y en futuras integraciones.

## Origen

- Repo upstream: <https://github.com/cristianaboitiz-eng/claude-for-legal-argentina>
- Licencia: Apache 2.0 (ver `LICENSE`)
- Snapshot bajado: 2026-05-23

## Cómo se usa en la app

Los handlers de edge functions importan estos `.md` con `Deno.readTextFile`
o como texto embebido vía `import { readFileSync }`. No se hace fetch
dinámico al repo upstream — todo queda versionado acá.

### Edge functions que cargan estos archivos

| Function | Archivos usados |
|---|---|
| `diagnose-escrito` | `diagnostico-SKILL.md` + `civil-CLAUDE.md` + `marcadores-GLOSARIO.md` |

## Actualizar el skill

Cuando salgan cambios en upstream:

```bash
cd supabase/functions/_shared/skill-legal-ar
for f in CLAUDE.md diagnostico-SKILL.md civil-CLAUDE.md marcadores-GLOSARIO.md; do
  gh api "repos/cristianaboitiz-eng/claude-for-legal-argentina/contents/argentina/$f" \
    --jq '.content' | base64 -D > "$f"
done
```

Y commiteás los diffs. Si el formato del skill cambia (ej. una sección
nueva del diagnóstico), revisar la edge function `diagnose-escrito`
para asegurar que el system prompt sigue tirando del archivo correcto.
