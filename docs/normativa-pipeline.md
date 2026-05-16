# Pipeline de chunking + RAG para normativa

Este documento explica el flujo completo desde que el abogado sube un archivo hasta que el LLM lo cita en un escrito. Lo dejo escrito para que cuando agreguemos **jurisprudencia** (sprint futuro) tengamos contra qué contrastar — porque el chunker de jurisprudencia tiene que ser distinto y conviene tener clara la lógica del actual.

## 1. ¿Qué es "chunkear"?

Chunkear es **dividir un documento largo en piezas más chicas, semánticamente coherentes**. Cada pieza (chunk) tiene que ser autocontenida, es decir, leerla sola tiene que tener sentido sin necesidad del resto del documento.

¿Por qué necesitamos chunkear?

- **Costos**: meterle un código entero al prompt (5MB de texto) sería carísimo y lento.
- **Calidad**: los modelos LLM rinden peor cuando el contexto es muy largo — "lost in the middle". Cinco artículos relevantes pesan más que mil artículos diluidos.
- **Búsqueda**: para encontrar "lo relevante" en una biblioteca, primero hay que tener piezas chicas que se puedan comparar.

## 2. La unidad natural en legislación: el artículo

En leyes, decretos y códigos, **cada artículo es ya un chunk perfecto**:

- Tiene un identificador único (`Art. 1071`).
- Es autocontenido: dice una regla completa.
- Es la unidad de referencia legal estándar (cuando citás, citás un artículo).

Por eso el chunker del módulo es heurístico, no semántico. Detecta los **encabezados de artículo** con una regex argentina y corta ahí. No usa langchain ni splitters de tokens.

## 3. El pipeline completo, paso a paso

### 3.1 Subida (frontend)

`frontend/src/hooks/use-normativa.ts:useUploadNormativa`

1. Cliente calcula `sha256` del archivo (para deduplicar si subís lo mismo dos veces).
2. Sube el archivo al bucket `normativa-originales` con path `<user_id>/<doc_id>.<ext>` (la convención del primer segmento = user_id es lo que permite la RLS en storage.objects).
3. Crea un row en `normativa_documentos` con `estado='pendiente'` y los metadatos (tipo, número, jurisdicción).
4. Invoca la edge function `normativa-ingest` con `{documento_id}`. La fn responde 202 inmediatamente y procesa en background.
5. El frontend hace polling cada 3s del row del documento hasta que `estado='indexado'` o `'error'`.

### 3.2 Extracción de texto (edge function)

`supabase/functions/normativa-ingest/index.ts:extractTextFromFile`

Según el mime type:

- **PDF** → `npm:unpdf@0.12.1` → `extractText(pdf, { mergePages: true })`. Funciona solo si el PDF es nativamente digital (no escaneado). Un PDF escaneado tiene "imágenes con letras", no texto extraíble — sin OCR no hay nada que hacer.
- **DOCX** → `npm:mammoth@1.8.0` → `extractRawText`. Conserva la estructura mejor que PDF.
- **TXT** → `TextDecoder('utf-8')`. La opción más predecible. Lo que pegás es lo que se chunkea.

Validación: si el texto extraído tiene menos de 200 caracteres, asumimos que falló (PDF escaneado, archivo vacío) y marcamos error.

### 3.3 Limpieza del texto (`cleanText`)

Necesario porque los PDFs vienen con basura típica del extractor:

- "A R T I C U L O" (letras separadas por espacios) → `ARTICULO`.
- "Art. " → `ARTICULO ` (normaliza).
- Comillas tipográficas `«»"" "` → ASCII.
- Guiones largos `– —` → `-`.
- Espacios y saltos de línea múltiples colapsados.

Sin este paso, las regex de detección de artículos fallarían en muchos PDFs reales.

### 3.4 Detección de encabezados de artículo

`findArticleHits` recorre línea por línea aplicando:

```ts
/^ART[ÍI]CULO\s+((?:\d+|[IVXLCDM]+)(?:\s*[°º])?(?:\s*BIS)?(?:\s+[A-Z])?)\s*[:.\-)]?\s*/i
```

Matchea: `ARTICULO 1`, `ARTÍCULO 23 BIS`, `ARTÍCULO XV°`, `ARTICULO 100 A` — todas las variantes argentinas.

Devuelve la posición (offset) de cada hit en el texto.

### 3.5 Validación de la secuencia (`filterArticleHits`)

