# Code Snippets & Copy-Paste Examples

## 1. Копирование SQL в Supabase (всё в одном куске)

```sql
-- ============================================================================
-- COPY & PASTE THIS INTO: Supabase Dashboard → SQL Editor → New Query
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    feature_id TEXT,
    kind TEXT DEFAULT 'clinical_priority',
    stars INTEGER NOT NULL,
    telegram_charge_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_charge_id ON payments(telegram_charge_id);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user_date ON payments(user_id, created_at DESC);

CREATE OR REPLACE VIEW payments_daily_summary AS
    SELECT 
        DATE(created_at) as payment_date,
        COUNT(*) as total_transactions,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(stars) as total_stars
    FROM payments
    GROUP BY DATE(created_at)
    ORDER BY payment_date DESC;

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

ALTER TABLE payments ADD CONSTRAINT check_stars_positive CHECK (stars > 0);
ALTER TABLE payments ADD CONSTRAINT check_user_id_not_empty CHECK (user_id != '');

-- ============================================================================
-- Verify: Run these to check
-- ============================================================================

-- SELECT * FROM information_schema.tables WHERE table_name = 'payments';
-- SELECT * FROM pg_indexes WHERE tablename = 'payments';
-- SELECT * FROM payments ORDER BY created_at DESC LIMIT 10;
```

**Click "Run" button → Should see "Query executed successfully"**

---

## 2. Копирование Environment Variables в Render

Откройте **Render Dashboard → Your Project → Settings → Environment**

Добавьте эти переменные (если их уже нет):

```env
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_FROM_BOTFATHER
VOICEFLOW_API_KEY=YOUR_VOICEFLOW_API_KEY
VOICEFLOW_VERSION_ID=YOUR_VOICEFLOW_VERSION_ID
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
TELEGRAM_CHANNEL_ID=-100YOUR_CHANNEL_ID
NODE_ENV=production
```

**Где найти:**
- `TELEGRAM_BOT_TOKEN` → BotFather in Telegram
- `VOICEFLOW_API_KEY` → Voiceflow Dashboard → Settings → API
- `VOICEFLOW_VERSION_ID` → Voiceflow Dashboard → Project ID (e.g., 67a...)
- `SUPABASE_URL` → Supabase Dashboard → Settings → API → Project URL
- `SUPABASE_SERVICE_ROLE_KEY` → Supabase Dashboard → Settings → API → Service role key
- `TELEGRAM_CHANNEL_ID` → Forward message from your channel to @userinfobot

---

## 3. Deploy на GitHub

```bash
# Terminal: открыть в папке c:\Users\User\Downloads\telegram chat bot\vf-telegram-bot

cd "c:\Users\User\Downloads\telegram chat bot\vf-telegram-bot"

git add -A
git commit -m "Add Telegram Stars clinical priority payment integration"
git push origin main

# Render автоматически redeploy!
# Проверьте: Render Dashboard → Deployments (должен быть новый с галочкой ✅)
```

---

## 4. Тестирование в Telegram (Copy & Send)

### Отправьте боту:

```
CLINICAL_PRIORITY|my_first_test_idea
```

### Bot должен ответить:

```
Открыл оплату ⭐️. После оплаты я подтвержу статус.
```

### Проверьте Supabase:

```sql
-- Откройте Supabase Dashboard → SQL Editor → New Query

SELECT * FROM payments ORDER BY created_at DESC LIMIT 5;

-- Должна быть запись с вашим user_id
```

---

## 5. Voiceflow Button (Send Message)

**В Voiceflow диаграмме: Choice → Button:**

- Button text: `🧬 Применить приоритет (300 ⭐️)`
- Next block: `Send Message` блок с текстом:

```
CLINICAL_PRIORITY|{variable_feature_id}
```

(Замените `{variable_feature_id}` на переменную вашего диалога где хранится ID идеи)

---

## 6. Voiceflow Custom Action (Advanced)

```javascript
// В Voiceflow: Custom Action блок

const featureId = context.variables.feature_id || "unknown";

if (!featureId) {
    actions.sendMessage("❌ Ошибка: нет ID идеи");
    return;
}

console.log("Clinical Priority Payment Request", {
    featureId: featureId,
    timestamp: new Date().toISOString()
});

actions.sendMessage(`CLINICAL_PRIORITY|${featureId}`);
```

---

## 7. Проверка логов в Render

**Откройте:** Render Dashboard → Your Project → Logs

**Ищите такие сообщения:**

```
💰 CLINICAL_PRIORITY trigger detected: { userId: '123456789', featureId: 'my_test_idea' }
✅ Invoice sent successfully
🔘 pre_checkout_query received: { id: 'checkout_123', from_id: '123456789', currency: 'XTR', total_amount: 300 }
✅ pre_checkout_query validated and accepted
💰 successful_payment received: { telegram_payment_charge_id: 'charge_xyz', total_amount: 300, currency: 'XTR' }
✅ Payment saved to Supabase: 1234
✅ voiceflowEvent sent: clinical_priority_paid for user 123456789
✅ Channel log sent
✅ successful_payment processing completed
```

---

## 8. Проверка платежей в Supabase

**Откройте:** Supabase Dashboard → SQL Editor → New Query

