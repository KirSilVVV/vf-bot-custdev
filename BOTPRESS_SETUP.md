# 🤖 Настройка Botpress для Customer Development Bot

## Преимущества Botpress

✅ **Программный импорт flow** - можно загрузить через API/CLI  
✅ **AI Agents** - поддержка Claude, GPT-4, Gemini  
✅ **Telegram из коробки** - встроенная интеграция  
✅ **Webhooks** - легко интегрировать Supabase  
✅ **Open Source** - можно self-host  
✅ **Visual Flow Editor** - как Voiceflow  

---

## Быстрый старт (20 минут)

### Шаг 1: Создать аккаунт Botpress

1. Открыть https://botpress.com
2. Sign Up (бесплатный план - 2000 сообщений/месяц)
3. Create New Bot → "Customer Development Bot"

---

### Шаг 2: Импортировать flow

**Вариант A: Через UI (5 минут)**

1. Открыть Botpress Studio
2. Перейти в **Flows** (левая панель)
3. Нажать **Import Flow**
4. Загрузить файл [botpress-flow.json](botpress-flow.json)
5. Flow автоматически создастся с 8 нодами

**Вариант B: Через CLI (продвинутый)**

```bash
# Установить Botpress CLI
npm install -g @botpress/cli

# Логин
bp login

# Создать бот
bp bots create customer-dev-bot

# Импортировать flow
bp flows import -f botpress-flow.json
```

---

### Шаг 3: Настроить Environment Variables

1. В Botpress Studio → **Configuration** (⚙️)
2. **Environment Variables** → Add Variable:

```
SUPABASE_URL = https://rohplqelrlwszotkmnir.supabase.co
SUPABASE_SERVICE_ROLE_KEY = твой ключ из Supabase
TELEGRAM_CHANNEL_ID = -1003597143093
```

---

### Шаг 4: Настроить Claude API

1. В Botpress Studio → **Integrations**
2. Найти **Anthropic (Claude)**
3. Connect Integration
4. Добавить API Key от Anthropic:
   - Получить на https://console.anthropic.com
   - API Keys → Create Key
   - Скопировать и вставить в Botpress

5. Выбрать модель: **Claude Sonnet 4**

---

### Шаг 5: Подключить Telegram

1. В Botpress Studio → **Integrations**
2. Найти **Telegram**
3. Connect Integration
4. Ввести **Bot Token** (от BotFather):
   - Открыть Telegram → найти @BotFather
   - `/newbot` или взять токен существующего бота
   - Вставить токен в Botpress

5. **Webhook URL** Botpress сгенерирует автоматически
6. Скопировать webhook и установить в Telegram:
   ```bash
   curl -X POST https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook \
     -d "url=<BOTPRESS_WEBHOOK_URL>"
   ```

---

### Шаг 6: Настроить Supabase Webhook

В ноде `save_to_supabase` уже есть код:

```javascript
const response = await axios.post(
  `${process.env.SUPABASE_URL}/rest/v1/requests`,
  {
    user_telegram_id: workflow.user_telegram_id,
    draft_text: workflow.draft_text,
    status: 'pending_vote'
  },
  {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    }
  }
);

workflow.request_id = response.data[0].id;
workflow.feature_id = response.data[0].id;
```

**Ничего дополнительно настраивать не нужно!**

---

### Шаг 7: Publish бота

1. Нажать **Publish** (правый верхний угол)
2. Бот развернётся на Botpress Cloud
3. Telegram интеграция активируется автоматически

---

## Тестирование (5 минут)

1. Открыть бота в Telegram
2. Отправить `/start`
3. Должен ответить: "Привет! 👋 Я помогаю медицинским специалистам..."
4. Пройти весь флоу:
   - ✅ Да, работаю в медицине
   - Описать проблему
   - Ответить на 5 вопросов
   - Согласовать черновик
   - Пропустить оплату
   - Получить финальное сообщение с каналом

5. Проверить Supabase:
   ```sql
   SELECT * FROM requests ORDER BY created_at DESC LIMIT 1;
   ```

---

## Параллельная работа с Voiceflow

**Можно запустить 2 бота одновременно:**

1. **Voiceflow бот** - на production, с текущим функционалом
   - Токен: `TELEGRAM_BOT_TOKEN` (основной)
   - Работает с index.js

2. **Botpress бот** - для тестирования нового флоу
   - Создать нового бота через BotFather: `/newbot`
   - Токен: `TELEGRAM_BOTPRESS_TOKEN` (новый)
   - Работает через Botpress Cloud

**Преимущество:**
- Тестируешь новый флоу без остановки production
- Если Botpress работает лучше → переключаешь production на него
- Если что-то не так → остаёшься на Voiceflow

---

## Обработка платежей в Botpress

**Важно:** Botpress не поддерживает Telegram Stars напрямую.

**Решение:**
1. В ноде `payment_offer` когда пользователь нажимает "⭐ Оплатить"
2. Botpress отправляет webhook в **index.js**:
   ```javascript
   // В payment_offer ноде
   await axios.post('http://localhost:3000/botpress-payment', {
     userId: workflow.user_telegram_id,
     requestId: workflow.request_id,
     featureId: workflow.feature_id
   });
   ```

