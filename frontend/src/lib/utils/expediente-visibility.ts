// ─────────────────────────────────────────────────────────────────────────
// Visibility de expedientes según rol
//
// Modelo (post-migración 053):
//   - DIRECTOR / ADMIN: ven todos los expedientes del estudio.
//   - ABOGADO / COLABORADOR: ven solo donde son abogado_responsable_id,
//        created_by, miembro formal, o tienen vínculo SAE propio.
//
// Devuelve null cuando is director (sin filtro). Devuelve array de ids
// permitidos en el resto de casos. Si no hay matches devuelve [].
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { isDirector } from './display-rol'

type ProfileLike = { id?: string | null; rol?: string | null } | null | undefined

export async function getAllowedExpedienteIds(
  supabase: SupabaseClient,
  profile: ProfileLike,
): Promise<string[] | null> {
  if (!profile?.id) return []  // sin profile → nada
  if (isDirector(profile)) return null  // director: sin restricción

  const userId = profile.id
  const [m, own, saeLinks] = await Promise.all([
    supabase.from('expediente_miembros').select('expediente_id').eq('profile_id', userId),
    supabase.from('expedientes')
      .select('id')
      .or(`abogado_responsable_id.eq.${userId},created_by.eq.${userId}`)
      .is('deleted_at', null),
    (supabase.from as any)('expediente_sae_links')
      .select('expediente_id')
      .eq('profile_id', userId),
  ])
  const ids = new Set<string>()
  for (const row of (m.data ?? []) as Array<{ expediente_id: string }>) {
    ids.add(row.expediente_id)
  }
  for (const row of (own.data ?? []) as Array<{ id: string }>) {
    ids.add(row.id)
  }
  for (const row of (saeLinks.data ?? []) as Array<{ expediente_id: string }>) {
    ids.add(row.expediente_id)
  }
  return [...ids]
}
