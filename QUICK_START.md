# 🧬 Telegram Stars Integration - Quick Start

## Что добавлено

✅ **Триггер оплаты**: Сообщение `CLINICAL_PRIORITY|feature_id` → invoice в Telegram Stars (300 ⭐️)  
✅ **Payment handlers**: `pre_checkout_query` + `successful_payment` перехватывают и обрабатывают платежи  
✅ **Voiceflow event**: После платежа бот отправляет `clinical_priority_paid` событие в Voiceflow  
✅ **Rate-limit**: Защита от спама (max 1 invoice в 60 сек на feature_id)  
✅ **Дедупликация**: Защита от дублей платежей по `telegram_charge_id` (UNIQUE)  
✅ **Supabase интеграция**: Таблица `payments` с индексами + views для аналитики  
✅ **Логирование**: Подробные логи без чувствительных данных  

---

## 3 шага для deploy

### 1️⃣ Создать таблицу Supabase

Откройте **Supabase Dashboard → SQL Editor** и выполните:
```sql
-- Copy content from payments.sql file (or paste from PAYMENTS_SETUP.md)
CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    feature_id TEXT,
    kind TEXT DEFAULT 'clinical_priority',
    stars INTEGER NOT NULL,
    telegram_charge_id TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_charge_id ON payments(telegram_charge_id);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
```

**✅ Done:** Таблица готова для записи платежей

### 2️⃣ Убедиться что в Render Dashboard установлены env variables

```env
TELEGRAM_BOT_TOKEN=...
VOICEFLOW_API_KEY=...
VOICEFLOW_VERSION_ID=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
TELEGRAM_CHANNEL_ID=...
```

**Проверка:** Все 6 переменных должны быть в Render Dashboard → Settings → Environment.

### 3️⃣ Deploy код на GitHub

```bash
cd "c:\Users\User\Downloads\telegram chat bot\vf-telegram-bot"
git add -A
git commit -m "Add Telegram Stars clinical priority payment integration"
git push origin main
```

Render автоматически redeploy.

**✅ Ready:** После Deploy пробуйте платежи!

---

## Тестирование

### В Telegram:

1. Напишите боту:
   ```
   CLINICAL_PRIORITY|test_feature_123
   ```

2. Bot ответит:
   ```
   Открыл оплату ⭐️. После оплаты я подтвержу статус.
   ```

3. Должна появиться invoice "🧬 Клинический приоритет" (300 ⭐️)

4. Нажмите "Pay via Telegram Stars"

5. После оплаты bot ответит:
   ```
   ✅ Спасибо! Статус 🧬 «Клинический приоритет» применён. 
   Мы учтём идею в ближайшем обзоре приоритетных предложений.
   ```

### Проверьте Supabase:

```sql
SELECT * FROM payments ORDER BY created_at DESC LIMIT 5;
```

Должна быть запись с вашим `user_id`.

---

## Voiceflow интеграция

### Вариант A: Send Message (простой)

В Voiceflow Choice блок:
- Button text: `🧬 Применить приоритет (300 ⭐️)`
- Send message: `CLINICAL_PRIORITY|{variable_feature_id}`

Готово! Когда пользователь нажимает кнопку → bot отправляет invoice.

### Вариант B: Custom Action (продвинутый)

```javascript
// Custom Action в Voiceflow:
const featureId = context.variables.feature_id || "unknown";
if (!featureId) {
    actions.sendMessage("❌ Ошибка: нет ID идеи");
    return;
}
actions.sendMessage(`CLINICAL_PRIORITY|${featureId}`);
```

---

## Обработка платежей в Voiceflow

После успешной оплаты bot отправляет в Voiceflow:

```javascript
voiceflowEvent(userId, 'clinical_priority_paid', {
    feature_id: 'test_feature_123',
    stars: 300,
    telegram_payment_charge_id: 'charge_...'
});
```

Voiceflow может ловить это событие и отправить сообщение, обновить статус идеи, etc.

Подробнее см. [VOICEFLOW_EXAMPLES.md](VOICEFLOW_EXAMPLES.md)

---

## Структура добавленного кода

