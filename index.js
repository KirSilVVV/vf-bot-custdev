// index.js
// Telegram (Telegraf) → (OCR / file text extraction) → Voiceflow Runtime API
// + Logs extracted text to console + logs/responses_YYYY-MM-DD.log
//
// Requirements (Node 18+ recommended; you have Node 24):
//   npm i telegraf axios dotenv sharp tesseract.js pdf-parse mammoth file-type

import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import Tesseract from 'tesseract.js';
import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { fileTypeFromBuffer } from 'file-type';
import axios from 'axios';
import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import express from 'express';

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

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Download Telegram file
async function downloadTelegramFile(fileUrl, fileName) {
    await ensureDir(TMP_DIR);
    const filePath = path.join(TMP_DIR, fileName);
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    await fs.writeFile(filePath, response.data);
    return filePath;
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
        // 1) Create record in Supabase public.requests table
        // Normalize fields for insert
        // Only use author_tg_id if it's a number, else null
        let tgIdRaw = requestData.author_tg_id ?? requestData.user_id;
        const author_tg_id = Number.isFinite(+tgIdRaw) ? +tgIdRaw : null;
        const author_username = requestData.author_username || requestData.user_name || 'Anonymous';
        // Prefer explicit title, else fallback to request_type
        const title = requestData.title || requestData.request_type || '';
        // Prefer explicit description, else fallback to request_text
        const description = requestData.description || requestData.request_text || '';
        const tags = requestData.tags || [];
        const domain = requestData.domain || '';

        const { data: insertedRequest, error: insertError } = await supabase
            .from('requests')
            .insert({
                author_tg_id,
                author_username,
                title,
                description,
                tags,
                domain,
                status: 'published',
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

        // Форматируем текст для Telegram
        const tagsText = (requestData.tags && requestData.tags.length)
            ? requestData.tags.join(', ')
            : '—';
        const authorText = requestData.author_username ? `@${requestData.author_username}` : '—';
        const authorIdText = requestData.author_tg_id ? requestData.author_tg_id : '—';
        const titleText = requestData.title || '';
        const descriptionText = requestData.description || '';

        const messageText = `🧩 <b>${titleText}</b>\n\n${descriptionText}\n\nТеги: ${tagsText}\nАвтор: ${authorText} (id:${authorIdText})\nID: ${requestId}`;

        // Inline keyboard for voting
        const inline_keyboard = [
            [
                { text: `👍 Голосовать (0)`, callback_data: `vote:${requestId}` },
                { text: `🗳 Снять голос`, callback_data: `unvote:${requestId}` }
            ]
        ];

        const telegramResponse = await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
                chat_id: TELEGRAM_CHANNEL_ID,
                text: messageText,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: { inline_keyboard },
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
                channel_chat_id: TELEGRAM_CHANNEL_ID,
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
    } catch (err) {
        console.error('❌ publishRequestToChannel error:', err.message);
        throw err;
    }
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

// Callback query handler (voting buttons)
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery?.data || '';
    const voterId = ctx.from.id;
    
    // 1) IMMEDIATELY ACK to prevent Telegram timeout/retry
    try { 
        await ctx.answerCbQuery('Принято'); 
    } catch {}

    // 2) Now do the logic - even if it fails, Telegram already got the response
    try {
        let requestId = null;
        let answerText = 'Обработано';

        if (typeof data === 'string' && data.startsWith('vote:')) {
            requestId = parseInt(data.slice(5), 10);
            console.log('VOTE click:', { requestId, voterId, data });
            
            if (!Number.isFinite(requestId)) {
                console.log('VOTE invalid requestId:', requestId);
                return;
            }
            
            // Check if request exists
            const { data: reqExists } = await supabase
                .from('requests')
                .select('id')
                .eq('id', requestId)
                .maybeSingle();
            
            if (!reqExists) {
                console.log('VOTE request not found:', requestId);
                return;
            }

            // Try to insert vote - if unique constraint violation, user already voted
            const { error: insErr, data: insData } = await supabase
                .from('votes')
                .insert({ request_id: requestId, voter_tg_id: voterId });
            
            const alreadyVoted = insErr?.code === '23505'; // unique constraint violation
            console.log('VOTE insert result:', { insErr: insErr?.message, insData, alreadyVoted });

            // Count votes
            const { count } = await supabase
                .from('votes')
                .select('*', { count: 'exact', head: true })
                .eq('request_id', requestId);
            
            console.log('VOTE count:', { requestId, count });

            // Update vote_count in requests
            const { error: updateErr } = await supabase
                .from('requests')
                .update({ vote_count: count })
                .eq('id', requestId);
            
            if (updateErr) {
                console.error('VOTE update count error:', updateErr);
            }

        } else if (typeof data === 'string' && data.startsWith('unvote:')) {
            requestId = parseInt(data.slice(7), 10);
            console.log('UNVOTE click:', { requestId, voterId, data });
            
            if (!Number.isFinite(requestId)) {
                console.log('UNVOTE invalid requestId:', requestId);
                return;
            }

            // Check if request exists
            const { data: reqExists } = await supabase
                .from('requests')
                .select('id')
                .eq('id', requestId)
                .maybeSingle();
            
            if (!reqExists) {
                console.log('UNVOTE request not found:', requestId);
                return;
            }

            // Remove vote
            const { error: delErr } = await supabase
                .from('votes')
                .delete()
                .eq('request_id', requestId)
                .eq('voter_tg_id', voterId);
            
            console.log('UNVOTE delete result:', { delErr: delErr?.message });

            // Count votes
            const { count } = await supabase
                .from('votes')
                .select('*', { count: 'exact', head: true })
                .eq('request_id', requestId);
            
            console.log('UNVOTE count:', { requestId, count });

            // Update vote_count in requests
            const { error: updateErr } = await supabase
                .from('requests')
                .update({ vote_count: count })
                .eq('id', requestId);
            
            if (updateErr) {
                console.error('UNVOTE update count error:', updateErr);
            }
        }
    } catch (err) {
        console.error('callback_query handler error:', err);
    }
});

