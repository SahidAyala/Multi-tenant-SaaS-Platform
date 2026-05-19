-- ATLAS Platform — PostgreSQL Init Script
-- Runs once on first container start

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Create read-only role for reporting/analytics
CREATE ROLE atlas_readonly;
GRANT CONNECT ON DATABASE atlas_dev TO atlas_readonly;

-- Create application schema comment
COMMENT ON DATABASE atlas_dev IS 'ATLAS Platform — Multi-Tenant Infrastructure Platform';
