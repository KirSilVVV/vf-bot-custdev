# 🧬 Telegram Stars Payment Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           TELEGRAM ECOSYSTEM                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  User (Telegram App)                                                      │
│      │                                                                     │
│      ├─ NORMAL MESSAGE: "привет"                                          │
│      │      ↓                                                              │
│      │   Bot (Telegraf)                                                    │
│      │      │                                                              │
│      │      └─ bot.on('text')                                              │
│      │           ├─ startsWith('CLINICAL_PRIORITY|')?                      │
│      │           │  ├─ YES → PAYMENT FLOW (skip Voiceflow)                │
│      │           │  └─ NO  → NORMAL FLOW (send to Voiceflow)              │
│      │                                                                     │
│      │                                                                     │
│      ├─ CLINICAL_PRIORITY|feature_id                                       │
│      │      ↓                                                              │
│      │   Bot (Telegraf)                                                    │
│      │      │                                                              │
│      │      ├─ Check rate-limit (60 sec)                                   │
│      │      ├─ Create payload: { kind, feature_id, user_id, ts }          │
│      │      └─ ctx.sendInvoice()                                           │
│      │           ↓                                                          │
│      │         [Invoice UI]                                                │
│      │         "🧬 Клинический приоритет - 300 ⭐️"                        │
│      │         [Pay via Telegram Stars]                                    │
│      │           ↓                                                          │
│      │         User clicks "Pay"                                           │
│      │           ↓                                                          │
│      │      bot.on('pre_checkout_query')                                   │
│      │      ├─ Validate: kind, amount, currency                           │
│      │      └─ ctx.answerPreCheckoutQuery(true)                            │
│      │           ↓                                                          │
│      │         [Telegram Stars App]                                        │
│      │         User confirms payment                                       │
│      │           ↓                                                          │
│      │      bot.on('successful_payment')                                   │
│      │      ├─ Parse payload                                              │
│      │      ├─ Check duplicate (charge_id in DB)                          │
│      │      ├─ INSERT INTO payments table                                 │
│      │      ├─ voiceflowEvent('clinical_priority_paid')                   │
│      │      ├─ ctx.reply("✅ Спасибо!")                                     │
│      │      └─ Send log to channel                                         │
│      │                                                                     │
│      └─ VOTING (old functionality)                                         │
│           [👍 Голосовать] [🗳 Снять голос]                               │
│           ↓                                                                │
│           bot.on('callback_query')                                         │
│           ├─ Insert/Delete vote                                           │
│           └─ Update button counter                                        │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                        VOICEFLOW INTEGRATION                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Voiceflow Dialog                                                         │
│      │                                                                     │
│      ├─ Text: "Хочешь применить приоритет?"                               │
│      └─ Choice:                                                            │
│         ├─ Button: "🧬 Применить (300 ⭐️)"                                │
│         │    → Send Message: CLINICAL_PRIORITY|{variable_feature_id}      │
│         │                                                                  │
│         └─ Button: "❌ Пропустить"                                         │
│              → Next block...                                              │
│                                                                           │
│  Payment Event Flow:                                                      │
│      Voiceflow sends: "CLINICAL_PRIORITY|feature_abc"                     │
│            ↓                                                               │
│      Bot receives in text handler                                         │
│            ↓                                                               │
│      Bot sends invoice (Telegram Stars)                                   │
│            ↓                                                               │
│      User pays                                                            │
│            ↓                                                               │
│      successful_payment handler                                           │
│            ↓                                                               │
│      voiceflowEvent(userId, 'clinical_priority_paid', {...})             │
│            ↓                                                               │
│      Voiceflow Event block catches it                                     │
│            ↓                                                               │
│      Voiceflow can update dialog / show message / next step              │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE DATABASE                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Table: payments                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ id (PK)  │ user_id  │ feature_id  │ stars  │ telegram_charge_id    │ │
│  ├──────────┼──────────┼─────────────┼────────┼─────────────────────────┤ │
│  │ 1        │ 123456   │ feature_001 │ 300    │ charge_abc_xyz        │ │
│  │ 2        │ 789012   │ feature_002 │ 300    │ charge_def_uvw        │ │
│  │ 3        │ 123456   │ feature_003 │ 300    │ charge_ghi_jkl        │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  Indexes (for fast lookups):                                             │
│  - idx_payments_user_id (quick: find all payments by user)               │
│  - idx_payments_charge_id (quick: find payment by charge_id)             │
│  - idx_payments_created_at (quick: recent payments)                      │
│                                                                           │
│  Views (ready analytics):                                                │
│  - payments_daily_summary (payments per day)                             │
│  - payments_user_summary (stats per user)                                │
│                                                                           │
│  Protection:                                                              │
│  - UNIQUE constraint on telegram_charge_id (no duplicates)               │
│  - CHECK constraint on stars (must be > 0)                               │
│  - CHECK constraint on user_id (not empty)                               │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                        BOT SERVER (Render)                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  Express.js Server (Node.js)                                              │
│      ↓                                                                     │
│  app.post('/webhook')                                                     │
│      ├─ Receives Telegram update                                         │
│      └─ Calls bot.handleUpdate(update)                                    │
│                                                                           │
│  bot.on('text')                                                           │
│      ├─ Check: startsWith('CLINICAL_PRIORITY|')?                         │
│      │   ├─ YES: PAYMENT FLOW (create invoice)                           │
│      │   └─ NO: VOICEFLOW FLOW (send to Voiceflow)                       │
│      ↓                                                                     │
│                                                                           │
│  bot.on('pre_checkout_query')                                             │
│      ├─ Validate payment details                                         │
│      └─ Return OK/FAIL quickly                                            │
│      ↓                                                                     │
│                                                                           │
│  bot.on('successful_payment')                                             │
│      ├─ Parse invoice_payload                                            │
│      ├─ Check for duplicate (SELECT FROM payments WHERE charge_id)      │
│      ├─ INSERT INTO payments                                             │
│      ├─ voiceflowEvent('clinical_priority_paid')                         │
│      ├─ ctx.reply("✅ Спасибо!")                                           │
│      └─ Log to channel                                                    │
│      ↓                                                                     │
│                                                                           │
│  Rate-limit: clinicalPriorityInvoiceCache (in-memory Map)               │
│      ├─ Key: "userId:featureId"                                          │
│      ├─ Value: lastInvoiceTimestamp                                      │
│      └─ Prevent: more than 1 invoice per 60 sec                          │
│      ↓                                                                     │
│                                                                           │
│  Logging (console.log):                                                   │
│      ├─ 💰 CLINICAL_PRIORITY trigger detected                            │
│      ├─ 🔘 pre_checkout_query received                                    │
│      ├─ 💰 successful_payment received                                    │
│      ├─ ✅ Payment saved to Supabase                                      │
│      └─ (visible in Render Dashboard → Logs)                             │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                        TELEGRAM API FLOW                                 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  1. User sends: CLINICAL_PRIORITY|feature_id                             │
│     → Telegram server → Bot webhook POST /webhook                        │
│                                                                           │
│  2. Bot sends: ctx.sendInvoice()                                          │
│     → Telegram API sendInvoice() → Invoice appears in user's chat        │
│                                                                           │
│  3. User clicks: "Pay via Telegram Stars"                                │
│     → Telegram asks: pre_checkout_query (is payment valid?)              │
│     → Bot responds: answerPreCheckoutQuery(true)                         │
│     → Telegram Stars app asks user to confirm                            │
│                                                                           │
│  4. User confirms payment                                                │
│     → Telegram Stars app: XTR transferred                                │
│     → Telegram sends: successful_payment webhook                         │
│     → Bot webhook receives update                                        │
│     → Bot processes payment (insert, event, reply)                       │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow for One Payment

