-- Добавление колонки full_description в таблицу requests
-- Для хранения полного описания фичи (формируется AI после опроса)
-- request_text - краткая версия до 300 символов для публикации в канале
-- full_description - полная версия для реализации

ALTER TABLE requests
ADD COLUMN IF NOT EXISTS full_description TEXT;

-- Обновить существующие записи (если full_description NULL, скопировать из request_text)
UPDATE requests 
SET full_description = request_text 
WHERE full_description IS NULL;

-- Добавить комментарий
COMMENT ON COLUMN requests.full_description IS 'Полное описание фичи после опроса AI (для реализации)';
COMMENT ON COLUMN requests.request_text IS 'Краткая версия для публикации в канале (до 300 символов)';
