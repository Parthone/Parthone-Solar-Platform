# Architecture

## Tenant model

Each solar company is a tenant. Tenant documents live at `tenants/{tenantId}`. Client-owned business data should live under that tenant path or carry the tenant ID consistently.

## Access model

- `parthone_super_admin`: platform-wide access.
- `client_admin`: belongs to one tenant and manages that tenant.
- `employee`: belongs to one tenant; fine-grained permissions will be added with MSUK modules.

User identity metadata is stored in `users/{uid}` and tenant membership is represented by `tenantId`.

## Isolation rule

Tenant isolation is enforced with Firestore Security Rules and Storage Security Rules, not only in the UI. Cloud Functions use Firebase Admin SDK for privileged operations and must validate caller role/tenant before writing cross-tenant data.

## Firebase services

- Firebase Authentication for user sign-in
- Cloud Firestore for application data
- Firebase Storage for tenant files
- Cloud Functions for privileged/server-side workflows
- Firebase Hosting for the React application and custom domains

## Branding/domain model

Each tenant can store company name, slug, logo, colors, contact details, GST number, status, plan and custom domain. White-label resolution will be added in the branding/domain module.

## Business data structure

MSUK-derived modules such as customers, leads, installations, expenses, payments, inventory and employees will be tenant-scoped. The preferred structure is `tenants/{tenantId}/<module>/{documentId}` so isolation remains explicit and easy to secure.

## Google Cloud growth

Firebase remains the primary application platform. Advanced Google Cloud services such as Cloud Run, BigQuery or Secret Manager can be added to the same Google Cloud/Firebase project later when required.

## Repository boundary

`Parthone/MSUK-Solar-Software` is reference-only. All centralized platform development occurs in `Parthone/Parthone-Solar-Platform`.
