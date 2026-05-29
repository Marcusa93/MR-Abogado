export class SaeCredentialSecretError extends Error {
  constructor(message = 'Credenciales SAE inválidas. Reingresá tus credenciales SAE en Ajustes.') {
    super(message)
    this.name = 'SaeCredentialSecretError'
  }
}

type VaultPasswordReader = {
  serviceClient?: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>
  }
  userId?: string
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

async function decryptAesGcm(bytes: Uint8Array, keyHex: string): Promise<string> {
  if (bytes.length <= 12) throw new Error('ciphertext too short')
  const keyBytes = new Uint8Array(keyHex.match(/../g)!.map((h) => parseInt(h, 16)))
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt'])
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12),
  )
  return decodeUtf8(new Uint8Array(plaintext))
}

async function readVaultPassword(options?: VaultPasswordReader): Promise<string | null> {
  if (!options?.serviceClient || !options.userId) return null

  const { data, error } = await options.serviceClient.rpc('get_sae_password', {
    p_user_id: options.userId,
  })
  if (error) {
    console.warn('[sae-credentials] legacy vault password unavailable', error.message ?? error)
    return null
  }

  return typeof data === 'string' && data ? data : null
}

export async function readSaePassword(
  encryptedSecret: string | null | undefined,
  options?: VaultPasswordReader,
): Promise<string | null> {
  const value = encryptedSecret?.trim()
  if (!value) return null

  // Migración 021 guardaba un UUID de Vault en esta columna. Ese formato ya
  // se resuelve con la RPC histórica cuando sigue disponible en la base.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    const vaultPassword = await readVaultPassword(options)
    if (vaultPassword) return vaultPassword
    throw new SaeCredentialSecretError()
  }

  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(value)
  } catch {
    // Tolerancia para credenciales legacy guardadas en texto plano.
    return value
  }

  const keyHex = Deno.env.get('SAE_ENCRYPTION_KEY')
  if (keyHex && /^[0-9a-f]{64}$/i.test(keyHex) && bytes.length > 28) {
    try {
      return await decryptAesGcm(bytes, keyHex)
    } catch {
      // Puede ser el formato histórico: password UTF-8 codificado en base64.
    }
  }

  try {
    return decodeUtf8(bytes)
  } catch {
    throw new SaeCredentialSecretError()
  }
}