```
STEP 1: TRIGGER
┌──────────────────┐
│ User writes:     │
│ CLINICAL_         │
│ PRIORITY|         │
│ feature_abc      │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ Telegram sends   │
│ message update   │
│ to bot webhook   │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ bot.on('text')   │
│ handler called   │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ Check rate-limit │
│ userId+featureId │
│ < 60 sec?        │
└─────────┬────────┘
          │
       YES│     NO
         │      └─→ Reply: "⏳ Too soon"
         │
         ↓
┌──────────────────┐
│ Create payload:  │
│ {                │
│  kind,           │
│  feature_id,     │
│  user_id,        │
│  ts              │
│ }                │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ ctx.sendInvoice()│
│ Telegram API    │
│ sendInvoice()    │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ Invoice appears  │
│ in user's chat   │
│ (300 XTR button) │
└──────────────────┘


STEP 2: PRE-CHECKOUT
┌──────────────────┐
│ User clicks:     │
│ "Pay via         │
│  Telegram Stars" │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ Telegram sends   │
│ pre_checkout_    │
│ query webhook    │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ bot.on(           │
│ 'pre_checkout... │
│ query')          │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ Parse payload    │
│ Validate:        │
│ - kind OK?       │
│ - amount OK?     │
│ - currency OK?   │
└─────────┬────────┘
          │
       ✅ │    ❌ 
         │     └─→ answerPreCheckoutQuery(false)
         │
         ↓
┌──────────────────┐
│answerPreCheckout │
│Query(true)       │
│ → Payment OK'd   │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ Telegram Stars   │
│ app appears      │
│ User confirms    │
└──────────────────┘


STEP 3: SUCCESSFUL PAYMENT
┌──────────────────┐
│ User confirms    │
│ XTR transfer     │
│ in Stars app     │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ Telegram sends   │
│ successful_      │
│ payment webhook  │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ bot.on(          │
│ 'successful_     │
│ payment')        │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ Parse payload +  │
│ charge_id        │
└─────────┬────────┘
          │
          ↓
┌──────────────────┐
│ Check duplicate: │
│ SELECT FROM      │
│ payments WHERE   │
│ telegram_charge_ │
│ id = X           │
└─────────┬────────┘
          │
      YES │    NO
         │      └─→ INSERT INTO payments
         │            { user_id, feature_id,
         └─→ Return  │  stars, charge_id }
         (already       │
         processed)     ↓
                  ┌──────────────────┐
                  │ voiceflowEvent(  │
                  │ userId,          │
                  │'clinical_         │
                  │ priority_paid',   │
                  │ {...}            │
                  │ )                │
                  └─────────┬────────┘
                            │
                            ↓
                  ┌──────────────────┐
                  │ ctx.reply(        │
                  │ "✅ Спасибо!"     │
                  │ )                │
                  └─────────┬────────┘
                            │
                            ↓
                  ┌──────────────────┐
                  │ Log to channel    │
                  │ (optional)        │
                  └──────────────────┘
```

