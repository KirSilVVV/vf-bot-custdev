# POST /vf/pay - Voiceflow Payment API Integration

## Overview

The `POST /vf/pay` endpoint enables **Voiceflow to trigger Telegram Stars payments directly via API**, without requiring users to type commands in the chat.

**Key Benefits:**
- ✅ **Voiceflow-controlled flow** - Payment decision is made by Voiceflow logic
- ✅ **User-friendly** - No text parsing, no commands needed
- ✅ **Stable & Predictable** - API-driven, not dependent on user text input
- ✅ **Automatic event closure** - After payment, Voiceflow event fires automatically

---

## Endpoint Details

### Request

**URL:** `POST https://vf-bot-custdev.onrender.com/vf/pay`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "feature_id": "test_123",
  "user_id": "123456",
  "source": "voiceflow"
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `feature_id` | string | ✅ Yes | Feature/product identifier (any string) |
| `user_id` | string | ✅ Yes | Telegram user ID (numeric string) |
| `source` | string | ✅ Yes | Must be `"voiceflow"` (constant) |

### Response

**Success (200):**
```json
{
  "ok": true,
  "feature_id": "test_123",
  "user_id": "123456",
  "message_id": 12345,
  "status": "invoice_sent"
}
```

**Error (400/404/500):**
```json
{
  "ok": false,
  "error": "User 123456 has no active session. User must message bot first."
}
```

---

## Complete Flow

### Step-by-Step Scenario

```
1. User starts interaction with bot
   └─ Bot saves user_id → chat_id mapping
      (fires on /start or any message)

2. User progresses through Voiceflow
   └─ Voiceflow logic determines: payment needed

3. Voiceflow sends POST request
   POST /vf/pay
   {
     "feature_id": "clinical_priority_123",
     "user_id": "987654321",
     "source": "voiceflow"
   }

4. Server processes:
   ✅ Validates user_id exists in session map
   ✅ Looks up chat_id from user_id
   ✅ Sends 1 XTR Telegram Stars invoice to user

5. User sees invoice in Telegram
   └─ Pays with Stars ⭐

6. Server detects successful_payment
   └─ Inserts payment record to Supabase
   └─ Sends back to Voiceflow:
       event: "clinical_priority_paid"
       payload: { feature_id: "clinical_priority_123" }

7. Voiceflow receives event
   └─ Triggers "clinical_priority_paid" block
   └─ Continues conversation (green path)
```

---

## Implementation in Voiceflow

### Example: Simple Payment Button

1. **In Voiceflow Canvas:**
   - Add a **Message** block: "Ready to prioritize this feature?"
   - Add **Buttons** block:
     - Button 1: "✅ Yes, pay 1 Star"
     - Button 2: "❌ Skip"

2. **On Button 1 (Yes) → Add API Request:**
   ```
   Method: POST
   URL: https://vf-bot-custdev.onrender.com/vf/pay
   Headers: Content-Type: application/json
   
   Body:
   {
     "feature_id": "feature_{{variable.featureName}}",
     "user_id": "{{user.id}}",
     "source": "voiceflow"
   }
   ```

3. **After API Request → Wait for Event:**
   - Add "Event" block set to listen for: `clinical_priority_paid`
   - Both paths (if received):
     - ✅ **On Success** → "Thank you! Feature marked." → Continue
     - ❌ **On Timeout** → "User cancelled payment" → Return to menu

4. **Voiceflow's green path block** fires automatically when payment completes

---

## Key Technical Details

### User Session Mapping

The server **tracks user_id ↔ chat_id** automatically:
- When `/start` command issued
- When any message sent by user
- Stored in memory (Map object)

```javascript
// Inside bot handler:
userChatMapping.set(userId, chatId);
```

**Important:** User must message the bot at least once before payment can be triggered via `/vf/pay` API.

### Payment Detection