Problema: la regex puede matchear falsos positivos (por ej. cuando una norma cita otra: "como dispone el artículo 5..."). Solución: exigir que los números formen una **secuencia monotónica creciente** con saltos ≤ 5.

Si la secuencia da 1, 2, 3, 4, 5, 6, 7 — válida.
Si da 1, 2, 5, 99, 3 — descartamos el 99 (falso positivo).

`BIS` y repeticiones se permiten porque son legítimas.

### 3.6 Corte en chunks (`chunkByArticles`)

Para cada hit, el chunk va desde el offset del hit hasta el offset del **siguiente** hit (o fin del texto si es el último). El contenido del chunk incluye el propio encabezado.

Si hay menos de 2 hits válidos, fallback a `chunkBySections` (corta por líneas en mayúscula que parecen títulos: "DISPOSICIONES GENERALES", "TÍTULO I", etc.).

Si tampoco hay 2 secciones, último fallback: **un solo chunk con todo** (para documentos sin estructura clara).

### 3.7 Control de tamaño (`enforceMaxChunkSize`)

Hard cap: 16.000 caracteres por chunk (≈ 4.000 tokens, por debajo del límite 8.192 del modelo de embedding). Cuando un artículo es muy largo (típico en códigos con artículos-bis-bis), se parte intentando cortar en orden:

1. Doble salto `\n\n`
2. Salto simple `\n`
3. Punto + espacio `. `

Cada parte se etiqueta `Art. N (parte 1/3)`, `(parte 2/3)`...

### 3.8 Deduplicación

Hash sha256 sobre `tipo + artículo + sección + contenido_normalizado`. Si dos chunks dan el mismo hash → es duplicado (común cuando el PDF tiene anexos repetidos o índices). Se descartan.

### 3.9 Embeddings

`createEmbeddings` llama a OpenRouter con `openai/text-embedding-3-small`. Le pasa una lista de strings (un lote de 32 chunks) y recibe una lista de vectores. Cada vector son 1.536 números flotantes que representan el "significado" del chunk en un espacio matemático.

Dos textos con significado parecido → vectores cercanos (coseno entre ellos cerca de 1). Dos textos sin relación → vectores casi ortogonales (coseno cerca de 0).

Costo: ~$0.02 por millón de tokens. Un CCyCN completo cuesta ~$0.03 indexarlo, una sola vez.

### 3.10 Persistencia

Cada chunk se inserta en `normativa_chunks` con:

- `chunk_uid`: identificador único (`<doc_id>:<orden>:<random>`).
- `contenido`: el texto del chunk.
- `embedding`: el vector de 1.536 dims.
- `metadata`: `{ articulo, seccion, parte, tipo, numero, jurisdiccion, titulo_documento }` — denormalizado para no tener que joinear con `normativa_documentos` en cada query.

**Importante**: se insertan **en lotes** (de 32) junto con cada batch de embeddings, no todos al final. Postgres tiene un `statement_timeout` y un INSERT masivo de cientos de vectors de 1.536 floats puede excederlo (lo vimos pasar con el CPCC de Tucumán).

### 3.11 Indexación del vector

El índice **HNSW** sobre la columna `embedding` se actualiza automáticamente en cada INSERT. Está definido como:

```sql
CREATE INDEX ON normativa_chunks USING hnsw (embedding vector_cosine_ops)
```

HNSW = Hierarchical Navigable Small World. Es la estructura de datos estándar para nearest-neighbor search en vectores de alta dimensión. Le pedís "los 10 más parecidos a este vector" y te los devuelve en milisegundos sin escanear toda la tabla.

## 4. Retrieval: cómo se usan los chunks al redactar un escrito

`supabase/functions/escritos-generate/index.ts:getRelevantNormativa`

Cuando el abogado genera un escrito:

### 4.1 Bundle = fijadas + retrieved

- **Fijadas** (`expediente_normativa`): los documentos que el abogado marcó como "siempre incluir" para este expediente. De esos, traemos **todos sus chunks** sin retrieval (hasta 30 chunks máx). Van sí o sí.
- **Retrieved**: el resto. Generamos un query embedding sobre `tipo + carátula + fuero + instrucciones + claves` y consultamos la RPC `match_normativa_chunks`.

### 4.2 RPC `match_normativa_chunks`

```sql
SELECT id, documento_id, contenido, metadata,
       (1 - (embedding <=> query_embedding)) AS score
FROM normativa_chunks
WHERE user_id = filter_user_id
  AND documento_id <> ALL (exclude_documento_ids)  -- excluye los pinned
ORDER BY embedding <=> query_embedding ASC
LIMIT 8
```

