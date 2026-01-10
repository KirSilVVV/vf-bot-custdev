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
import { supabase } from './supabaseClient.js';

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
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

// Validate required environment variables
const requiredEnv = {
    TELEGRAM_BOT_TOKEN,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    TELEGRAM_CHANNEL_ID,
};

const missing = Object.entries(requiredEnv)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\n📝 Please set these variables in your .env file or Render dashboard');
    console.error('\n📋 Required variables for this release:');
    console.error('   • TELEGRAM_BOT_TOKEN (Telegram bot token from BotFather)');
    console.error('   • SUPABASE_URL (Supabase project URL)');
    console.error('   • SUPABASE_SERVICE_ROLE_KEY (Supabase service role key)');
    console.error('   • TELEGRAM_CHANNEL_ID (Target Telegram channel ID, format: -100...)');
    process.exit(1);
}

// Validate Voiceflow variables (needed for bot dialog functionality)
if (!VF_API_KEY || !VF_VERSION_ID) {
    console.error('⚠️  Warning: Voiceflow variables not fully configured');
    if (!VF_API_KEY) console.error('   - VOICEFLOW_API_KEY is missing');
    if (!VF_VERSION_ID) console.error('   - VOICEFLOW_VERSION_ID is missing');
    console.error('\n   Bot dialog functionality will not work, but /vf/submit endpoint will still be available');
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

async function publishRequestToChannel(requestData) {
    /**
     * Публикует запрос в Telegram канал и сохраняет информацию о сообщении в Supabase
     * @param {Object} requestData - { user_id, user_name, request_text, request_type, metadata }
     * @returns {Object} - { ok, request_id, channel_message_id, channel_chat_id }
     */
    try {
        // 1) Create record in Supabase requests table
        const { data: insertedRequest, error: insertError } = await supabase
            .from('requests')
            .insert({
                user_id: requestData.user_id,
                user_name: requestData.user_name || 'Anonymous',
                request_text: requestData.request_text,
                request_type: requestData.request_type || 'text',
                metadata: requestData.metadata || {},
                status: 'pending',
                created_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (insertError) {
            console.error('❌ Supabase insert error:', insertError);
            throw insertError;
        }

        const requestId = insertedRequest.id;
        console.log(`✅ Created request in Supabase: ${requestId}`);

        // 2) Publish message to Telegram channel
        const messageText = `<b>🆕 Новый запрос</b>\n\n<b>ID:</b> ${requestId}\n<b>Тип:</b> ${requestData.request_type || 'text'}\n<b>От:</b> ${requestData.user_name || 'Anonymous'}\n\n<b>Текст:</b>\n${requestData.request_text}`;

        const telegramResponse = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: TELEGRAM_CHANNEL_ID,
                text: messageText,
                parse_mode: 'HTML',
            },
            {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                }
            }
        );

        if (!telegramResponse.data.ok) {
            console.error('❌ Telegram API error:', telegramResponse.data);
            throw new Error(`Telegram API error: ${telegramResponse.data.description}`);
        }

        const messageId = telegramResponse.data.result.message_id;
        const chatId = telegramResponse.data.result.chat.id;

        console.log(`✅ Published to Telegram: message_id=${messageId}, chat_id=${chatId}`);

        // 3) Update request record with message info
        const { error: updateError } = await supabase
            .from('requests')
            .update({
                channel_message_id: messageId,
                channel_chat_id: chatId,
            })
            .eq('id', requestId);

        if (updateError) {
            console.error('❌ Supabase update error:', updateError);
            throw updateError;
        }

        return {
            ok: true,
            request_id: requestId,
            channel_message_id: messageId,
            channel_chat_id: chatId,
        };
    } catch (error) {
        console.error('❌ Error publishing request:', error.message);
        throw error;
    }
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
        await ctx.sendChatAction('typing');
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

        await ctx.sendChatAction('typing');
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

        await ctx.sendChatAction('typing');
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
            // Handle POST /vf/submit
            if (req.method === 'POST' && req.url === '/vf/submit') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        const payload = JSON.parse(body);
                        
                        console.log('📨 POST /vf/submit received:', {
                            user_id: payload.user_id,
                            request_type: payload.request_type,
                            text_len: (payload.request_text || '').length,
                        });

                        const result = await publishRequestToChannel({
                            user_id: payload.user_id || 'unknown',
                            user_name: payload.user_name || 'Anonymous',
                            request_text: payload.request_text || '',
                            request_type: payload.request_type || 'text',
                            metadata: payload.metadata || {},
                        });

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(result));
                    } catch (err) {
                        console.error('❌ POST /vf/submit error:', err.message);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            ok: false,
                            error: err.message,
                        }));
                    }
                });
                return;
            }

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
