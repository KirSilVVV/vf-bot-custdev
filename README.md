# VF Telegram Bot

Telegram bot for document processing (PDF, images, Word) with OCR and Voiceflow integration.

## Features

- 📄 **PDF Support**: Text extraction + OCR for scanned PDFs
- 🖼️ **Image OCR**: Tesseract.js for PNG/JPG with text recognition
- 📝 **Word Documents**: Extract text from .docx files
- 💬 **Text Messages**: Send text directly to Voiceflow
- 🤖 **Voiceflow Integration**: Send extracted text to Voiceflow chatbot
- 🔒 **Secure**: File type validation, temp file cleanup

## Setup

### Prerequisites
- Node.js 18+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Voiceflow account with API key and version ID

### Local Development

1. **Clone & install**
```bash
git clone <your-repo-url>
cd vf-telegram-bot
npm install
```

2. **Create `.env` from template**
```bash
cp .env.example .env
```

3. **Add your credentials to `.env`**
```dotenv
TELEGRAM_BOT_TOKEN=your_token_here
VOICEFLOW_API_KEY=your_key_here
VOICEFLOW_VERSION_ID=your_version_id_here
```

4. **Run locally**
```bash
npm start
```

## Deployment on Render

### 1. Push to GitHub
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### 2. Connect to Render
- Go to https://dashboard.render.com
- Click "New +" → "Web Service"
- Select GitHub repository
- Render auto-detects `render.yaml`

### 3. Add Environment Variables
- `TELEGRAM_BOT_TOKEN`
- `VOICEFLOW_API_KEY`
- `VOICEFLOW_VERSION_ID`

### 4. Deploy
- Click "Create Web Service"
- Wait for build completion
- Copy service URL (e.g., `https://vf-telegram-bot.onrender.com`)

### 5. Set Telegram Webhook
```powershell
$botToken = "YOUR_BOT_TOKEN"
$webhookUrl = "https://vf-telegram-bot.onrender.com"

Invoke-WebRequest -Method POST `
  "https://api.telegram.org/bot$botToken/setWebhook?url=$webhookUrl"
```

## Usage

1. Send `/start` to the bot in Telegram
2. Send text or upload a file (PDF, image, or Word document)
3. Bot extracts text using OCR/parsing
4. Text is sent to Voiceflow for processing
5. Response appears in Telegram chat

## Architecture

```
Telegram User
    ↓
Telegraf Bot (polling or webhook)
    ↓
Text/File Handler
    ↓
Text Extraction Pipeline
  ├─ PDF: pdf-parse + tesseract.js for scans
  ├─ Image: tesseract.js OCR
  ├─ Word: mammoth
  └─ Text: pass through
    ↓
Voiceflow Runtime API
    ↓
Response back to Telegram
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Bot token from BotFather |
| `VOICEFLOW_API_KEY` | ✅ | API key from Voiceflow |
| `VOICEFLOW_VERSION_ID` | ✅ | Version ID of your Voiceflow bot |
| `NODE_ENV` | ❌ | Set to `production` for webhook mode |

## Troubleshooting

### Webhook errors
- Check: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
- Redeploy webhook: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=<YOUR_URL>`

### File processing fails
- Ensure file is valid (not corrupted)
- Check file size limits (IMG: 15MB, DOC: 20MB)
- OCR takes time for large images

## License

ISC
