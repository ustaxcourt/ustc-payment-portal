-- Migration: 001_create_transactions_table
-- Description: Creates the transactions table for storing payment transaction records

BEGIN;

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY,
    client_app VARCHAR(100) NOT NULL,
    external_reference_id VARCHAR(255) NOT NULL,
    fee_code VARCHAR(100) NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on created_at for sorting by date (most recent first)
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);

-- Create index on status for filtering by transaction status
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);

-- Create index on client_app for filtering by application
CREATE INDEX IF NOT EXISTS idx_transactions_client_app ON transactions (client_app);

-- Create unique index to prevent duplicate transactions per client app
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_client_app_external_ref
    ON transactions (client_app, external_reference_id);

COMMIT;
