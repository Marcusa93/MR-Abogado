// Volver a la pantalla de permiso del conector de Claude después de iniciar sesión.
// Solo se acepta esa ruta: una dirección libre sería una redirección abierta.

const CLAVE = 'mcp_volver_a'

export function recordarVolverA(ruta: string) {
  try { sessionStorage.setItem(CLAVE, ruta) } catch { /* sin almacenamiento: va al inicio */ }
}

export function destinoTrasLogin(porDefecto: string): string {
  try {
    const ruta = sessionStorage.getItem(CLAVE)
    sessionStorage.removeItem(CLAVE)
    if (ruta?.startsWith('/mcp/autorizar?')) return ruta
  } catch { /* sin almacenamiento */ }
  return porDefecto
}
