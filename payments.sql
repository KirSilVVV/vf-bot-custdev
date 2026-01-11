-- ============================================================================
-- Telegram Stars Payment Integration - Supabase SQL
-- ============================================================================
-- This file contains all SQL needed to set up the payments table and indexes
-- for the Telegram Stars clinical priority payment feature.
--
-- Steps to deploy:
-- 1. Go to Supabase Dashboard → Your Project → SQL Editor
-- 2. Create a new query
-- 3. Copy-paste all SQL below (or each section separately)
-- 4. Click "Run" button
-- 5. Confirm success (should see "Query executed successfully")
--
-- ============================================================================

-- Table: payments
-- Purpose: Store all Telegram Stars payment transactions
-- Primary use: Track clinical priority fee payments (300 XTR)
-- Extends: Can be reused for other payment types (add 'kind' column)

CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    
    -- User identification
    user_id TEXT NOT NULL,                    -- Telegram User ID (String from ctx.from.id)
    
    -- Payment details
    feature_id TEXT,                          -- ID of the idea/feature being marked as priority
    kind TEXT DEFAULT 'clinical_priority',    -- Payment type (extendable: clinical_priority, urgent_review, etc)
    stars INTEGER NOT NULL,                   -- Amount in Telegram Stars (300 for clinical priority)
    
    -- Telegram internal ID (prevents duplicate processing)
    telegram_charge_id TEXT UNIQUE NOT NULL,  -- Unique charge ID from Telegram
    
    -- Audit trail
    created_at TIMESTAMP DEFAULT NOW()        -- Payment timestamp
);

-- ============================================================================
-- Indexes: Optimize query performance
-- ============================================================================

-- Speed up lookups by user_id (e.g., "show all payments by this user")
CREATE INDEX IF NOT EXISTS idx_payments_user_id 
    ON payments(user_id);

-- Speed up duplicate detection by charge_id
-- (This is also enforced by UNIQUE constraint, but index helps lookups)
CREATE INDEX IF NOT EXISTS idx_payments_charge_id 
    ON payments(telegram_charge_id);

-- Speed up time-based queries (e.g., "show payments from last 7 days")
CREATE INDEX IF NOT EXISTS idx_payments_created_at 
    ON payments(created_at DESC);

-- Composite index for analytics (user + date range)
CREATE INDEX IF NOT EXISTS idx_payments_user_date 
    ON payments(user_id, created_at DESC);

-- ============================================================================
-- Views (Optional): For analytics and monitoring
-- ============================================================================

-- View: Daily payment summary
-- Usage: SELECT * FROM payments_daily_summary;
CREATE OR REPLACE VIEW payments_daily_summary AS
    SELECT 
        DATE(created_at) as payment_date,
        COUNT(*) as total_transactions,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(stars) as total_stars
    FROM payments
    GROUP BY DATE(created_at)
    ORDER BY payment_date DESC;

-- View: User payment history (for debugging)
-- Usage: SELECT * FROM payments_user_summary;
CREATE OR REPLACE VIEW payments_user_summary AS
    SELECT 
        user_id,
        COUNT(*) as total_payments,
        SUM(stars) as total_stars_spent,
        MAX(created_at) as last_payment_at,
        STRING_AGG(DISTINCT feature_id, ', ') as featured_ids
    FROM payments
    GROUP BY user_id
    ORDER BY last_payment_at DESC;

-- ============================================================================
-- RLS (Row Level Security) - OPTIONAL
-- Uncomment if you want to restrict access
-- ============================================================================

-- Enable RLS on payments table (only service role can read/write)
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything
-- CREATE POLICY "Service role can access payments"
--   ON payments
--   USING (true)
--   WITH CHECK (true)
--   FOR ALL
--   TO authenticated, anon;

-- ============================================================================
-- TRIGGERS (Optional): Auto-cleanup or audit
-- ============================================================================

-- Example: Log all payments to audit table
-- CREATE TABLE payments_audit AS TABLE payments WITH NO DATA;
-- CREATE TRIGGER payments_audit_trigger
--   AFTER INSERT ON payments
--   FOR EACH ROW
--   EXECUTE FUNCTION log_payment_to_audit();

-- ============================================================================
-- Data Integrity Checks
-- ============================================================================

-- Check that stars is always positive
ALTER TABLE payments 
    ADD CONSTRAINT check_stars_positive CHECK (stars > 0);

-- Check that user_id is not empty
ALTER TABLE payments 
    ADD CONSTRAINT check_user_id_not_empty CHECK (user_id != '');

-- ============================================================================
-- Cleanup & Rollback (if needed)
-- ============================================================================

-- WARNING: Uncomment only to DELETE the entire payments table and start over!
-- DROP TABLE IF EXISTS payments CASCADE;
-- DROP VIEW IF EXISTS payments_daily_summary;
-- DROP VIEW IF EXISTS payments_user_summary;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify table was created
-- SELECT * FROM information_schema.tables WHERE table_name = 'payments';

-- Verify indexes
-- SELECT * FROM pg_indexes WHERE tablename = 'payments';

-- Count all payments
-- SELECT COUNT(*) FROM payments;

-- Show recent payments
-- SELECT * FROM payments ORDER BY created_at DESC LIMIT 10;

-- ============================================================================
-- Example Data (for testing only)
-- ============================================================================

-- Insert test payment (uncomment to test):
-- INSERT INTO payments (user_id, feature_id, kind, stars, telegram_charge_id)
-- VALUES ('123456789', 'test_feature_001', 'clinical_priority', 300, 'test_charge_001');

-- Verify insertion
-- SELECT * FROM payments WHERE user_id = '123456789';

-- ============================================================================
