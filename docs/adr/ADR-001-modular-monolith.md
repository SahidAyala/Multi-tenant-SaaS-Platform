# ADR-001: Modular Monolith as Initial Architecture

**Date:** 2026-05-18  
**Status:** Accepted  
**Deciders:** Platform Engineering

---

## Context

ATLAS needs to support multi-tenant infrastructure orchestration, audit, and workflow execution. The natural end-state is a distributed system of independently deployable services. However, premature decomposition introduces:

- Distributed systems complexity before product-market fit
- Network latency for in-process calls that don't need it
- Operational overhead (multiple CI/CD pipelines, separate deployments, service discovery)
- Difficulty refactoring across service boundaries before domain models are stable

The bounded contexts are well-understood but not yet proven at scale.

## Decision

Start with a **modular monolith**: a single deployable unit with hard module boundaries enforced by code structure, not network. Each bounded context is a NestJS module with:

- No cross-module imports of domain objects (only interface ports and event contracts)
- Internal event-driven communication (not direct method calls between modules)
- Separate database namespacing preparedness (all entities have tenant_id, designed for schema extraction)
- Module-level directory structure identical to what a microservice would have

## Consequences

**Positive:**
- Single deployment unit — simple CI/CD, no service discovery
- In-process communication — no network calls, easier debugging
- Easy refactoring of domain models while bounded contexts are maturing
- Zero operational complexity at launch

**Negative:**
- Single process failure affects all modules
- Cannot scale modules independently (API, audit, workflow may have different load profiles)
- Shared database connection pool (mitigated by module-level connection configuration)

## Extraction Triggers

A bounded context should be extracted to a standalone service when ANY of these conditions are met:

1. Independent scaling is required (e.g., audit ingestion at 100K events/sec)
2. Separate deployment cadence is needed (e.g., workflow engine updates must not risk auth)
3. Module requires different runtime characteristics (e.g., workflow engine needs long-running processes)
4. Team boundary demands separate ownership

## Extraction Path

```
Module → NestJS Microservice (same process, different transport)
       → Separate Kubernetes Deployment (same repo, separate build)
       → Separate Repository (full autonomy)
```

The event-driven internal architecture means step 1 is a transport swap, not a rewrite.
