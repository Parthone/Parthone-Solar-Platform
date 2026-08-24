# Parthone Solar Platform

Centralized multi-tenant solar business software for Parthone solar clients.

## Reference application

The existing `Parthone/MSUK-Solar-Software` repository is the primary functional and UI reference. It must remain unchanged. This repository is the new centralized platform.

## Core architecture goals

- One shared codebase for all solar clients
- Strict tenant data isolation
- Separate client admins, employees, customers and business data
- Client-specific branding and custom domains
- Parthone Super Admin for onboarding and management
- Shared platform updates deployed to all clients
- Feature/module controls per client
- Secure environment configuration with no production secrets committed to Git

## Initial build order

1. Multi-tenant foundation
2. Parthone Super Admin
3. Client onboarding
4. Authentication and role-based access
5. White-label branding
6. MSUK Solar modules reproduced on the centralized architecture
7. Custom domains and website-to-CRM routing
8. Feature plans and controls
9. Production security and deployment
