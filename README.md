# Multi-Tenant SaaS Platform

## 🧠 Overview

A scalable multi-tenant backend platform supporting isolated tenants with shared infrastructure.

---

## 🎯 Problem Statement

Building SaaS platforms requires:

* Tenant isolation
* Scalability
* Cost efficiency

This project addresses:

* Secure multi-tenancy
* Resource isolation
* Tenant-aware services

---

## 🏗️ Architecture

* API Gateway
* Tenant-aware services
* Event-driven communication
* Shared + isolated data layers

---

## ⚙️ Features

* Tenant provisioning
* Role-based access control (RBAC/ABAC)
* Feature flags per tenant
* Rate limiting per tenant
* Billing hooks

---

## 🛠️ Tech Stack

* NestJS (DDD architecture)
* PostgreSQL (schema or row-level security)
* Redis
* Kafka / SNS + SQS
* Kubernetes (EKS)

---

## 🔥 Challenges

* Data isolation
* Tenant scalability
* Migration strategies
* Cost optimization

---

## 📊 Metrics

* Tenants supported
* Cost per tenant
* Throughput per tenant
* SLA per tenant

---

## 🧪 Failure Scenarios

* Tenant data leakage
* Noisy neighbor problem
* Partial provisioning

---

## 🚀 Roadmap

* [ ] Tenant model design
* [ ] Auth & RBAC
* [ ] Data isolation strategy
* [ ] Provisioning system
* [ ] Event integration

---

## 🧪 Local Setup — Initial Platform Admin Bootstrap

On a fresh database, no users or tenants exist, so there is no one who can
log in to create the first organization. The `scripts/bootstrap-platform-admin.ts`
script seeds the system with an initial tenant and a platform-admin user that
owns it. This is a development / first-run utility and is intentionally NOT
wired into the application startup path.

### What it creates

1. **Organization (tenant)** — a new row in `organizations` with status `active`,
   plan derived from `INITIAL_TENANT_PLAN` (default `enterprise`), and slug
   derived from `INITIAL_TENANT_NAME` (or `INITIAL_TENANT_SLUG` if provided).
2. **Platform admin user** — a new row in `users` with status `active`
   (email-verification skipped — local-dev only).
3. **Owner linkage** — the user is set as the organization's `ownerId`. Until
   a persisted `memberships` table lands, this owner link is how the RBAC
   layer recognises a `MembershipRole.OWNER`.

### Prerequisites

```bash
# 1. Database must be reachable and migrations applied
make infra            # starts postgres + redis
make migrate          # applies all pending migrations

# 2. Copy and (optionally) edit env vars
cp .env.example .env
# edit INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD / INITIAL_ADMIN_NAME / INITIAL_TENANT_NAME
```

### Run it

Any of these work — pick whichever fits your flow:

```bash
make bootstrap                          # Makefile target (recommended)
pnpm bootstrap:admin                    # pnpm script
./scripts/bootstrap-platform-admin.sh   # shell wrapper
```

Expected output on first run:

```
[Nest] Bootstrap   Bootstrapping platform admin 'admin@atlas.local' for tenant 'Atlas Corp' (slug=atlas-corp)
[Nest] Bootstrap   Admin user created: 7c… (admin@atlas.local)
[Nest] Bootstrap   Organization provisioned: 9a… (slug=atlas-corp)
[Nest] Bootstrap   Role granted: owner (via organization.ownerId) — user=7c… org=9a…

[bootstrap] Done.
  Tenant provisioned: 9a…
  Admin  created: 7c…
  Status: changes applied
```

### Re-running safely (idempotency)

The script is safe to re-run any number of times:

* If the admin email is already present in `users`, the existing user row is
  reused — the password is **not** rotated and no other fields are mutated.
* If the tenant slug is already present in `organizations`, the existing org
  is reused.
* If both already exist, the script exits 0 with `Status: already up to date`
  and performs no writes.

To rotate the admin password or rename the tenant, do it through the regular
application APIs — the bootstrap script will not overwrite existing rows.

### Production safety

The script refuses to run when `NODE_ENV=production`. Override with
`BOOTSTRAP_ALLOW_PROD=true` only if you genuinely need a one-off prod seed
(initial deployment), and prefer running it from a controlled CI/CD step
rather than a developer laptop.

### Future expansion

The same `scripts/` directory is the right home for additional seeding
helpers (demo tenants, fixture users, workflow templates). Keep each script
single-purpose, idempotent, and gated by `NODE_ENV` checks so seed code can
never accidentally run against a live tenant database.

---

## 💬 Pitch

Designed a multi-tenant SaaS platform with strong tenant isolation and scalability, enabling efficient onboarding and management of multiple clients.
