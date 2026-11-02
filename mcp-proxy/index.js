// mcp.marcorossi.com.ar → edge function `mcp` de Supabase. No guarda ni lee nada:
// credenciales y lógica viven en supabase/functions/mcp.
const DESTINO = 'https://ftxpilbvjfxfkjkrbrnl.supabase.co/functions/v1/mcp'

export default {
  async fetch(req) {
    const u = new URL(req.url)
    return fetch(new Request(`${DESTINO}${u.pathname}${u.search}`, req), { redirect: 'manual' })
  },
}