---

## Key Components Interaction

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          INTERACTION DIAGRAM                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [User Telegram App]                                                     │
│         ↓                                                                │
│  [Telegram Infrastructure]                                              │
│         ↓                                                                │
│  POST https://vf-telegram-bot.onrender.com/webhook                      │
│         ↓                                                                │
│  [Express.js Server on Render]                                          │
│  ├─ bot.handleUpdate(req.body)                                          │
│  ├─ bot.on('text') ← dispatch                                           │
│  ├─ bot.on('pre_checkout_query') ← dispatch                            │
│  └─ bot.on('successful_payment') ← dispatch                            │
│         ↓                                                                │
│  [Payment Handler]                                                       │
│  ├─ Parse payload                                                        │
│  ├─ Check Supabase (SELECT FROM payments)                              │
│  └─ Insert to Supabase (INSERT INTO payments)                          │
│         ↓                                                                │
│  [Voiceflow Runtime API]                                                │
│  https://general-runtime.voiceflow.com/state/.../interact               │
│  ├─ POST { request: { type: 'event', ... } }                           │
│  └─ Voiceflow processes event                                           │
│         ↓                                                                │
│  [Bot Response]                                                          │
│  ctx.reply("✅ Спасибо!") ← back to user                                │
│                                                                          │
│  [Logging]                                                               │
│  console.log() → visible in Render Dashboard Logs                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Rate-Limit Strategy

```
clinicalPriorityInvoiceCache = new Map()

When user sends CLINICAL_PRIORITY|feature_id:
│
├─ Key = "userId:featureId"  (e.g. "123456:feature_abc")
├─ Check = now() - lastTime < 60000 ms?
│
├─ If YES (too soon):
│  └─ Reply: "⏳ Попробуйте позже"
│     Return without issuing invoice
│
└─ If NO (can issue):
   ├─ Update cache: cache.set(key, now())
   └─ Proceed with invoice

Note: Cache clears on bot restart (in-memory)
      For persistent rate-limit → use Supabase table with TTL
```

---

## Error Handling Strategy

```
Telegram Update
    ↓
try {
    bot.handleUpdate()
} catch (err) {
    console.error(err)
    // Telegram always gets 200 OK
    res.sendStatus(200)
}
    ↓
return res.sendStatus(200)  ← Always, even on error!

Why? Telegram marks update as "stuck" if we don't 200 OK,
     and will retry forever, causing duplicate processing.
```

---

