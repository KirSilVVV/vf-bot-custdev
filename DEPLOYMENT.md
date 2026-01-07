# Deployment Checklist for vf-telegram-bot

## ✅ Pre-deployment (Local)

- [x] `.env.example` created with placeholders
- [x] `.gitignore` configured (excludes `.env`, `node_modules`, etc.)
- [x] `package.json` updated with correct name & metadata
- [x] `render.yaml` configured with Node.js runtime
- [x] `README.md` with setup & deployment instructions
- [x] `.github/copilot-instructions.md` for AI agents
- [x] `index.js` updated with webhook mode
- [x] All source code ready

## 🚀 Deploy to Render (First Time)

1. **Push to GitHub**
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/vf-telegram-bot.git
   git branch -M main
   git push -u origin main
   ```

2. **Create Render Service**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Select your GitHub repository
   - Render will auto-detect `render.yaml`

3. **Add Environment Variables in Render Dashboard**
   - `TELEGRAM_BOT_TOKEN` = your bot token
   - `VOICEFLOW_API_KEY` = your API key
   - `VOICEFLOW_VERSION_ID` = your version ID
   - Click "Create Web Service"

4. **Wait for Build** (1-2 minutes)
   - Check the Build & Deployment Logs
   - Service URL will be shown once deployed

5. **Set Telegram Webhook**
   ```powershell
   $token = "YOUR_BOT_TOKEN"
   $url = "https://vf-telegram-bot.onrender.com"
   Invoke-WebRequest -Method POST "https://api.telegram.org/bot$token/setWebhook?url=$url"
   ```

6. **Test**
   - Send `/start` to your Telegram bot
   - Send text or upload a document
   - Verify it processes and responds

## 🔄 Update After Changes

```bash
git add .
git commit -m "your commit message"
git push
```
Render will automatically rebuild and deploy.

## 📊 Monitoring

- **Logs**: https://dashboard.render.com → Your Service → Logs
- **Webhook Info**: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- **Bot Status**: Send `/start` to the bot

## 🛑 Troubleshooting

### Webhook not receiving messages
- Check: `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"`
- Redeploy: `node setup-webhook.js <TOKEN> <URL>` (if available)

### Bot responds slowly
- Large files/images take longer to process
- OCR is compute-intensive
- This is expected behavior

## 💾 Environment Variables

Keep these safe (use Render's secret vars):
- `TELEGRAM_BOT_TOKEN`
- `VOICEFLOW_API_KEY`
- `VOICEFLOW_VERSION_ID`

Never commit `.env` file! Use `.env.example` as template.
