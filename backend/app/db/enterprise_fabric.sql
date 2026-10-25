-- ApexSovereign Enterprise Data Fabric v1
-- Tenant-scoped CRM, support, activity, and agent execution state.
CREATE TABLE IF NOT EXISTS apex_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    customer_id VARCHAR(128) NOT NULL, event_type VARCHAR(128) NOT NULL, quantity BIGINT NOT NULL CHECK (quantity > 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_apex_transactions_customer ON apex_transactions(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, domain VARCHAR(255), lifecycle_stage VARCHAR(64) NOT NULL DEFAULT 'PROSPECT',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL, email VARCHAR(320) NOT NULL, full_name VARCHAR(255),
    title VARCHAR(255), metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_contacts_tenant_email UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_contacts_account ON contacts(tenant_id, account_id);

CREATE TABLE IF NOT EXISTS deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL, name VARCHAR(255) NOT NULL, stage VARCHAR(64) NOT NULL DEFAULT 'QUALIFICATION',
    amount NUMERIC(18,2) NOT NULL DEFAULT 0, probability NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deals_pipeline ON deals(tenant_id, stage, updated_at DESC);

CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL, contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    subject VARCHAR(255) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'OPEN', priority VARCHAR(32) NOT NULL DEFAULT 'NORMAL',
    classification VARCHAR(64), resolution TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickets_queue ON tickets(tenant_id, status, priority, updated_at DESC);

CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type VARCHAR(64) NOT NULL, entity_id UUID NOT NULL, actor_type VARCHAR(32) NOT NULL, actor_id VARCHAR(128),
    event_type VARCHAR(128) NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(tenant_id, entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_name VARCHAR(128) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'PENDING', idempotency_key VARCHAR(128) NOT NULL,
    input_payload JSONB NOT NULL DEFAULT '{}'::jsonb, output JSONB, error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ,
    CONSTRAINT uq_agent_run_idempotency UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant ON agent_runs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE, step_id VARCHAR(128) NOT NULL, action VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL, duration_ms NUMERIC(12,3), output JSONB, error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(tenant_id, run_id, created_at);
