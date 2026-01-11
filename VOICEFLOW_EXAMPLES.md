# Примеры интеграции с Voiceflow - Клинический приоритет

## 1. Простой пример: Send Message button в Voiceflow

**Сценарий:** Пользователь завершил описание идеи. Voiceflow спрашивает:
> "Хотите применить клинический приоритет для ускорения?"

**Реализация:**

### В Voiceflow диаграмме:

1. Добавьте блок **Text**:
   ```
   Text (Response Block):
   
   Message: "Для ускорения рассмотрения эксперты рекомендуют отметить идею 
   как 🧬 **Клинически значимую** (300 ⭐️ Telegram Stars). 
   Это не гарантирует релиз, но повышает шанс приоритетного рассмотрения."
   ```

2. Добавьте блок **Choice** (Buttons):
   ```
   Label: "Выбор действия"
   
   Option 1:
   - Button text: "🧬 Применить приоритет (300 ⭐️)"
   - Next block: [Custom Action или Send Message]
   
   Option 2:
   - Button text: "❌ Пропустить"
   - Next block: [End or confirmation]
   ```

3. На Option 1 - добавьте **Send Message** блок:
   ```
   Message to send:
   CLINICAL_PRIORITY|{variable_feature_id}
   
   (Используйте переменную вашего диалога, где хранится ID идеи)
   ```

### Результат:

Когда пользователь нажимает кнопку:
- Voiceflow отправляет сообщение: `CLINICAL_PRIORITY|the_idea_id_123`
- Bot перехватывает это в `bot.on('text')` handler
- Bot отправляет invoice
- Пользователь платит 300 Stars
- Bot отправляет Voiceflow event `clinical_priority_paid` с деталями
- Voiceflow может продолжить диалог (например, показать "спасибо" или следующий вопрос)

---

## 2. Advanced: Custom Action в Voiceflow (JavaScript)

Если вам нужна более сложная логика перед отправкой:

**Custom Action блок в Voiceflow:**

```javascript
// Custom Action: Prepare Clinical Priority Payment

// Variables from dialog:
const featureId = context.variables.feature_id || "unknown";
const featureTitle = context.variables.feature_title || "Новая идея";
const authorName = context.variables.author_name || "Автор";

// Validation (optional)
if (!featureId) {
    actions.sendMessage("❌ Ошибка: не удалось получить ID идеи. Попробуйте снова.");
    return;
}

// Log for debugging
console.log("Clinical Priority Payment Request", {
    featureId,
    featureTitle,
    authorName,
    timestamp: new Date().toISOString()
});

// Send trigger message to Telegram bot
const triggerMessage = `CLINICAL_PRIORITY|${featureId}`;
actions.sendMessage(triggerMessage);

// Optional: Also send friendly message
actions.sendMessage(`📤 Отправляю запрос на оплату клинического приоритета для идеи: **${featureTitle}**`);
```

**Результат:**
- Проверяет что featureId существует
- Логирует попытку (удобно для дебага)
- Отправляет trigger сообщение боту
- Отправляет friendly сообщение пользователю

---

## 3. Full Dialog Example (Voiceflow Diagram)

```
START
  ↓
[Text] "Привет! Расскажи о своей идее для МедЭйI"
  ↓
[User Input] → variable: user_idea
  ↓
[Text] "Спасибо за идею: {user_idea}"
  ↓
[Text] "Эксперты рекомендуют применить 🧬 Клинический приоритет (300 ⭐️)?"
  ↓
[Choice: Yes/No]
  ├─→ [Yes]
  │    ↓
  │    [Send Message] "CLINICAL_PRIORITY|idea_{timestamp}"
  │    ↓
  │    [Text] "✅ Счёт отправлен. Платёж будет обработан автоматически."
  │    ↓
  │    [Wait] 3-5 seconds (for payment to process)
  │    ↓
  │    [Custom Action] Check Voiceflow event (if received clinical_priority_paid)
  │    ├─→ [If paid]
  │    │    ↓
  │    │    [Text] "🎉 Спасибо за приоритет! Экспертный обзор ускорен."
  │    │    ↓
  │    │    END
  │    │
  │    └─→ [If not paid / timeout]
  │         ↓
  │         [Text] "⏳ Платёж на обработке (может занять минуту)"
  │         ↓
  │         END
  │
  └─→ [No]
       ↓
       [Text] "Понял. Тогда идея будет рассмотрена в обычном порядке."
       ↓
       END
```