```sql
-- Все платежи
SELECT * FROM payments ORDER BY created_at DESC;

-- Платежи за последние 7 дней
SELECT * FROM payments WHERE created_at >= NOW() - INTERVAL '7 days';

-- Количество платежей по дням
SELECT DATE(created_at), COUNT(*), SUM(stars) 
FROM payments 
GROUP BY DATE(created_at) 
ORDER BY DATE(created_at) DESC;

-- Уникальные пользователи
SELECT COUNT(DISTINCT user_id) as unique_users FROM payments;

-- Total Stars
SELECT SUM(stars) as total_stars FROM payments;

-- Top features
SELECT feature_id, COUNT(*), SUM(stars) 
FROM payments 
GROUP BY feature_id 
ORDER BY COUNT DESC;

-- View: Daily summary (готовая аналитика)
SELECT * FROM payments_daily_summary;

-- View: User history
SELECT * FROM payments_user_summary LIMIT 10;
```

---

## 9. Rate-Limit Тестирование

**Отправьте боту ДВАЖДЫ за 60 сек одно и то же:**

```
CLINICAL_PRIORITY|same_feature_id
CLINICAL_PRIORITY|same_feature_id   ← вторая попытка
```

**Первый раз:** Bot откроет invoice  
**Второй раз (менее чем за 60 сек):** Bot ответит:

```
⏳ Вы уже создали счёт на эту идею менее 60 секунд назад. Попробуйте позже.
```

---

## 10. Проверка хост-функционала (голосование)

**Убедитесь что старая функция voting всё ещё работает:**

```
/start   → Bot отвечает приветствием
Фото     → Bot выполняет OCR
PDF      → Bot извлекает текст
Обычное текстовое сообщение (не CLINICAL_PRIORITY|...) → Отправляет в Voiceflow
```

**Ничего из этого не должно сломаться!**

---

## 11. Проверка Voiceflow интеграции

1. **В Voiceflow диаграмме:** Добавьте Send Message блок с текстом:
   ```
   CLINICAL_PRIORITY|test_feature_001
   ```

2. **Протестируйте диалог в Voiceflow Interact:**
   - Должен видеть сообщение CLINICAL_PRIORITY|...

3. **В реальном Telegram:**
   - User доходит до этого блока в диаграмме
   - Bot отправляет invoice
   - User платит
   - Bot отправляет event в Voiceflow

4. **Проверьте что диалог продолжается** после платежа

---

## 12. Отладка: Что делать если что-то не работает

### "Bot не ответил на CLINICAL_PRIORITY|..."

```bash
# Проверьте:
1. В Render logs есть ли сообщение о webhook update?
   → Если нет: Telegram webhook не настроена правильно

2. В Render logs есть ли "CLINICAL_PRIORITY trigger detected"?
   → Если нет: Текст сообщения не начинается с CLINICAL_PRIORITY|

3. В Render logs есть ли "Invoice sent successfully"?
   → Если нет: Ошибка при создании invoice (check logs для деталей)
```

### "Таблица 'payments' не существует"

```bash
# Решение:
1. Откройте Supabase Dashboard → SQL Editor
2. Выполните SQL из payments.sql (см. выше)
3. Проверьте: SELECT * FROM information_schema.tables WHERE table_name = 'payments';
```

### "env VOICEFLOW_API_KEY не найден"

```bash
# Проверьте:
1. Render Dashboard → Settings → Environment
2. Убедитесь что VOICEFLOW_API_KEY установлена (не пустая)
3. Нажмите "Save"
4. Подождите пока Render redeploy
```

### "Платёж прошёл, но bot не ответил"

```bash
# Проверьте Render logs:
1. Есть ли "successful_payment received"? → Если да: платёж дошёл до бота
2. Есть ли "Payment saved to Supabase"? → Если да: запись создана в БД
3. Есть ли ошибка?
   - ❌ Supabase connection error → проверьте SUPABASE_SERVICE_ROLE_KEY
   - ❌ Voiceflow event error → проверьте VOICEFLOW_API_KEY
   - ❌ Other → прочитайте error message в логах
```

---

## 13. Всё работает? ✅

**Чек-лист успеха:**

- [x] SQL выполнен в Supabase
- [x] Environment variables установлены в Render
- [x] Code deployed на GitHub
- [x] Render logs показывают "Webhook server listening"
- [x] Bot отвечает на CLINICAL_PRIORITY| сообщения
- [x] Invoice открывается в Telegram
- [x] Платёж прошёл успешно
- [x] Supabase таблица содержит запись
- [x] Voiceflow может отправлять trigger сообщения
- [x] Voiceflow может получать events
- [x] Старая функция voting всё ещё работает
- [x] Нет синтаксических ошибок

**Поздравляем! 🎉 Telegram Stars платежи работают!**

---

## 14. Дальнейшее развитие

### Расширить на другие типы платежей:

Поменять в handler:
```javascript
// Вместо:
if (text.startsWith('CLINICAL_PRIORITY|')) {

// Использовать:
if (text.startsWith('PRIORITY|')) {
    const [_, priorityType, featureId] = text.split('|');
    
    let amount = 0;
    let title = '';
    
    if (priorityType === 'urgent') {
        amount = 500;
        title = '⚡ Срочный обзор (3 дня)';
    } else if (priorityType === 'clinical') {
        amount = 300;
        title = '🧬 Клинический приоритет (10 дней)';
    }
    // ... resto логики
}
```

### Добавить analytics endpoint:

```javascript
app.get('/api/stats/payments', async (req, res) => {
    const { count: total } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true });
    
    const { data: byDate } = await supabase
        .from('payments_daily_summary')
        .select('*');
    
    return res.json({
        total_payments: total,
        by_date: byDate,
        // ... more stats
    });
});
```

---

**Всё готово для deployment! 🚀**

*Last Updated: 2026-01-11*