## Security Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY CHECKS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 1. DUPLICATE DETECTION                                         │
│    └─ UNIQUE constraint: telegram_charge_id in DB             │
│    └─ SELECT check before INSERT                              │
│    → Prevents: Same payment processed twice                   │
│                                                                 │
│ 2. PAYLOAD VALIDATION                                          │
│    └─ try-catch JSON.parse(payload)                           │
│    └─ Validate: kind === 'clinical_priority'                 │
│    └─ Validate: amount === 300                                │
│    └─ Validate: currency === 'XTR'                            │
│    → Prevents: Malformed or incorrect payments                │
│                                                                 │
│ 3. RATE-LIMITING                                               │
│    └─ In-memory Map: userId:featureId → timestamp             │
│    └─ Check: now() - lastTime >= 60000 ms?                   │
│    → Prevents: Invoice spam (1 per 60 sec per feature)        │
│                                                                 │
│ 4. IMMEDIATE ACK                                               │
│    └─ answerCbQuery() / answerPreCheckoutQuery() immediately  │
│    → Prevents: Telegram retry/timeout loops                   │
│                                                                 │
│ 5. NO SECRETS IN LOGS                                          │
│    └─ Log only: public charge_id, amounts                     │
│    └─ Never log: API keys, private data                       │
│    → Prevents: Credential leakage in logs                     │
│                                                                 │
│ 6. TRY-CATCH EVERYWHERE                                        │
│    └─ Payment handler wrapped in try-catch                    │
│    └─ Voiceflow event in try-catch                            │
│    └─ Channel log in try-catch                                │
│    → Prevents: One failure breaking whole flow                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         GIT REPOSITORY                           │
│  (GitHub.com/yourname/vf-telegram-bot)                           │
│                                                                  │
│  ├─ index.js (992 lines, main bot code)                         │
│  ├─ package.json (dependencies: telegraf, supabase, express)   │
│  ├─ .env (local development)                                    │
│  ├─ QUICK_START.md                                               │
│  ├─ PAYMENTS_SETUP.md                                            │
│  ├─ VOICEFLOW_EXAMPLES.md                                        │
│  ├─ payments.sql                                                 │
│  └─ CODE_SNIPPETS.md                                             │
│                                                                  │
└────────────────┬─────────────────────────────────────────────────┘
                 │
                 │ git push origin main
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│                      RENDER (Hosting)                            │
│  https://vf-telegram-bot.onrender.com                            │
│                                                                  │
│  ├─ Node.js 22.16 runtime                                        │
│  ├─ Express.js server (PORT 3000)                               │
│  ├─ Webhook endpoint: POST /webhook                             │
│  │                                                               │
│  ├─ Environment Variables:                                       │
│  │  ├─ TELEGRAM_BOT_TOKEN                                        │
│  │  ├─ VOICEFLOW_API_KEY                                         │
│  │  ├─ VOICEFLOW_VERSION_ID                                      │
│  │  ├─ SUPABASE_URL                                              │
│  │  ├─ SUPABASE_SERVICE_ROLE_KEY                                │
│  │  ├─ TELEGRAM_CHANNEL_ID                                       │
│  │  └─ NODE_ENV=production                                       │
│  │                                                               │
│  ├─ Auto-deploy on git push                                      │
│  └─ Logs accessible in dashboard                                │
│                                                                  │
└────────────────┬──────────────────────────────────────┬──────────┘
                 │                                      │
                 │ Webhook setup on startup              │ Payment
                 ├─ bot.telegram.setWebhook()           │ handlers
                 │  (RENDER_EXTERNAL_URL + /webhook)    │
                 │                                      │
                 ↓                                      ↓
        ┌──────────────────┐              ┌──────────────────────────┐
        │ TELEGRAM BOT API │              │  SUPABASE DATABASE       │
        │                  │              │  (PostgreSQL)            │
        │ ├─ sendInvoice() │              │                          │
        │ ├─ sendMessage() │              │  ├─ Table: payments      │
        │ └─ editMarkup()  │              │  ├─ Table: requests      │
        │                  │              │  ├─ Table: votes         │
        └──────────────────┘              │  ├─ Indexes (3)          │
                                          │  └─ Views (2)            │
                                          │                          │
                                          │  ├─ credentials from     │
                                          │  │  SUPABASE_URL +       │
                                          │  │  SUPABASE_SERVICE_    │
                                          │  │  ROLE_KEY             │
                                          └──────────────────────────┘
                                                      │
                                                      ↓
                                          ┌──────────────────────────┐
                                          │ VOICEFLOW RUNTIME API    │
                                          │ (Dialog processing)      │
                                          │                          │
                                          │ https://general-runtime. │
                                          │ voiceflow.com/state/...  │
                                          │                          │
                                          │ ├─ Send dialog messages  │
                                          │ ├─ Receive user input    │
                                          │ └─ Send custom events    │
                                          └──────────────────────────┘
```

---

**Last Updated:** 2026-01-11  
**Version:** 1.0  
**Architecture:** MVP Production-Ready
