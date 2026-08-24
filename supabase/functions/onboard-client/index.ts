import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type OnboardPayload = {
  companyName: string
  slug: string
  companyEmail?: string
  phone?: string
  customDomain?: string
  planName?: string
  logoUrl?: string
  primaryColor?: string
  adminName: string
  adminEmail: string
  adminPassword: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization = req.headers.get('Authorization')

    if (!authorization) {
      return Response.json({ error: 'Missing authorization.' }, { status: 401, headers: corsHeaders })
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: caller, error: callerError } = await callerClient.auth.getUser()
    if (callerError || !caller.user) {
      return Response.json({ error: 'Invalid session.' }, { status: 401, headers: corsHeaders })
    }

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role,is_active')
      .eq('id', caller.user.id)
      .single()

    if (callerProfile?.role !== 'parthone_super_admin' || !callerProfile?.is_active) {
      return Response.json({ error: 'Super Admin access required.' }, { status: 403, headers: corsHeaders })
    }

    const payload = (await req.json()) as OnboardPayload
    const companyName = payload.companyName?.trim()
    const slug = payload.slug?.trim().toLowerCase()
    const adminName = payload.adminName?.trim()
    const adminEmail = payload.adminEmail?.trim().toLowerCase()
    const adminPassword = payload.adminPassword

    if (!companyName || !slug || !adminName || !adminEmail || !adminPassword) {
      return Response.json({ error: 'Company, slug and first admin details are required.' }, { status: 400, headers: corsHeaders })
    }
    if (adminPassword.length < 8) {
      return Response.json({ error: 'Admin password must be at least 8 characters.' }, { status: 400, headers: corsHeaders })
    }

    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .insert({
        name: companyName,
        slug,
        email: payload.companyEmail?.trim() || null,
        phone: payload.phone?.trim() || null,
        custom_domain: payload.customDomain?.trim() || null,
        plan_name: payload.planName?.trim() || 'standard',
        logo_url: payload.logoUrl?.trim() || null,
        primary_color: payload.primaryColor?.trim() || null,
        status: 'active',
        plan_status: 'active',
      })
      .select('*')
      .single()

    if (tenantError) {
      return Response.json({ error: tenantError.message }, { status: 400, headers: corsHeaders })
    }

    const { data: createdUser, error: userError } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: { full_name: adminName },
    })

    if (userError || !createdUser.user) {
      await adminClient.from('tenants').delete().eq('id', tenant.id)
      return Response.json({ error: userError?.message || 'Unable to create client admin.' }, { status: 400, headers: corsHeaders })
    }

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: createdUser.user.id,
      tenant_id: tenant.id,
      full_name: adminName,
      role: 'client_admin',
      is_active: true,
    })

    if (profileError) {
      await adminClient.auth.admin.deleteUser(createdUser.user.id)
      await adminClient.from('tenants').delete().eq('id', tenant.id)
      return Response.json({ error: profileError.message }, { status: 400, headers: corsHeaders })
    }

    await adminClient.from('client_onboarding_events').insert({
      tenant_id: tenant.id,
      created_by: caller.user.id,
      first_admin_id: createdUser.user.id,
      first_admin_email: adminEmail,
    })

    return Response.json({
      success: true,
      tenant,
      admin: { id: createdUser.user.id, name: adminName, email: adminEmail },
    }, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unexpected onboarding error.' }, { status: 500, headers: corsHeaders })
  }
})
