-- Миграция: добавить поле has_priority для отслеживания приоритетных идей
-- Это фиксирует приоритетный статус и позволяет корректно считать голоса

-- Добавить колонку has_priority (по умолчанию false)
ALTER TABLE requests 
ADD COLUMN IF NOT EXISTS has_priority BOOLEAN DEFAULT false;

-- Установить has_priority = true для всех идей где vote_count >= 10 при публикации
-- (это идеи которые были опубликованы с приоритетом)
UPDATE requests 
SET has_priority = true 
WHERE vote_count >= 10 
AND id IN (
    SELECT DISTINCT feature_id::int 
    FROM payments 
    WHERE kind = 'clinical_priority'
    AND feature_id IS NOT NULL
);

-- Индекс для быстрой фильтрации приоритетных идей
CREATE INDEX IF NOT EXISTS idx_requests_priority 
ON requests(has_priority) 
WHERE has_priority = true;

-- Комментарий
COMMENT ON COLUMN requests.has_priority IS 'Оплачен ли приоритет (фиксированный +10 голосов)';
