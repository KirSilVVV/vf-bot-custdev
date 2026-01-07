// index.js
// Telegram (Telegraf) → (OCR / file text extraction) → Voiceflow Runtime API
// + Logs extracted text to console + logs/responses_YYYY-MM-DD.log
//
// Requirements (Node 18+ recommended; you have Node 24):
//   npm i telegraf axios dotenv sharp tesseract.js pdf-parse mammoth file-type
//
// .env:
//   TELEGRAM_BOT_TOKEN=...
//   VOICEFLOW_API_KEY=...
//   VOICEFLOW_VERSION_ID=...

import 'dotenv/config';
import axios from 'axios';
import { Telegraf } from 'telegraf';

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { fileTypeFromBuffer } from 'file-type';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const VF_API_KEY = process.env.VOICEFLOW_API_KEY;
const VF_VERSION_ID = process.env.VOICEFLOW_VERSION_ID;

if (!TELEGRAM_BOT_TOKEN || !VF_API_KEY || !VF_VERSION_ID) {
    console.error('❌ Missing .env vars: TELEGRAM_BOT_TOKEN, VOICEFLOW_API_KEY, VOICEFLOW_VERSION_ID');
    process.exit(1);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

const TMP_DIR = path.join(process.cwd(), 'tmp');
const LOG_DIR = path.join(process.cwd(), 'logs');

const MAX_IMG_MB = 15;
const MAX_DOC_MB = 20;

// Telegram message max is ~4096 chars; Voiceflow can accept longer,
// but keep it sane to avoid huge payloads.
const VF_MAX_TEXT = 6000;

async function ensureDir(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch { }
}

function truncate(text, maxLen = VF_MAX_TEXT) {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen) + '\n…[обрезано]' : text;
}

function safeShort(text, max = 350) {
    const s = (text || '').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) + '…' : s;
}

function sanitizeFilename(name) {
    return String(name || 'file')
        .replace(/[^\w.\-]+/g, '_')
        .slice(0, 120);
}

async function logExtracted({ userId, kind, fileName, extracted }) {
    await ensureDir(LOG_DIR);

    const ts = new Date().toISOString();
    const header = `[${ts}] user=${userId} kind=${kind} file=${fileName || '-'} chars=${(extracted || '').length}`;

    // Console: short preview
    console.log(`🧾 ${header} preview="${safeShort(extracted)}"`);

    // File: full text
    const logPath = path.join(LOG_DIR, `responses_${ts.slice(0, 10)}.log`);
    const body =
        `${header}\n` +
        `--- BEGIN ---\n` +
        `${extracted || ''}\n` +
        `--- END ---\n\n`;

    await fs.appendFile(logPath, body, 'utf-8');
}

async function downloadTelegramFile(fileUrl, filename) {
    await ensureDir(TMP_DIR);
    const filePath = path.join(TMP_DIR, filename);

    const res = await axios.get(fileUrl, { responseType: 'arraybuffer', timeout: 30000 });
    await fs.writeFile(filePath, res.data);

    return filePath;
}

async function extractTextFromImageBuffer(buf) {
    // Preprocess for OCR: resize and convert to PNG for better recognition
    const preprocessed = await sharp(buf)
        .resize({ width: 1600, withoutEnlargement: true })
        .toFormat('png')
        .toBuffer();

    const ocr = await Tesseract.recognize(preprocessed, 'rus+eng');
    return (ocr?.data?.text || '').trim();
}

async function extractTextFromFile(filePath) {
    const buf = await fs.readFile(filePath);
    const ft = await fileTypeFromBuffer(buf);

    // 1) Image → OCR
    if (ft && ['image/png', 'image/jpeg', 'image/webp'].includes(ft.mime)) {
        return await extractTextFromImageBuffer(buf);
    }

    // 2) PDF → extract text (works for text PDFs; scanned PDFs may be empty)
    if (ft && ft.mime === 'application/pdf') {
        const data = await pdfParse.default(buf);
        return (data?.text || '').trim();
    }

    // 3) DOCX → text
    if (filePath.toLowerCase().endsWith('.docx')) {
        const result = await mammoth.extractRawText({ path: filePath });
        return (result?.value || '').trim();
    }

    // 4) Plain text fallback
    try {
        return buf.toString('utf-8').trim();
    } catch {
        return '';
    }
}

async function voiceflowInteract(userId, text) {
    const url = `https://general-runtime.voiceflow.com/state/${VF_VERSION_ID}/user/${userId}/interact`;

    const res = await axios.post(
        url,
        { request: { type: 'text', payload: text } },
        {
            headers: {
                Authorization: VF_API_KEY,
                'Content-Type': 'application/json',
            },
            timeout: 20000,
        }
    );

    const traces = res.data;
    const messages = [];

    for (const t of traces) {
        if (t?.type === 'text' && t?.payload?.message) {
            messages.push(t.payload.message);
        }
    }

    return messages.length
        ? messages.join('\n')
        : 'Я получил данные, но Voiceflow не вернул текстовый ответ. Проверьте, что в сценарии есть Text-ответы.';
}

async function sendToVoiceflowAsUserTurn(userId, extractedText) {
    // We send extracted text as if it was the user's message (part of the dialog).
    // No service prefixes here, to keep Voiceflow conversation clean.
    return await voiceflowInteract(userId, extractedText);
}

bot.start(async (ctx) => {
    await ctx.reply(
        'Привет! Я бот второго поколения, готовящий продукты на базе ИИ через crowdsource в медицине Российской Федерации. Напиши сообщение — я задам вопросы, подготовлю описание продукта и когда он появится на рынке, ты получишь 25% от доходов с него. Продукт регистрируется за тобой и реализуется командой разработчиков на базе Claude AI от Anthropic.'
    );
});

