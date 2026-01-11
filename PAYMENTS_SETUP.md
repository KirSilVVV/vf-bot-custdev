# Интеграция Telegram Stars - Клинический приоритет

## 1. SQL - Создание таблицы payments

Выполните следующий SQL в Supabase Dashboard → SQL Editor:

```sql
-- Create payments table for Telegram Stars transactions
CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    feature_id TEXT,
    kind TEXT DEFAULT 'clinical_priority',
    stars INTEGER NOT NULL,
    telegram_charge_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups by user_id and charge_id
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_charge_id ON payments(telegram_charge_id);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Optional: Row Level Security (if you want to restrict access)
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
```

**Что делает:**
- `id` - уникальный идентификатор платежа
- `user_id` - Telegram User ID (строка, тоже самое `ctx.from.id`)
- `feature_id` - идентификатор идеи/функции (из payload)
- `kind` - тип платежа (сейчас всегда `'clinical_priority'`, но может быть расширено)
- `stars` - количество Stars (сейчас 300 за клинический приоритет)
- `telegram_charge_id` - уникальный идентификатор платежа от Telegram (**UNIQUE** для защиты от дублей)
- `created_at` - время платежа (автоматически)

---

## 2. Как Voiceflow кнопка должна отправлять CLINICAL_PRIORITY

### Вариант A: Custom Action в Voiceflow (рекомендуется)

1. В Voiceflow диаграмме добавьте Custom Action:
   ```javascript
   // Custom Action в Voiceflow (JavaScript)
   // Выполняется при клике на кнопку "🧬 Применить приоритет"
   
   // Доступные переменные: feature_id (переменная диалога с ID идеи)
   
   const message = `CLINICAL_PRIORITY|${feature_id}`;
   actions.sendMessage(message);
   ```

2. Или используйте кнопку Send Message (простой вариант):
   - Текст кнопки: `🧬 Применить клинический приоритет`
   - Сообщение при клике: `CLINICAL_PRIORITY|{feature_id}`
   - (замените `{feature_id}` на переменную из диалога)

### Вариант B: Send Message в Telegram через Voiceflow

Если у вас есть интеграция Telegram в Voiceflow:
- Message: `CLINICAL_PRIORITY|{variable_feature_id}`
- Telegram отправит это как обычное сообщение
- Bot перехватит и откроет invoice

### Вариант C: Кнопка в Telegram (для testing)

Пользователь может написать вручную:
```
CLINICAL_PRIORITY|feature_abc_123
```

Bot ответит invoice для оплаты.

---

## 3. Поток оплаты (детально)

```
User (Telegram)
    ↓
    сообщение: "CLINICAL_PRIORITY|feature_abc_123"
    ↓
bot.on('text') handler
    ↓ (проверка rate-limit)
    ↓
ctx.sendInvoice()
    ↓ (пользователь видит "Оплатить 300 ⭐️")
    ↓
User нажимает "Оплатить via Telegram Stars"
    ↓
bot.on('pre_checkout_query')
    ├─ validate: kind == 'clinical_priority'
    ├─ validate: amount == 300
    ├─ validate: currency == 'XTR'
    ↓
ctx.answerPreCheckoutQuery(true) → ✅ Одобрено
    ↓
User подтверждает в Telegram Stars app
    ↓
bot.on('successful_payment') handler
    ├─ Parse invoice_payload
    ├─ Check duplicate (telegram_charge_id in DB)
    ├─ Insert into payments table
    ├─ Send Voiceflow event: clinical_priority_paid
    ├─ ctx.reply("✅ Спасибо!")
    ├─ [Optional] Send to channel log
    ↓
Voiceflow получает event
    ├─ Может обновить диалог
    ├─ Может отправить сообщение "приоритет активирован"
    ↓
END
```

---

## 4. Environment variables (уже должны быть в Render)

```env
# Обязательные (уже используются)
TELEGRAM_BOT_TOKEN=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
TELEGRAM_CHANNEL_ID=...

# Для Voiceflow (обязательные для функции payments)
VOICEFLOW_API_KEY=...
VOICEFLOW_VERSION_ID=...

# Опционально (можно не устанавливать)
NODE_ENV=production   # Автоматически = production на Render
RENDER_EXTERNAL_URL=  # Автоматически устанавливается Render
```

**Важно:** Все переменные должны быть установлены в Render Dashboard → Environment before deployment.

---

## 5. Тестирование в dev режиме (polling)

1. Убедитесь что `.env` файл содержит:
   ```env
   TELEGRAM_BOT_TOKEN=...
   VOICEFLOW_API_KEY=...
   VOICEFLOW_VERSION_ID=...
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   TELEGRAM_CHANNEL_ID=...
   NODE_ENV=development
   ```

2. Запустите бот:
   ```bash
   npm start
   ```
   или
   ```bash
   node index.js
   ```

3. Отправьте сообщение боту:
   ```
   CLINICAL_PRIORITY|test_feature_123
   ```

4. Bot должен ответить:
   ```
   Открыл оплату ⭐️. После оплаты я подтвержу статус.
   ```

5. Проверьте логи:
   ```
   💰 CLINICAL_PRIORITY trigger detected: { userId: '123456789', featureId: 'test_feature_123', ... }
   ✅ Invoice sent successfully
   ```

