-- Module 3: Client Login & Role Guards

create or replace function public.current_tenant_status()
returns public.tenant_status
language sql
stable
security definer
set search_path = public
as $$
  select t.status
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid();
$$;

create or replace function public.current_profile_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(is_active, false)
  from public.profiles
  where id = auth.uid();
$$;

create or replace function public.can_access_client_tenant()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_profile_active()
    and public.current_profile_role() in ('client_admin', 'employee')
    and public.current_tenant_status() = 'active';
$$;

-- Future client-owned RLS policies should require both tenant match and
-- public.can_access_client_tenant() so suspended/inactive tenants are blocked.