`<=>` es el operador de **cosine distance** de pgvector. Devuelve un número entre 0 (idénticos) y 2 (opuestos). Lo convertimos a `score` = 1 - distance para que 1.0 = match perfecto y 0.0 = sin relación.

### 4.3 Filtro por score

Aplicamos dos umbrales:

- Si hay chunks con `score >= 0.42` (match fuerte) → tomamos los top-3.
- Si no, fallback con `score >= 0.20` → top-2.
- Si nada llega → 0 chunks recuperados (el escrito se genera sin contexto normativo, pero con las fijadas).

Estos umbrales están calibrados sobre `text-embedding-3-small` con corpus jurídico chico. Habrá que recalibrarlos con uso real.

### 4.4 Inyección al prompt

Los chunks se serializan al user message como una sección `## Normativa disponible` con cada chunk identificado por su `chunk_id` numérico. El system prompt incluye la instrucción de **citar SOLO los chunks listados, por su chunk_id, en el array `citas` del JSON de salida**.

### 4.5 Validación post-LLM

Cuando el modelo responde, el array `citas` se filtra:

- Cualquier `chunk_id` que el modelo invente (no estaba en lo recuperado) se descarta silenciosamente.
- Las citas válidas se persisten en `escrito_citas` con `was_pinned`, `score`, `cita_texto` (≤ 1000 chars), `orden`.

Esto es lo que da **trazabilidad jurídica**: cualquier escrito puede ser auditado a posteriori para ver con qué fundamentos normativos se generó.

## 5. Por qué jurisprudencia necesita un chunker distinto

Los fallos judiciales **no se estructuran por artículos**. Tienen:

- **Resultandos** (los hechos relatados): párrafos extensos sin numeración.
- **Considerandos** (el razonamiento): a veces numerados, a veces no, con argumentación que se construye a lo largo de muchos párrafos.
- **Resuelvo / Fallo** (la decisión): suele estar al final, a veces dividida en puntos.

Implicaciones para el chunker:

- La regex de `ARTÍCULO N` no aplica. Necesitaríamos detectar `CONSIDERANDO`, `Y VISTO`, `RESUELVO`, números romanos al inicio de párrafo.
- Los chunks van a ser más largos y de tamaño variable. El razonamiento de un considerando puede correr 2-3 páginas.
- El "significado" de un fallo no está concentrado en una unidad chica — está distribuido. Probablemente queramos **chunking con solapamiento** (sliding window de 1500 chars con 200 de overlap) para no perder transiciones.
- Metadatos distintos: tribunal, fecha, autos (carátula del fallo), juez, instancia, doctrina aplicada.

Diseño tentativo (sprint futuro):

| Aspecto | Legislación (actual) | Jurisprudencia (futuro) |
|---|---|---|
| Unidad de chunk | Artículo | Párrafo o ventana de N caracteres |
| Solapamiento | No | Sí (~10-15%) |
| Regex de corte | `ARTÍCULO N` | `CONSIDERANDO`, `RESUELVO`, `Y VISTO` |
| Metadata | tipo, número, jurisdicción | autos, tribunal, fecha, juez, doctrina |
| Tabla | `normativa_*` | `jurisprudencia_*` (probablemente separada) |
| Uso en el prompt | "Citá artículo N" | "Citá analogía con autos X" |
| Persistencia de citas | `escrito_citas.chunk_id` → norm | `escrito_citas` polimórfico (chunk_id puede ser norm o jurispr) |

La separación entre `normativa_*` y `jurisprudencia_*` mantiene los chunkers desacoplados y permite indexar y filtrar por separado (un alegato puede pedir "normas relevantes" y "fallos análogos" en queries independientes).

## 6. Referencias en el código

- Schema: `supabase/migrations/00037_normativa.sql`, `00038_normativa_allow_txt.sql`, `00039_normativa_storage_policies.sql`.
- Ingesta: `supabase/functions/normativa-ingest/index.ts`.
- Retrieval: `supabase/functions/escritos-generate/index.ts` (sección `getRelevantNormativa` y `selectRelevantMatches`).
- Hook: `frontend/src/hooks/use-normativa.ts`.
- Genealogía y decisiones: `docs/sprint-normativa-1.md`.
- Repo de referencia que adaptamos: https://github.com/DIA-SMT/contadurIA