3. В index.js добавить endpoint:
   ```javascript
   const express = require('express');
   const app = express();
   app.use(express.json());
   
   app.post('/botpress-payment', async (req, res) => {
     const { userId, requestId, featureId } = req.body;
     
     // Отправить invoice через Telegram Bot API
     await bot.telegram.sendInvoice(userId, {
       title: '🧬 Клинический приоритет',
       description: '+10 голосов для идеи',
       payload: JSON.stringify({ request_id: requestId, feature_id: featureId }),
       provider_token: '',
       currency: 'XTR',
       prices: [{ label: 'Приоритет', amount: 1 }]
     });
     
     res.json({ success: true });
   });
   
   app.listen(3000);
   ```

4. После оплаты Telegram отправит `successful_payment` в index.js
5. index.js обновит Supabase и отправит webhook обратно в Botpress:
   ```javascript
   bot.on('successful_payment', async (ctx) => {
     const payload = JSON.parse(ctx.message.successful_payment.invoice_payload);
     
     // Обновить Supabase
     await supabase.from('requests')
       .update({ payment_status: 'paid', votes: 10 })
       .eq('id', payload.request_id);
     
     // Уведомить Botpress
     await axios.post('https://webhook.botpress.cloud/your-bot-id', {
       type: 'payment_success',
       userId: ctx.from.id,
       requestId: payload.request_id
     });
   });
   ```

6. Botpress получает webhook и продолжает флоу в `final_thanks`

---

## Структура Flow

```
START
  ↓
[welcome] Приветствие + квалификация
  │  Кнопки: ✅ Да / ❌ Нет
  ├─ Не медик → [soft_exit] Мягкое завершение → END
  └─ Медик ↓
  
[problem_collection] Сбор проблемы (текст)
  ↓
[deep_dive] Углубление (5 вопросов)
  ↓
[draft_creation] Формирование черновика
  │  Кнопки: ✅ Продолжаем / ✏️ Уточнить
  ↓
[save_to_supabase] Сохранение в БД
  │  POST /rest/v1/requests
  │  → request_id, feature_id
  ↓
[payment_offer] Предложение оплаты
  │  Кнопки: ⭐ Оплатить / 👍 Пропустить
  │  → webhook → index.js → sendInvoice
  ↓
[final_thanks] Финальная благодарность
  │  Показать channel_link
  └─ END
```

---

## Сравнение: Botpress vs Voiceflow

| Функция | Botpress | Voiceflow |
|---------|----------|-----------|
| **Программный импорт flow** | ✅ Да (CLI/API) | ❌ Только UI |
| **AI Agents** | ✅ Claude, GPT-4 | ✅ Claude, GPT-4 |
| **Telegram интеграция** | ✅ Встроенная | 🔄 Через Runtime API |
| **Суpabase API** | ✅ Execute Code node | ✅ API Tool |
| **Telegram Stars** | ⚠️ Через webhook | ⚠️ Через webhook |
| **Visual Editor** | ✅ Да | ✅ Да |
| **Self-hosting** | ✅ Да (open source) | ❌ Только cloud |
| **Цена** | 💰 Free: 2000 msg/mo | 💰 Free: 1000 msg/mo |
| **Сложность setup** | 🟢 Низкая (20 мин) | 🟡 Средняя (60 мин) |

---

## Следующие шаги

1. ✅ Импортировать `botpress-flow.json` в Botpress
2. ✅ Настроить Environment Variables
3. ✅ Подключить Claude API
4. ✅ Подключить Telegram
5. ✅ Publish бота
6. ✅ Протестировать флоу
7. 🔄 Настроить webhook для платежей (опционально)
8. 📊 Сравнить с Voiceflow и решить что использовать

---

## Проблемы и решения

**Q: Botpress не видит переменные из Environment Variables**  
A: Перезапусти бот: Publish → Restart Bot

**Q: Claude API не отвечает**  
A: Проверь API key в Integrations → Anthropic → проверь лимиты на console.anthropic.com

**Q: Telegram не получает сообщения**  
A: Проверь webhook: curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo

**Q: Supabase возвращает 401**  
A: Проверь SUPABASE_SERVICE_ROLE_KEY (не anon key!)

**Q: Как обновить flow после изменений?**  
A: Flows → Import Flow → выбрать обновлённый JSON → Replace existing

---

## Полезные ссылки

- Botpress Documentation: https://botpress.com/docs
- Botpress Cloud: https://app.botpress.cloud
- Botpress GitHub: https://github.com/botpress/botpress
- Community: https://discord.gg/botpress

---

## Итог

**Botpress даёт:**
- ✅ Программный импорт flow (экономия 1 часа)
- ✅ Встроенный Telegram (проще интеграция)
- ✅ Open source (можно self-host)

**Но требует:**
- 🔄 Webhook для Telegram Stars (небольшой код в index.js)
- 📚 Изучение новой платформы (20 минут)

**Рекомендация:**
Протестируй Botpress параллельно с Voiceflow. Если всё работает - можешь полностью перейти или оставить как альтернативу.

Время на setup: **20 минут** 🚀
