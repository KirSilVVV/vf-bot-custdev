-- ============================================================================
-- Voting System - One Vote Per User Per Idea
-- ============================================================================
-- Таблица для отслеживания кто и за что голосовал
-- Предотвращает повторные голоса

CREATE TABLE IF NOT EXISTS votes (
    id BIGSERIAL PRIMARY KEY,
    
    -- User who voted
    user_id TEXT NOT NULL,
    user_name TEXT,
    
    -- What they voted for
    request_id BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    
    -- Vote type
    vote_type TEXT NOT NULL CHECK (vote_type IN ('up', 'down')),
    
    -- Timestamp
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- UNIQUE constraint: один юзер = один голос за идею
    UNIQUE(user_id, request_id)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Find all votes by user
CREATE INDEX IF NOT EXISTS idx_votes_user_id 
    ON votes(user_id);

-- Find all votes for a request
CREATE INDEX IF NOT EXISTS idx_votes_request_id 
    ON votes(request_id);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Check if user already voted for this request
-- SELECT EXISTS(SELECT 1 FROM votes WHERE user_id = '12345' AND request_id = 10);

-- Get user's vote type for a request
-- SELECT vote_type FROM votes WHERE user_id = '12345' AND request_id = 10;

-- Count votes for a request
-- SELECT 
--   COUNT(CASE WHEN vote_type = 'up' THEN 1 END) as upvotes,
--   COUNT(CASE WHEN vote_type = 'down' THEN 1 END) as downvotes
-- FROM votes 
-- WHERE request_id = 10;
