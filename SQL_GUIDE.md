# SQL скрипты для Supabase

Все SQL скрипты для настройки базы данных проекта.

## Порядок выполнения

Выполняй в Supabase SQL Editor в таком порядке:

### 1. Основная таблица requests
Таблица requests создаётся автоматически при первой публикации.
Если нужно создать вручную - схема уже в коде, просто опубликуй первую идею.

### 2. Таблица votes (система голосования)
```bash
votes.sql
```
Хранит голоса пользователей (up/down) с ограничением 1 голос на идею.

### 3. Таблица payments (платежи за приоритет)
```bash
payments.sql
```
Записывает все платежи Telegram Stars.

### 4. Таблица conversations (аналитика AI диалогов)
```bash
conversations.sql
```
Логирует все сообщения пользователей и ответы AI.

### 5. Добавить колонку full_description
```bash
migration-full-description.sql
```
Добавляет поле для полного описания фичи (отдельно от краткого драфта).

### 6. Таблица system_messages (закрепленные посты)
```bash
system-messages.sql
```
Для хранения ID топ-постов и других системных сообщений.

---

## Все SQL файлы:

- **votes.sql** - Голосование (up/down, 1 голос на юзера)
- **payments.sql** - Платежи Telegram Stars
- **conversations.sql** - Логи AI диалогов
- **migration-full-description.sql** - Полное описание фичи
- **system-messages.sql** - Системные сообщения (топ-посты)

---

## Быстрая настройка

Скопируй и выполни все в Supabase SQL Editor по очереди:

1. votes.sql
2. payments.sql
3. conversations.sql
4. migration-full-description.sql
5. system-messages.sql

После этого база готова к работе!
