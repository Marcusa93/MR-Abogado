import { ROL_LABELS, type Rol } from '@/types/enums'

type ProfileLike = {
  email?: string | null
  nombre?: string | null
  apellido?: string | null
  rol?: string | null
} | null | undefined

/**
 * Rol mostrado al usuario. Usa ROL_LABELS del enum.
 */
export function displayRol(profile: ProfileLike): string {
  if (!profile) return ''
  const rol = profile.rol
  if (!rol) return ''
  return ROL_LABELS[rol as Rol] ?? rol
}

/**
 * Verifica si el usuario tiene acceso administrativo (ADMIN o ABOGADO).
 */
export function isStaffLetrado(profile: ProfileLike): boolean {
  if (!profile) return false
  return profile.rol === 'ADMIN' || profile.rol === 'ABOGADO'
}
