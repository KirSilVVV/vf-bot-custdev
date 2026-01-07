# VF Telegram Bot: AI Coding Agent Guidelines

## Project Overview
**vf-telegram-bot** is a Node.js Telegraf bot that extracts text from documents (PDF, images, Word) using OCR/text parsing, then sends extracted text to **Voiceflow** for conversational AI processing.

### Core Architecture
- **Telegraf** (Telegram bot framework) → handles user messages & file uploads
- **File Processing Pipeline** (OCR + text extraction)
  - PDFs: `pdf-parse` for text + Tesseract for OCR on scanned pages
  - Images: `tesseract.js` for OCR
  - Word: `mammoth` for .docx extraction
  - Images (general): `sharp` for preprocessing
- **Voiceflow Runtime API** → processes extracted text as conversation

### Data Flow
```
User sends file (PDF/image/Word) or text message
  ↓
File downloaded to tmp/ (if file)
  ↓
Text extraction (pdf-parse OR tesseract.js OR mammoth)
  ↓
POST to Voiceflow Runtime API
  ↓
Voiceflow response sent back to Telegram
```

## Key Implementation Patterns

### File Type Detection
- Uses `file-type` package to detect actual file type (not just extension)
- Handles: PDF, PNG, JPG, DOCX, and plain text

### PDF Processing
- First tries `pdf-parse` for native text PDFs
- If minimal text found, falls back to OCR via Tesseract
- Handles both native and scanned PDFs

### Text Handling
- Max 6000 chars sent to Voiceflow (respects Telegram 4096 limit)
- Telegraf polls for updates in development, webhook in production

### Logging
- Extracted text logged to console and `logs/responses_YYYY-MM-DD.log`
- Includes timestamp, user ID, file type, and text preview

## Environment Configuration

```dotenv
TELEGRAM_BOT_TOKEN      # Required: Bot token from BotFather
VOICEFLOW_API_KEY       # Required: Voiceflow API key
VOICEFLOW_VERSION_ID    # Required: Voiceflow version/bot ID
NODE_ENV                # Optional: 'production' for webhook mode
```

## Build & Run

```bash
npm install              # Install all dependencies
npm start               # node index.js
```

## Dependencies
| Package | Purpose |
|---------|---------|
| `telegraf` | Telegram bot framework |
| `tesseract.js` | OCR engine for images |
| `pdf-parse` | PDF text extraction |
| `sharp` | Image processing |
| `mammoth` | Word (.docx) extraction |
| `axios` | HTTP client for Voiceflow API |
| `dotenv` | Environment variable loading |

## Common Patterns

- **File size validation** before processing (MAX_IMG_MB, MAX_DOC_MB)
- **Error handling** with user-friendly messages in Czech
- **Temp file cleanup** after processing
- **Text truncation** to prevent oversized payloads

## Deployment on Render
Same as `bad-telegram-bot-cz` — webhook mode with explicit HTTP server for production.

## Files to Know
- **[index.js](index.js)** — Main bot logic (286 lines)
- **[package.json](package.json)** — Dependencies
- **[render.yaml](render.yaml)** — Render configuration
- **[.env.example](.env.example)** — Environment template