---

## 4. Обработка события clinical_priority_paid в Voiceflow

**Когда bot отправляет Voiceflow event:**

```javascript
// В successful_payment handler (в index.js) отправляется:
voiceflowEvent(userId, 'clinical_priority_paid', {
    feature_id: 'idea_123',
    stars: 300,
    telegram_payment_charge_id: 'charge_abc_xyz'
});

// Voiceflow МОЖЕТ ловить это событие через Event блок
```

**Как ловить в Voiceflow:**

1. Добавьте блок **Event**:
   ```
   Event name: "clinical_priority_paid"
   ```

2. Чтобы логировать платёж в диалог, используйте Custom Action:
   ```javascript
   // Custom Action: Handle Payment Success
   
   const featureId = event.data.feature_id;
   const stars = event.data.stars;
   const chargeId = event.data.telegram_payment_charge_id;
   
   // Update context variables
   context.variables.priority_payment_done = true;
   context.variables.payment_amount = stars;
   context.variables.payment_charge_id = chargeId;
   
   // Send message to user
   actions.sendMessage(`✅ Платёж прошёл! ${stars} ⭐️ получены. Приоритет активирован.`);
   
   // Log to external system (optional)
   console.log("Clinical Priority Payment Success", {
       featureId,
       stars,
       chargeId,
       userId: context.userId
   });
   ```

---

## 5. Error Handling Examples

### Если пользователь отправил CLINICAL_PRIORITY без ID:

**Telegram bot ответит:**
```
❌ Некорректный формат. Используйте: CLINICAL_PRIORITY|feature_id
```

**В Voiceflow:** Если вы используете Send Message блок:
```javascript
// Custom Action: Validate before sending

const featureId = context.variables.feature_id || null;

if (!featureId) {
    actions.sendMessage("❌ Ошибка: сначала нужно создать идею с ID");
    return; // Don't send CLINICAL_PRIORITY message
}

// OK - proceed
actions.sendMessage(`CLINICAL_PRIORITY|${featureId}`);
```

### Если rate-limit срабатывает:

**Telegram bot ответит:**
```
⏳ Вы уже создали счёт на эту идею менее 60 секунд назад. Попробуйте позже.
```

**В Voiceflow:** Добавьте повторный запрос после паузы:
```javascript
// Custom Action: Retry after delay

const maxRetries = 3;
let retryCount = context.variables.payment_retry_count || 0;

if (retryCount >= maxRetries) {
    actions.sendMessage("Достигнут лимит попыток оплаты. Попробуйте позже.");
    return;
}

// Retry
retryCount++;
context.variables.payment_retry_count = retryCount;

// Wait 90 seconds before allowing next attempt
actions.sendMessage(`⏳ Попытка ${retryCount}/${maxRetries}. Попробуем через минуту...`);
// [Pause block 90 seconds]
```

---

## 6. Testing Checklist

### Dev режим (Node.js locally):

- [ ] `.env` содержит все переменные
- [ ] `npm install` выполнен
- [ ] `npm start` запустился (polling mode)
- [ ] Отправить: `CLINICAL_PRIORITY|test_idea_001`
- [ ] Проверить логи: должны содержать "CLINICAL_PRIORITY trigger detected"
- [ ] Проверить логи: должны содержать "Invoice sent successfully"

### Prod режим (Render):

