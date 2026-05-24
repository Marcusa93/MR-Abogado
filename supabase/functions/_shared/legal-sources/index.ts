// Registry de fuentes jurídicas. Agregá nuevas acá.

import type { LegalSource } from './types.ts'
import { saijSource } from './saij.ts'

export const LEGAL_SOURCES: Record<string, LegalSource> = {
  saij: saijSource,
}

export function getSource(id: string): LegalSource | null {
  return LEGAL_SOURCES[id] ?? null
}

export function listSources(): Array<{ id: string; label: string }> {
  return Object.values(LEGAL_SOURCES).map(s => ({ id: s.id, label: s.label }))
}

export * from './types.ts'
export * from './cache.ts'
