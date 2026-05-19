# ADR-005: Immutable Audit Log Architecture

**Date:** 2026-05-18  
**Status:** Accepted  
**Deciders:** Platform Engineering

---

## Context

Audit logs are a compliance and security requirement. They must be:
- **Immutable**: once written, never modified or deleted
- **Tamper-evident**: any modification must be detectable
- **Queryable**: filterable by tenant, actor, action, resource, time
- **Durable**: retained per plan tier (30 days to 7 years)

## Decision

### Repository Pattern
`AuditEventRepositoryPort` exposes only:
- `append(event)` — write new event
- `appendBatch(events)` — write multiple events
- `findById(id, tenantId)` — read single event
- `query(filter, options)` — read with filtering

No `update()` or `delete()` methods exist. This makes accidental mutation impossible at the application layer.

### Database Enforcement
```sql
-- Revoke UPDATE/DELETE on audit_events from application user
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM atlas_app_user;
GRANT INSERT, SELECT ON audit_events TO atlas_app_user;

-- Trigger to prevent UPDATE (defense in depth)
CREATE OR REPLACE FUNCTION prevent_audit_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_immutability
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_update();
```

### AuditEvent Entity Design
- No `touch()` or update methods — inherits from `Entity`, not `AggregateRoot`
- `metadata` is deep-frozen on construction
- `reconstitute()` is the only path for ORM → domain mapping

### Async vs Synchronous Recording
Audit events are recorded asynchronously via the event bus by default. This means:
- Critical-path latency is not impacted by audit writes
- Audit writes can be batched for throughput

For compliance-critical operations (e.g., permission changes, key generation), use synchronous `RecordAuditEventHandler` before returning the response.

## Future: Cryptographic Chaining

For SOC2/ISO27001 compliance, append a hash chain:
```
event.previousHash = sha256(previousEvent.id + previousEvent.occurredAt + previousEvent.hash)
```
This makes tampering detectable even with database-level access. Not implemented in MVP — design preserves the field slot in the schema.

## Retention

Implemented via a background job that:
1. Reads `organizations.plan.auditRetentionDays`
2. Deletes (or archives to S3) `audit_events` older than retention period
3. Archive uses Parquet format for cost-efficient compliance reporting

Delete is allowed for the `atlas_maintenance_user` role only, not the application role.
