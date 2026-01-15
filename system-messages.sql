-- Таблица для хранения системных сообщений (закрепленные посты, топы и т.д.)
CREATE TABLE IF NOT EXISTS system_messages (
    id SERIAL PRIMARY KEY,
    type TEXT UNIQUE NOT NULL,  -- 'top_ideas', 'welcome', etc
    message_id BIGINT NOT NULL, -- ID сообщения в канале
    channel_id TEXT,            -- ID канала
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для быстрого поиска по типу
CREATE INDEX IF NOT EXISTS idx_system_messages_type ON system_messages(type);

-- Комментарии
COMMENT ON TABLE system_messages IS 'Системные сообщения в канале (закрепленные, топы)';
COMMENT ON COLUMN system_messages.type IS 'Тип сообщения: top_ideas, welcome и т.д.';
COMMENT ON COLUMN system_messages.message_id IS 'ID сообщения в Telegram канале';