// Text messages: log + send to Voiceflow
bot.on('text', async (ctx) => {
    const userId = String(ctx.from.id);
    const text = ctx.message.text;

    try {
        await logExtracted({ userId, kind: 'text', fileName: '-', extracted: text });
        const reply = await voiceflowInteract(userId, text);
        await ctx.reply(reply);
    } catch (err) {
        console.error(err?.response?.data || err.message);
        await ctx.reply('Ошибка связи с Voiceflow. Проверь API key / Version ID.');
    }
});

// Photos / screenshots: OCR + log + send extracted text to Voiceflow
bot.on('photo', async (ctx) => {
    const userId = String(ctx.from.id);
    const photos = ctx.message.photo;
    const best = photos[photos.length - 1];

    if (best.file_size && best.file_size > MAX_IMG_MB * 1024 * 1024) {
        return ctx.reply(`Файл слишком большой. Пришлите изображение до ${MAX_IMG_MB}MB.`);
    }

    await ctx.reply('Принял изображение. Извлекаю текст…');

    try {
        const link = await ctx.telegram.getFileLink(best.file_id);
        const fileName = `photo_${best.file_id}.jpg`;
        const filePath = await downloadTelegramFile(link.href, fileName);

        const extracted = await extractTextFromFile(filePath);

        await logExtracted({
            userId,
            kind: 'photo',
            fileName,
            extracted,
        });

        if (!extracted || !extracted.trim()) {
            return ctx.reply(
                'Я не смог извлечь текст из изображения 😕\n' +
                'Попробуйте более чёткий скриншот или пришлите PDF/DOCX, либо ответьте текстом.'
            );
        }

        const reply = await sendToVoiceflowAsUserTurn(userId, truncate(extracted));
        await ctx.reply(reply);
    } catch (err) {
        console.error(err?.response?.data || err.message);
        await ctx.reply(
            'Не получилось обработать изображение. Попробуйте более чёткий скриншот или пришлите PDF/DOCX.'
        );
    }
});

// Documents: extract + log + send extracted text to Voiceflow
bot.on('document', async (ctx) => {
    const userId = String(ctx.from.id);
    const doc = ctx.message.document;

    if (doc.file_size && doc.file_size > MAX_DOC_MB * 1024 * 1024) {
        return ctx.reply(`Файл слишком большой. Пришлите документ до ${MAX_DOC_MB}MB.`);
    }

    await ctx.reply('Принял файл. Извлекаю текст…');

    try {
        const link = await ctx.telegram.getFileLink(doc.file_id);

        const safeName = sanitizeFilename(doc.file_name || `doc_${doc.file_id}`);
        const savedName = `${doc.file_id}_${safeName}`;
        const filePath = await downloadTelegramFile(link.href, savedName);

        const extracted = await extractTextFromFile(filePath);

        await logExtracted({
            userId,
            kind: 'document',
            fileName: doc.file_name || savedName,
            extracted,
        });

        if (!extracted || !extracted.trim()) {
            return ctx.reply(
                'Я не смог извлечь текст из файла 😕\n' +
                'Лучше всего подходят PDF (текстовый) или DOCX. Если это скан — пришлите фото/скрин страниц.'
            );
        }

        const reply = await sendToVoiceflowAsUserTurn(userId, truncate(extracted));
        await ctx.reply(reply);
    } catch (err) {
        console.error(err?.response?.data || err.message);
        await ctx.reply(
            'Не получилось обработать файл. Лучше всего подходят PDF (текстовый) или DOCX. Для сканов — фото/скриншоты.'
        );
    }
});

/* -------------------- start -------------------- */

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL || 'https://vf-telegram-bot.onrender.com';

// Use webhook mode for production (Render)
if (process.env.NODE_ENV === 'production') {
    console.log(`🤖 Bot is running in WEBHOOK mode on port ${PORT}...`);
    console.log(`📊 Webhook URL: ${WEBHOOK_URL}`);
    console.log('📊 Dialog text + files + OCR + logging');

    // Use http module for explicit webhook handling
    import('http').then(({ createServer }) => {
        const server = createServer(async (req, res) => {
            // Only handle POST requests
            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const update = JSON.parse(body);
                        await bot.handleUpdate(update);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: true }));
                    } catch (err) {
                        console.error('Webhook error:', err.message);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ ok: false, error: err.message }));
                    }
                });
            } else {
                // Return 403 for non-POST (expected behavior)
                res.writeHead(403, { 'Content-Type': 'text/plain' });
                res.end('Forbidden');
            }
        });

        server.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ HTTP webhook server listening on port ${PORT}`);
            
            // Set webhook with Telegram
            bot.telegram.setWebhook(`${WEBHOOK_URL}`).then(() => {
                console.log(`✅ Telegram webhook set to: ${WEBHOOK_URL}`);
            }).catch(err => {
                console.error('❌ Failed to set webhook:', err.message);
            });
        });

        // Graceful shutdown
        process.once('SIGINT', () => {
            console.log('Shutting down...');
            bot.stop('SIGINT');
            server.close();
        });
        process.once('SIGTERM', () => {
            console.log('Shutting down...');
            bot.stop('SIGTERM');
            server.close();
        });
    });
} else {
    // Development: polling mode
    console.log('🤖 Bot is running in POLLING mode (dialog text + files + OCR + logging)...');

    bot.launch();

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
