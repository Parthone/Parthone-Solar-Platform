-- Module 2: Client onboarding audit trail

create table if not exists public.client_onboarding_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  first_admin_id uuid not null references auth.users(id) on delete restrict,
  first_admin_email text not null,
  created_at timestamptz not null default now()
);

alter table public.client_onboarding_events enable row level security;

create policy "super admin can view onboarding events"
on public.client_onboarding_events
for select
using (public.is_parthone_super_admin());

create index if not exists client_onboarding_events_tenant_idx
  on public.client_onboarding_events(tenant_id);