6. **В dev режиме invoice может не открыться** (нужен настоящий бот и Telegram app), но логи покажут, что обработка правильная.

---

## 6. Тестирование в prod (Render)

1. Убедитесь что Render dashboard содержит все env variables (см. п. 4)

2. Push code на GitHub:
   ```bash
   git add -A
   git commit -m "Add Telegram Stars clinical priority payment integration"
   git push origin main
   ```

3. Render автоматически redeploy

4. Проверьте логи в Render Dashboard → Logs:
   ```
   ✅ Webhook server is listening on 0.0.0.0:3000
   ✅ Telegram webhook set to: https://vf-telegram-bot.onrender.com/webhook
   ```

5. Отправьте сообщение боту в Telegram:
   ```
   CLINICAL_PRIORITY|my_feature_id
   ```

6. Должна появиться invoice для оплаты

7. Проверьте логи в Render при оплате

---

## 7. Структура payload в invoice

Когда вы отправляете invoice, payload это JSON строка:
```json
{
  "kind": "clinical_priority",
  "feature_id": "my_feature_id",
  "user_id": "123456789",
  "ts": 1705000000
}
```

Этот payload:
- Передаётся в `pre_checkout_query` → валидируется
- Передаётся в `successful_payment` → парсится и используется для Voiceflow event
- Не содержит секретов (безопасно)

---

## 8. Rate-limiting

В коде используется в памяти Map (обнуляется при перезагрузке бота):
```javascript
const clinicalPriorityInvoiceCache = new Map();
// key: "userId:featureId"
// value: timestamp последний раз, когда выдали invoice
// Защита: не более 1 invoice в 60 сек на один feature_id
```

Если пользователь попробует создать invoice дважды за 60 сек:
```
Ответ: "⏳ Вы уже создали счёт на эту идею менее 60 секунд назад. Попробуйте позже."
```

---

## 9. Дедупликация платежей

Если `successful_payment` придёт дважды (маловероятно, но возможно):

1. Проверяем `telegram_charge_id` в базе:
   ```sql
   SELECT id FROM payments WHERE telegram_charge_id = 'charge_xyz'
   ```

2. Если уже есть → **не обрабатываем повторно**
   - Не добавляем ещё один payment
   - Не отправляем Voiceflow event ещё раз
   - Логируем: "⚠️ Duplicate payment"

3. Если нет → обрабатываем нормально

Это гарантирует что один платёж будет записан ровно один раз.

---

## 10. Проблемы и их решение

| Проблема | Решение |
|----------|---------|
| Invoice не открывается в dev | Нормально - нужна Telegram app на мобильнике и настоящий бот в prod |
| `ERR_HTTP_HEADERS_SENT` | Проверьте что payment handler не вызывает `ctx.reply()` дважды |
| Платёж прошёл, но в DB нет записи | Проверьте SUPABASE_SERVICE_ROLE_KEY в .env |
| Voiceflow event не пришёл | Проверьте VOICEFLOW_API_KEY и VOICEFLOW_VERSION_ID |
| Rate-limit мешает при тестировании | Подождите 60 сек или перезагрузите бот |
| Channel log сообщение с ошибкой в разметке | Используем Markdown: \*\*bold\*\*, \_italic\_ |

---

## 11. Мониторинг платежей в Supabase

Смотрите платежи в Supabase Dashboard:

```sql
-- Все платежи
SELECT * FROM payments ORDER BY created_at DESC;

-- Платежи за последние 7 дней
SELECT * FROM payments 
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- Количество уникальных пользователей
SELECT COUNT(DISTINCT user_id) as unique_users, COUNT(*) as total_payments
FROM payments;

-- Сумма Stars
SELECT SUM(stars) as total_stars FROM payments;
```

---

## 12. Безопасность

✅ **Что защищено:**
- Rate-limit по feature_id + user_id (min 60 сек между invoice)
- Validation в pre_checkout_query (проверяем kind, amount, currency)
- Дедупликация по telegram_charge_id (UNIQUE constraint)
- Payload парсится и валидируется

⚠️ **Что НЕ защищено:**
- User может отправить `CLINICAL_PRIORITY|fake_feature_id` 
  - Это OK: invoice создастся, но fake_feature_id просто сохранится в DB
- User может отправить несколько `CLINICAL_PRIORITY|id` за 60 сек
  - Rate-limit их остановит

**Вывод:** Система достаточно защищена для MVP. Для продакшена рекомендуем:
- Добавить IP whitelist для webhook
- Использовать webhook secret token в header
- Логировать все платежи в centralized logger (CloudFlare, LogRocket, etc)

---

## 13. Следующие шаги

После интеграции платежей:
1. ✅ Создать таблицу payments (SQL выше)
2. ✅ Код payments handlers уже в index.js
3. ✅ Voiceflow button отправляет CLINICAL_PRIORITY|feature_id
4. ✅ Deploy на Render
5. ✅ Тестировать в реальном Telegram
6. 📊 Мониторить платежи в Supabase
7. 🎯 Расширить другими типами платежей (если нужно)

---

**Created:** 2026-01-11  
**Version:** 1.0  
**Status:** Ready for implementation
