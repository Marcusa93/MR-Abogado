# Sprint 2 — Normativa con chunking + RAG

**Estado:** completado, typecheck verde. Falta aplicar migración a Supabase, deployar `normativa-ingest` y redeployar `escritos-generate`.

## Lo que hace el módulo

Biblioteca **global por usuario** de leyes/decretos/códigos en PDF/DOCX. Cada documento se chunkea por artículo y se embebe con `text-embedding-3-small` (1536 dims). Al redactar un escrito:

- **Normas fijadas al expediente** → todos sus chunks van SIEMPRE al prompt (sin retrieval, hasta 30 chunks).
- **Retrieval automático** sobre el resto de la biblioteca → query embedding sobre `tipo + carátula + fuero + instrucciones + claves` → top-k chunks con `score ≥ 0.42` (3) o fallback `≥ 0.20` (2).
- El LLM cita por `chunk_id` numérico. Se valida post-respuesta contra el set recuperado y se persiste en `escrito_citas` (trazabilidad).

## Decisiones arquitectónicas (genealogía desde `DIA-SMT/contadurIA`)

| Pieza | Origen | Cambios al portar |
|---|---|---|
| Schema `documentos` + `chunks` con pgvector | `supabase/schema.sql:67-92` del repo de referencia | Agregado `user_id` en chunks (denormalizado) para RLS sin join; HNSW + GIN; checksum unique por `(user_id, checksum)` |
| Chunker por ARTÍCULO N (regex AR) | `processNormativa.ts:309-343` | Port a Deno/TS, sin librerías externas (no langchain) |
| `enforceMaxChunkSize` + `deduplicateChunks` | `processNormativa.ts:406-475` | Idénticos |
| RPC `match_normativa_chunks` | `schema.sql:326-358` | Agregué `filter_user_id` y `exclude_documento_ids` para evitar duplicar chunks de docs fijados |
| Umbrales 0.42 / 0.20 | `expedientes/index.ts:253-261` | Idénticos; calibrar con uso real |
| Cita por `chunkId` + validación post-LLM | `dictamen/generate.ts:98-125` | Idéntico patrón, persistido en `escrito_citas` |

**No portamos:**
- JSON mode → tool-use Anthropic (postergado; hoy JSON mode funciona).
- OCR fallback (PDF escaneados): se rechazan con error claro. **Solo PDFs nativamente digitales.**
- Hybrid search (BM25) y reranker: pendiente para v2.
- Jurisprudencia: fuera de alcance. Su chunker es distinto (fallos no estructurados por artículo).
- Multi-query retrieval por finding: hoy es single-query.

## Archivos creados / modificados

### Backend
- `supabase/migrations/00037_normativa.sql` — extensión `vector`, tablas `normativa_documentos`, `normativa_chunks`, `expediente_normativa`, `escrito_citas`, bucket `normativa-originales`, RPC `match_normativa_chunks`, RLS.
- `supabase/functions/normativa-ingest/index.ts` — recibe `{documento_id}`, retorna 202, procesa en background con `EdgeRuntime.waitUntil`: descarga del bucket, extrae con `unpdf` (PDF) o `mammoth` (DOCX), chunkea, embebe en lotes de 32, inserta. Marca `estado` y `error_message`.
- `supabase/functions/escritos-generate/index.ts` — agregado retrieval: bundle = pinned (sin retrieval) + retrieved (top-k). Inyecta `## Normativa disponible` al user message. Modificado `OUTPUT_SCHEMA` para pedir `citas: [{chunk_id, cita_texto}]`. Post-procesa y persiste en `escrito_citas` (descarta `chunk_id` que el modelo invente).

### Frontend
- `frontend/src/hooks/use-normativa.ts` — queries: list, documento, chunks, expediente-normativa, escrito-citas. Mutations: upload (con sha256 cliente-side para dedup), reindex, delete, fijar, desfijar.
- `frontend/src/pages/normativa.tsx` — biblioteca: búsqueda, upload form (metadata + archivo), listado con polling cada 3s mientras hay docs en `pendiente`/`procesando`.
- `frontend/src/pages/normativa-detail.tsx` — cabecera del documento + chunks expandibles, con reintento de indexación si está en error.
- `frontend/src/components/expedientes/tab-normativa.tsx` — sub-pestaña en cada expediente: lista de fijadas + dialog para fijar desde la biblioteca + desfijar.
- `frontend/src/router.tsx` — rutas `/normativa` y `/normativa/:id`.
- `frontend/src/components/layout/sidebar.tsx` — item "Normativa" con `BookMarked`.
- `frontend/src/pages/expediente-detail.tsx` — agregado tab "Normativa" en el array `TABS`.

## Modelo de datos

```
profiles
   │
   ├─< normativa_documentos (cabecera, RLS owner_all)
   │      │
   │      ├─< normativa_chunks (vector(1536), HNSW cosine, RLS owner_select)
   │      │
   │      └─< expediente_normativa (PK (expediente_id, documento_id))
   │              │
   │              └─> expedientes
   │
   └─> escritos
           │
           └─< escrito_citas (FK chunk_id, ON DELETE SET NULL para preservar trazabilidad)
```

## Convenciones

- **Bucket path:** `<user_id>/<documento_id>.<ext>` en `normativa-originales`.
- **chunk_uid:** `<documento_id>:<orden>:<random8>`. Stable y único.
- **metadata del chunk:** `{ articulo?, seccion?, parte?, tipo, numero, jurisdiccion, titulo_documento }` — denormalizado para filtros y citas sin join.
- **Umbrales RAG:** strong 0.42 (toma 3), weak 0.20 (toma 2 si nada llega a strong). Se aplican en la edge function, no en la RPC.
- **Sanity caps:** 30 chunks pinned máx por expediente (`RAG_MAX_PINNED_CHUNKS`), 30 citas máx por escrito.

## Pendientes inmediatos

1. **Aplicar migración** `00037_normativa.sql` (requiere habilitar la extensión `vector` — incluida en la migración).
2. **Deploy** de `normativa-ingest`.
3. **Redeploy** de `escritos-generate` (cambió el código).
4. **Probar end-to-end**: subir un CCyCN.pdf → esperar indexado → fijar a un expediente → generar un escrito → ver citas en la respuesta.

## Sprint 3 (pendientes del diseño completo)

- **Jurisprudencia**: tabla aparte o tipo discriminado, con chunker distinto (no por artículo). Permite buscar fallos por analogía: el escrito puede citarlos como precedente.
- **Hybrid search**: agregar `tsvector` sobre `contenido` y combinar BM25 + similarity (reciprocal rank fusion) — clave cuando hay queries con números de norma exactos.
- **Reranker**: Cohere o cross-encoder local para mejorar top-3.
- **Versionado normativo**: `vigencia_desde/hasta`, `deroga_a`.
- **UI de citas en el editor de escritos**: mostrar qué chunks usó cada escrito y permitir saltar al pasaje original.
- **Tool-use de Anthropic**: reemplazar JSON mode si aparece inestabilidad en producción.