/* -------------------- start -------------------- */

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL || 'https://vf-telegram-bot.onrender.com';
const WEBHOOK_PATH = '/webhook';

// Use webhook mode for production (Render)
if (process.env.NODE_ENV === 'production') {
    console.log(`🤖 Bot is running in WEBHOOK mode on port ${PORT}...`);
    console.log(`📊 Webhook URL: ${WEBHOOK_URL}${WEBHOOK_PATH}`);
    console.log('📊 Dialog text + files + OCR + logging');

    const app = express();
    
    // JSON parser middleware (before routes)
    app.use(express.json({ limit: '2mb' }));

    // Handle OPTIONS /vf/submit (CORS preflight)
    app.options('/vf/submit', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-vf-secret');
        return res.sendStatus(204);
    });

    // Telegram webhook
    app.post(WEBHOOK_PATH, async (req, res) => {
        try {
            const update = req.body;
            console.log('TG WEBHOOK update:', JSON.stringify(update));

            // Log update type
            if (update.message) {
                console.log('📨 Update type: message');
            } else if (update.callback_query) {
                console.log('🔘 Update type: callback_query');
                console.log(`   data: ${update.callback_query.data}`);
                console.log(`   from.id: ${update.callback_query.from.id}`);
                console.log(`   message.message_id: ${update.callback_query.message?.message_id}`);
            }

            // Handle all updates through bot.handleUpdate
            await bot.handleUpdate(update);
        } catch (err) {
            console.error('❌ Telegram webhook error:', err.message);
        }
        // Telegram always gets 200, otherwise it will accumulate pending updates
        return res.sendStatus(200);
    });

    // POST /vf/submit endpoint
    app.post('/vf/submit', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');

        try {
            const payload = req.body;

            // Log Voiceflow incoming request
            console.log('VF SUBMIT headers:', req.headers['content-type'], req.headers['x-vf-secret'] ? 'has_secret' : 'no_secret');
            console.log('VF SUBMIT body:', JSON.stringify(payload));
            console.log('VF SUBMIT tags isArray:', Array.isArray(payload?.tags), payload?.tags);
            console.log('VF SUBMIT payload:', payload);

            // Normalize and default fields
            const title = (payload.title ?? payload.request_type ?? payload.request_title ?? '').toString().trim();
            const description = (payload.description ?? payload.request_text ?? payload.text ?? '').toString().trim();
            const safeTitle = title.length ? title : 'Без названия';
            const safeDescription = description.length ? description : '—';
            const author_tg_id = Number.isFinite(+payload.author_tg_id) ? +payload.author_tg_id : (Number.isFinite(+payload.user_id) ? +payload.user_id : null);
            const author_username = (payload.author_username ?? payload.user_name ?? null);
            const tags = Array.isArray(payload.tags) ? payload.tags : [];
            const domain = typeof payload.domain === 'string' ? payload.domain : '';
            const status = 'published';

            // Log real values
            console.log('VF SUBMIT received:', { title: safeTitle, descriptionLength: safeDescription.length, author_tg_id });

            // Validation
            if (typeof safeTitle !== 'string' || safeTitle.length < 3) {
                return res.status(400).json({ ok: false, error: 'title must be a string with at least 3 characters' });
            }
            if (typeof safeDescription !== 'string' || safeDescription.length < 10) {
                console.log('VF SUBMIT description too short, incoming fields:', payload);
                return res.status(400).json({ ok: false, error: 'description must be a string with at least 10 characters' });
            }
            if (tags && (!Array.isArray(tags) || !tags.every(tag => typeof tag === 'string'))) {
                return res.status(400).json({ ok: false, error: 'tags must be an array of strings' });
            }
            if (author_tg_id && typeof author_tg_id !== 'number') {
                return res.status(400).json({ ok: false, error: 'author_tg_id must be a number' });
            }
            if (author_username && typeof author_username !== 'string') {
                return res.status(400).json({ ok: false, error: 'author_username must be a string' });
            }

            // Only insert normalized fields
            const result = await publishRequestToChannel({
                author_tg_id,
                author_username,
                title: safeTitle,
                description: safeDescription,
                tags,
                domain,
                status
            });

            return res.status(200).json({
                ok: true,
                request_id: result.request_id,
                channel_message_id: result.channel_message_id
            });
        } catch (err) {
            console.error('❌ POST /vf/submit error:', err.message);
            return res.status(500).json({
                ok: false,
                error: err.message,
            });
        }
    });

    // Health check
    app.get('/', (req, res) => {
        return res.json({ ok: true, status: 'running' });
    });

    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Webhook server is listening on 0.0.0.0:${PORT}`);
        console.log(`📊 Listening for Telegram updates on ${WEBHOOK_URL}${WEBHOOK_PATH}`);

        // Set webhook with Telegram
        bot.telegram.setWebhook(`${WEBHOOK_URL}${WEBHOOK_PATH}`).then(() => {
            console.log(`✅ Telegram webhook set to: ${WEBHOOK_URL}${WEBHOOK_PATH}`);
        }).catch((err) => {
            console.error('❌ Failed to set webhook:', err.message);
        });
    });

    // Handle graceful shutdown
    let shuttingDown = false;
    process.on('SIGINT', () => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log('SIGINT received, shutting down server...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
        // Force exit after 10 seconds
        setTimeout(() => {
            console.log('Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    });

    process.on('SIGTERM', () => {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log('SIGTERM received, shutting down server...');
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
        // Force exit after 30 seconds
        setTimeout(() => {
            console.log('Forced shutdown after timeout');
            process.exit(1);
        }, 30000);
    });
} else {
    // Polling mode for development
    console.log('🤖 Bot is running in POLLING mode...');
    bot.launch();
    process.once('SIGINT', () => {
        console.log('SIGINT received, stopping bot...');
        bot.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
        console.log('SIGTERM received, stopping bot...');
        bot.stop('SIGTERM');
    });
}