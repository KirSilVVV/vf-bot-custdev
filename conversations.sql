-- ============================================================================
-- AI Conversations Analytics - Supabase SQL
-- ============================================================================
-- Таблица для хранения всех диалогов с OpenAI для аналитики
--
-- Steps to deploy:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Copy-paste this SQL
-- 3. Click "Run"
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    
    -- User identification
    user_id TEXT NOT NULL,
    user_name TEXT,
    
    -- Session tracking
    session_id TEXT NOT NULL,              -- Unique session ID (user_id + timestamp)
    message_number INTEGER NOT NULL,       -- Message position in dialog (1, 2, 3...)
    
    -- Message content
    message_text TEXT NOT NULL,            -- User's message
    ai_response TEXT,                      -- AI's response
    
    -- Metadata
    ready_to_publish BOOLEAN DEFAULT false, -- Was this the final message before publish buttons?
    published BOOLEAN DEFAULT false,        -- Did user actually publish after this?
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- Indexes for analytics queries
-- ============================================================================

-- Find all sessions by user
CREATE INDEX IF NOT EXISTS idx_conversations_user_id 
    ON conversations(user_id);

-- Find all messages in a session
CREATE INDEX IF NOT EXISTS idx_conversations_session_id 
    ON conversations(session_id);

-- Analytics: published vs abandoned ideas
CREATE INDEX IF NOT EXISTS idx_conversations_published 
    ON conversations(published);

-- ============================================================================
-- Useful analytics queries
-- ============================================================================

-- Average messages per session before publish
-- SELECT AVG(message_number) FROM conversations WHERE ready_to_publish = true;

-- Most active users
-- SELECT user_id, user_name, COUNT(*) as messages 
-- FROM conversations 
-- GROUP BY user_id, user_name 
-- ORDER BY messages DESC 
-- LIMIT 10;

-- Conversion rate (published / total sessions)
-- SELECT 
--   COUNT(DISTINCT CASE WHEN published THEN session_id END) * 100.0 / 
--   COUNT(DISTINCT session_id) as conversion_rate
-- FROM conversations;
