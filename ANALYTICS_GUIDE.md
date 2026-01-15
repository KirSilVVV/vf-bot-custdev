# 📊 Analytics Guide - AI Conversations & User Behavior

## 🗄️ Database Tables

### 1. **conversations** - История диалогов с AI
```sql
- user_id, user_name
- session_id (уникальный ID диалога)
- message_number (номер сообщения в диалоге: 1, 2, 3...)
- message_text (что написал пользователь)
- ai_response (что ответил AI)
- ready_to_publish (true когда AI предложил опубликовать)
- published (true если пользователь опубликовал идею)
- created_at
```

### 2. **requests** - Опубликованные идеи
```sql
- user_id, user_name
- request_text (финальная идея)
- vote_count (количество голосов)
- channel_message_id
- created_at
```

### 3. **payments** - Платежи за клинический приоритет
```sql
- user_id
- feature_id
- stars (количество звезд)
- telegram_charge_id
- created_at
```

---

## 📈 Useful Analytics Queries

### Среднее количество сообщений до публикации
```sql
SELECT AVG(message_number) as avg_messages_before_publish
FROM conversations 
WHERE ready_to_publish = true;
```

### Конверсия (% пользователей опубликовавших идею)
```sql
SELECT 
  COUNT(DISTINCT CASE WHEN published THEN session_id END) * 100.0 / 
  COUNT(DISTINCT session_id) as conversion_rate
FROM conversations;
```

### Топ активных пользователей
```sql
SELECT 
  user_id, 
  user_name, 
  COUNT(DISTINCT session_id) as sessions,
  COUNT(*) as total_messages
FROM conversations 
GROUP BY user_id, user_name 
ORDER BY sessions DESC 
LIMIT 10;
```

### Количество диалогов по дням
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(DISTINCT session_id) as sessions
FROM conversations
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Abandoned vs Completed Sessions
```sql
SELECT 
  CASE 
    WHEN published THEN 'Published' 
    ELSE 'Abandoned' 
  END as status,
  COUNT(DISTINCT session_id) as count
FROM conversations
WHERE ready_to_publish = true
GROUP BY published;
```

### Самые популярные идеи (топ по голосам)
```sql
SELECT 
  r.id,
  r.user_name,
  r.request_text,
  r.vote_count,
  r.created_at
FROM requests r
ORDER BY r.vote_count DESC
LIMIT 10;
```

### Revenue от клинического приоритета
```sql
SELECT 
  COUNT(*) as total_payments,
  SUM(stars) as total_stars,
  AVG(stars) as avg_stars_per_payment
FROM payments
WHERE kind = 'clinical_priority';
```

### Users who paid for priority
```sql
SELECT 
  p.user_id,
  COUNT(*) as payments,
  SUM(p.stars) as total_spent
FROM payments p
GROUP BY p.user_id
ORDER BY total_spent DESC;
```

---

## 🚀 Setup Instructions

### 1. Create conversations table in Supabase

1. Go to **Supabase Dashboard** → Your Project
2. Click **SQL Editor** (left sidebar)
3. Click **New query**
4. Copy-paste content from `conversations.sql`
5. Click **Run** (or press Ctrl+Enter)
6. ✅ Confirm: "Success. No rows returned"

### 2. Verify tables exist

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
AND table_name IN ('conversations', 'requests', 'payments');
```

Should return 3 rows.

### 3. Test with sample data

Bot will automatically log conversations when users chat with AI.

---

## 📊 Dashboard Ideas (Metabase/Retool/Excel)

### Key Metrics to Track:

1. **Engagement**
   - Total sessions per day/week
   - Average messages per session
   - Peak usage hours

2. **Conversion**
   - % of sessions that end with publication
   - % of ideas that get paid priority
   - Average time from start to publish

3. **Content Quality**
   - Most common problem keywords
   - Average idea length
   - Ideas with most votes

4. **Revenue**
   - Total Stars collected
   - Conversion rate to payment
   - Average Stars per active user

---

## 🔍 Example Workflow

1. User starts chat: `/start`
2. Sends idea: "Хочу записаться к врачу быстрее"
3. AI asks: "Какую именно проблему хочешь решить?" → **logged to conversations**
4. User replies: "Нет мест на неделю вперед" → **logged**
5. AI asks: "Как видишь решение?" → **logged**
6. User replies: "Лист ожидания" → **logged with ready_to_publish=true**
7. User clicks "Опубликовать" → **published=true updated**
8. Idea posted to channel → **saved to requests table**

Now you can analyze:
- How many questions AI asked (check message_number)
- What problems users mentioned (search in message_text)
- Conversion rate (published sessions / total sessions)

---

## 🎯 A/B Testing System Prompts

Want to test different AI approaches?

1. Create `system_prompt_variant` column in conversations
2. Log which prompt version was used
3. Compare conversion rates:

```sql
SELECT 
  system_prompt_variant,
  COUNT(DISTINCT session_id) as sessions,
  COUNT(DISTINCT CASE WHEN published THEN session_id END) * 100.0 / 
    COUNT(DISTINCT session_id) as conversion_rate
FROM conversations
GROUP BY system_prompt_variant;
```

This helps you optimize AI behavior based on data! 📈