```
index.js (обновлён)
├─ Lines ~110: Rate-limit Map (clinicalPriorityInvoiceCache)
├─ Lines ~120: Function canIssueClinicalPriorityInvoice()
├─ Lines ~320: Function voiceflowEvent() - отправляет events в Voiceflow
├─ Lines ~350: bot.on('text') - ОБНОВЛЁН (перехватывает CLINICAL_PRIORITY|)
├─ Lines ~423: bot.on('pre_checkout_query') - НОВЫЙ (валидирует платёж)
├─ Lines ~480: bot.on('successful_payment') - НОВЫЙ (обрабатывает платёж)
├─ Lines ~570: bot.on('callback_query') - старый (голосование, не изменён)

Новые файлы:
├─ PAYMENTS_SETUP.md (подробная документация)
├─ payments.sql (SQL для таблицы payments)
├─ VOICEFLOW_EXAMPLES.md (примеры интеграции с Voiceflow)
└─ QUICK_START.md (этот файл)
```

---

## Часто задаваемые вопросы

### Q: Почему 300 Stars?
**A:** Это можно менять. Просто изменить `amount: 300` в `ctx.sendInvoice()` на любое число.

### Q: Может ли быть другие типы платежей?
**A:** Да! Увеличьте `kind` field в таблице (urgent, standard, etc) и добавьте logic в handler.

### Q: Работает ли в dev режиме?
**A:** Да, логи будут, но invoice может не открыться (нужен настоящий Telegram bot + app).

### Q: Что если платёж дублировался?
**A:** Защита: UNIQUE constraint на `telegram_charge_id` в DB + проверка перед вставкой.

### Q: Где смотреть логи платежей?
**A:** 
- **Render:** Dashboard → Logs (live)
- **Supabase:** Dashboard → SQL → SELECT FROM payments
- **Telegram:** Бот будет отправлять уведомления в канал

### Q: Как вернуть деньги?
**A:** Пока нет встроенной функции. Нужно реализовать отдельно (Telegram API `refundStar`).

---

## Troubleshooting

| Ошибка | Решение |
|--------|---------|
| Invoice не открывается в dev | Это норм - нужен настоящий Telegram bot |
| "Table 'payments' does not exist" | Выполните SQL из шага 1️⃣ |
| Bot не отвечает на CLINICAL_PRIORITY | Проверьте что `NODE_ENV` не "development" (используйте webhook) |
| Voiceflow event не приходит | Проверьте VOICEFLOW_API_KEY и VOICEFLOW_VERSION_ID |
| Платёж прошёл, но bot не ответил | Проверьте Render logs - может быть ошибка в обработке |
| Rate-limit мешает тестировать | Подождите 60 сек или перезагрузите бот |

---

## Что дальше?

1. ✅ Протестировать платежи в реальном Telegram
2. ✅ Настроить Voiceflow кнопку (Send Message или Custom Action)
3. ✅ Проверить что Voiceflow получает события платежей
4. 📊 Мониторить платежи (SQL queries или views в Supabase)
5. 🎯 Расширить на другие типы платежей (если нужно)
6. 🔐 Добавить Security (IP whitelist, webhook secret, etc) для production

---

## Документация

- 📄 [PAYMENTS_SETUP.md](PAYMENTS_SETUP.md) - полная документация (17 разделов)
- 🎨 [VOICEFLOW_EXAMPLES.md](VOICEFLOW_EXAMPLES.md) - примеры интеграции с Voiceflow
- 🗄️ [payments.sql](payments.sql) - SQL схема с комментариями
- 📝 [index.js](index.js) - исходный код (755 строк)

---

**Статус:** ✅ Ready for production (v1.0)  
**Дата:** 2026-01-11  
**Maintainer:** VF Telegram Bot Team

---

## Полезные команды

```bash
# Просмотр последних платежей в Supabase (SQL)
SELECT * FROM payments ORDER BY created_at DESC LIMIT 10;

# Просмотр уникальных пользователей
SELECT COUNT(DISTINCT user_id) FROM payments;

# Просмотр total Stars
SELECT SUM(stars) as total FROM payments;

# Просмотр платежей за последние 7 дней
SELECT * FROM payments WHERE created_at >= NOW() - INTERVAL '7 days';
```

---

**Готово! Наслаждайтесь Telegram Stars интеграцией! 🎉**