When `successful_payment` message arrives:
1. Payload is parsed to extract `source` field
2. If `source === 'voiceflow'`:
   - ✅ Send event back to Voiceflow
   - ✅ Reply "Спасибо! Платёж принят"
   - ✅ Skip channel message updates
3. If `source` not set or different:
   - ✅ Update request metadata
   - ✅ Edit channel message with vote counts
   - ✅ Send Voiceflow event with request_id

### Error Handling

| Scenario | Response | Status |
|----------|----------|--------|
| Invalid JSON | "Missing required fields" | 400 |
| User not in session | "User has no active session" | 404 |
| Telegram API error | "Failed to send invoice: ..." | 500 |
| Server error | Error message | 500 |

---

## Testing

### 1. Test User Session Creation

```bash
# Send message as user in Telegram
"Hello"

# Check server logs for:
# "📱 Saved user session: 123456789 -> 123456789"
```

### 2. Test /vf/pay Endpoint

```bash
curl -X POST https://vf-bot-custdev.onrender.com/vf/pay \
  -H "Content-Type: application/json" \
  -d '{
    "feature_id": "test_feature",
    "user_id": "YOUR_USER_ID",
    "source": "voiceflow"
  }'

# Expected response:
# {
#   "ok": true,
#   "feature_id": "test_feature",
#   "user_id": "YOUR_USER_ID",
#   "message_id": 12345,
#   "status": "invoice_sent"
# }
```

### 3. Test Payment Flow

1. Send invoice via API (as above)
2. User sees invoice in Telegram
3. User taps "Pay 1 Star" and completes payment
4. Server sends event to Voiceflow
5. Voiceflow receives `clinical_priority_paid` event
6. Check Voiceflow logs for event trigger

---

## Error Handling Examples

### Error 1: User Never Messaged Bot

**Request:**
```json
{
  "feature_id": "test",
  "user_id": "999999999",
  "source": "voiceflow"
}
```

**Response (404):**
```json
{
  "ok": false,
  "error": "User 999999999 has no active session. User must message bot first."
}
```

**Solution:** User must send any message to bot first.

---

### Error 2: Missing Required Field

**Request:**
```json
{
  "feature_id": "test"
}
```

**Response (400):**
```json
{
  "ok": false,
  "error": "Missing required fields: feature_id, user_id, source (must be \"voiceflow\")"
}
```

**Solution:** Include all 3 required fields in request.

---

## Production Checklist

- [x] User session mapping implemented
- [x] `/vf/pay` endpoint created
- [x] Invoice sending via Telegram API
- [x] `successful_payment` handler detects Voiceflow source
- [x] Event sent back to Voiceflow
- [x] Error handling with proper HTTP status codes
- [x] Deployed to Render (auto-redeploy on git push)
- [x] No syntax errors
- [x] Backward compatible with existing CLINICAL_PRIORITY|... flow

---

## FAQ

**Q: Can the same user trigger multiple payments?**
A: Yes. Each payment is independent. User can make unlimited payments.

**Q: What if user closes invoice without paying?**
A: Nothing happens. Voiceflow waits (with timeout if configured). No event fires.

**Q: Is payment data stored?**
A: Yes, in `payments` table:
- `user_id`, `feature_id`, `kind` ('clinical_priority'), `stars` (1), `telegram_charge_id`, `created_at`

**Q: Can Voiceflow retry if payment fails?**
A: Yes. If no event received within timeout, Voiceflow can re-trigger the payment API.

**Q: What's the amount?**
A: Fixed at **1 XTR (Telegram Star)** for all payments via `/vf/pay`.

---

## Deployment Status

✅ **Live on Render:** https://vf-bot-custdev.onrender.com/vf/pay

**Environment Variables Required:**
- `TELEGRAM_BOT_TOKEN` ✅
- `SUPABASE_URL` ✅
- `SUPABASE_SERVICE_ROLE_KEY` ✅
- `TELEGRAM_CHANNEL_ID` ✅

**Last Updated:** 2026-01-11

**Version:** 2.0 (Voiceflow API Integration)
