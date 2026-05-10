// ---------------------------------------------------------------------------
// Supabase Edge Function: create-user
// Creates a new auth user + profile row. Admin only.
// Deploy with JWT verification enabled. The function also checks the caller role.
// ---------------------------------------------------------------------------

import { corsHeaders } from '../_shared/cors.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // --- Verify caller is ADMIN ---
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Client with caller's JWT (to check their role)
    const supabaseCaller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user: callerUser }, error: authError } = await supabaseCaller.auth.getUser()
    if (authError || !callerUser) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check caller is admin
    const { data: callerProfile } = await supabaseCaller
      .from('profiles')
      .select('rol')
      .eq('id', callerUser.id)
      .single()

    if (callerProfile?.rol !== 'ADMIN') {
      return new Response(
        JSON.stringify({ error: 'Solo administradores pueden crear usuarios' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Parse body ---
    const { email, nombre, apellido, rol, telefono } = await req.json()

    if (!email || !nombre || !apellido || !rol) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos requeridos: email, nombre, apellido, rol' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const validRoles = ['ABOGADO']
    if (!validRoles.includes(rol)) {
      return new Response(
        JSON.stringify({ error: `Rol inválido. Valores permitidos: ${validRoles.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- Admin client (service role) ---
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Generate temporary password
    const tempPassword = crypto.randomUUID().slice(0, 16) + 'Aa1!'

    // Create auth user
    const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })

    if (createError) {
      const msg = createError.message.includes('already been registered')
        ? 'Ya existe un usuario con ese email'
        : createError.message
      return new Response(
        JSON.stringify({ error: msg }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const newUserId = newUserData.user.id

    // Create profile row
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: newUserId,
        email,
        nombre_completo: `${nombre} ${apellido}`.trim(),
        nombre,
        apellido,
        rol,
        telefono: telefono || null,
        must_change_password: true,
        activo: true,
      })

    if (profileError) {
      // Rollback: delete the auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return new Response(
        JSON.stringify({ error: `Error creando perfil: ${profileError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate password reset link so employee can set their own password
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
    })

    const recoveryLink = linkError ? null : linkData?.properties?.action_link

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUserId,
        recovery_link: recoveryLink,
        temp_password: tempPassword,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
