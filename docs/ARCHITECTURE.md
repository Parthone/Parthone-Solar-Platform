# Architecture

## Tenant model

Each solar company is a tenant. Every client-owned business record must carry a non-null `tenant_id` referencing `public.tenants.id`.

## Access model

- `parthone_super_admin`: platform-wide access; no tenant assignment.
- `client_admin`: belongs to one tenant and manages that tenant.
- `employee`: belongs to one tenant; fine-grained permissions will be added with MSUK modules.

## Isolation rule

Tenant isolation is enforced primarily in PostgreSQL/Supabase Row Level Security, not only in the UI. Application helpers are an additional guard and must not replace database policies.

## Branding/domain model

Tenant identity contains company name, slug, logo, colors, contact details, GST number, status and optional custom domain. White-label resolution will be added in the branding/domain modules.

## Future tables

All client business tables such as customers, leads, installations, expenses, payments, inventory and employees must include `tenant_id` and tenant-scoped RLS policies.

## Repository boundary

`Parthone/MSUK-Solar-Software` is reference-only. All centralized platform development occurs in `Parthone/Parthone-Solar-Platform`.
