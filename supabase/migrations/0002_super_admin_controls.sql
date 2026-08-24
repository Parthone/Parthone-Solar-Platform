-- Module 1: Parthone Super Admin controls

alter table public.tenants
  add column if not exists plan_name text not null default 'standard',
  add column if not exists plan_status text not null default 'active',
  add column if not exists user_limit integer,
  add column if not exists storage_limit_mb integer,
  add column if not exists notes text;

create index if not exists tenants_status_idx on public.tenants(status);
create index if not exists tenants_plan_status_idx on public.tenants(plan_status);

-- Super admin can already fully manage tenants and profiles through Module 0 RLS.
-- These fields support central plan/status/usage administration.