- [ ] Code pushed на GitHub
- [ ] Render dashboard показывает успешный deploy
- [ ] Webhook logs показывают incoming updates
- [ ] Отправить сообщение боту: `CLINICAL_PRIORITY|test_feature`
- [ ] Bot ответит: "Открыл оплату ⭐️..."
- [ ] In Telegram app: должна появиться кнопка "Pay via Telegram Stars"
- [ ] После платежа: логи должны показать "successful_payment received"
- [ ] Supabase таблица `payments` должна содержать запись

### Voiceflow интеграция:

- [ ] Dialog отправляет `CLINICAL_PRIORITY|feature_id` вместо обычного текста
- [ ] Bot получает и обрабатывает как payment trigger (не как обычное сообщение)
- [ ] После платежа Voiceflow получает event `clinical_priority_paid`
- [ ] Dialog может реагировать на событие (показать спасибо-сообщение)

---

## 7. Примеры Voiceflow диаграмм в JSON

Если вы хотите импортировать готовые блоки:

### Простая версия (без Custom Actions):

```json
{
  "type": "text",
  "payload": {
    "message": "Для ускорения рассмотрения применить 🧬 Клинический приоритет (300 ⭐️)?"
  },
  "next": "choice_block_1"
}
```

### Версия с Choice:

```json
{
  "type": "choice",
  "label": "Priority Payment Choice",
  "options": [
    {
      "name": "apply_priority",
      "button_text": "🧬 Применить (300 ⭐️)",
      "next": "send_trigger"
    },
    {
      "name": "skip_priority",
      "button_text": "❌ Пропустить",
      "next": "end_block"
    }
  ]
}
```

### Send Message trigger:

```json
{
  "type": "text",
  "payload": {
    "message": "CLINICAL_PRIORITY|{variable_feature_id}"
  },
  "next": "wait_for_payment"
}
```

---

## 8. Отладка

### Логи в Telegram Bot (Node.js console):

```
💰 CLINICAL_PRIORITY trigger detected: { userId: '123456789', featureId: 'idea_xyz' }
✅ Invoice sent successfully
🔘 pre_checkout_query received: { ... }
✅ pre_checkout_query validated and accepted
💰 successful_payment received: { provider_payment_charge_id: '...' }
✅ Payment saved to Supabase: 1234
✅ voiceflowEvent sent: clinical_priority_paid for user 123456789
✅ Channel log sent
✅ successful_payment processing completed
```

### Логи в Voiceflow:

Добавьте Custom Action с консолью:
```javascript
console.log("Voiceflow Dialog State", {
    featureId: context.variables.feature_id,
    paymentDone: context.variables.priority_payment_done,
    lastEvent: event
});
```

### Логи в Supabase:

SQL запрос:
```sql
SELECT * FROM payments 
WHERE user_id = '123456789' 
ORDER BY created_at DESC 
LIMIT 10;
```

---

## 9. Возможные расширения

После того как базовая функция работает, можно добавить:

### A) Разные типы приоритетов:

```javascript
// Вместо просто CLINICAL_PRIORITY|id:

PRIORITY|urgent|id        // 500 Stars - срочный пересмотр (3 дня)
PRIORITY|clinical|id      // 300 Stars - клинический (10 дней)
PRIORITY|standard|id      // 100 Stars - стандартный (30 дней)
```

### B) Рассрочка / Premium подписка:

```javascript
// Месячная подписка - все идеи автоматически с приоритетом
SUBSCRIBE|monthly|user_id   // 1000 Stars
```

### C) Возврат средств:

```javascript
// Если платеж прошёл, но идея не одобрена за 30 дней
// Можно добавить refund logic с проверкой created_at + 30 days
```

### D) Analytics Dashboard:

```javascript
// Create public API endpoint:
GET /api/stats/payments
  → { total_payments, total_stars, unique_users, top_features }
```

---

**Last Updated:** 2026-01-11  
**Version:** 1.0  
**Author:** VF Telegram Bot Team
