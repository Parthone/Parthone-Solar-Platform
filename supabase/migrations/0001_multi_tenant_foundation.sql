-- Module 0: Multi-Tenant Foundation
-- Parthone Solar Platform

create extension if not exists "pgcrypto";

create type public.platform_role as enum (
  'parthone_super_admin',
  'client_admin',
  'employee'
);

create type public.tenant_status as enum (
  'active',
  'suspended',
  'inactive'
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status public.tenant_status not null default 'active',
  logo_url text,
  primary_color text,
  secondary_color text,
  email text,
  phone text,
  address text,
  gst_number text,
  custom_domain text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  full_name text,
  role public.platform_role not null default 'employee',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint super_admin_without_tenant check (
    (role = 'parthone_super_admin' and tenant_id is null)
    or
    (role <> 'parthone_super_admin' and tenant_id is not null)
  )
);

create index profiles_tenant_id_idx on public.profiles(tenant_id);

create or replace function public.current_profile_role()
returns public.platform_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_parthone_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'parthone_super_admin', false);
$$;

alter table public.tenants enable row level security;
alter table public.profiles enable row level security;

create policy "super admin full access to tenants"
on public.tenants
for all
using (public.is_parthone_super_admin())
with check (public.is_parthone_super_admin());

create policy "tenant users can view own tenant"
on public.tenants
for select
using (id = public.current_tenant_id());

create policy "users can view own profile"
on public.profiles
for select
using (id = auth.uid());

create policy "client admins can view tenant profiles"
on public.profiles
for select
using (
  tenant_id = public.current_tenant_id()
  and public.current_profile_role() = 'client_admin'
);

create policy "super admin full access to profiles"
on public.profiles
for all
using (public.is_parthone_super_admin())
with check (public.is_parthone_super_admin());

create policy "client admins manage tenant profiles"
on public.profiles
for all
using (
  tenant_id = public.current_tenant_id()
  and public.current_profile_role() = 'client_admin'
)
with check (
  tenant_id = public.current_tenant_id()
  and role <> 'parthone_super_admin'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_set_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Every future client-owned table must include:
-- tenant_id uuid not null references public.tenants(id) on delete cascade
-- and RLS policies scoped to public.current_tenant_id().
