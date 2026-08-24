# Parthone Solar Platform

Centralized multi-tenant solar business software for Parthone solar clients.

## Reference application

`Parthone/MSUK-Solar-Software` is the primary functional and UI reference and must remain unchanged. All centralized development happens in this repository.

## Firebase-first stack

- React + Vite frontend
- Firebase Hosting
- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Cloud Functions
- Firestore and Storage Security Rules

## Core architecture goals

- One shared codebase for all solar clients
- Strict tenant data isolation
- Separate client admins, employees, customers and business data
- Client-specific branding and custom domains
- Parthone Super Admin for onboarding and management
- Shared platform updates deployed to all clients
- Feature/module controls per client
- Ability to add Google Cloud services later without rebuilding the platform

## Build order

1. Firebase multi-tenant foundation
2. Parthone Super Admin
3. Client onboarding
4. Authentication and role-based access
5. White-label branding
6. MSUK Solar modules reproduced on the centralized architecture
7. Custom domains and website-to-CRM routing
8. Feature plans and controls
9. Production security and deployment
