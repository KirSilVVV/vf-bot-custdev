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

/* -------------------- start -------------------- */

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL || 'https://vf-telegram-bot.onrender.com';
const WEBHOOK_PATH = '/webhook';

// Use webhook mode for production (Render)
if (process.env.NODE_ENV === 'production') {
    console.log(`🤖 Bot is running in WEBHOOK mode on port ${PORT}...`);
    console.log(`📊 Webhook URL: ${WEBHOOK_URL}${WEBHOOK_PATH}`);
    console.log('📊 Dialog text + files + OCR + logging');

    // Use http module for explicit webhook handling
    import('http').then(({ createServer }) => {
        const server = createServer(async (req, res) => {
                        // Handle Telegram webhook (POST /telegram/webhook or /webhook)
                        if (req.method === 'POST' && (req.url === '/telegram/webhook' || req.url === '/webhook')) {
                            let body = '';
                            req.on('data', chunk => body += chunk);
                            req.on('end', async () => {
                                try {
                                    const update = JSON.parse(body);
                                    // Debug log
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

                                    if (update.callback_query) {
                                        const callbackId = update.callback_query.id;
                                        let data = '', from_id = null, answerText = 'Обработано', request_id = null;
                                        try {
                                            data = update.callback_query.data;
                                            from_id = update.callback_query.from.id;
                                            if (typeof data === 'string' && data.startsWith('vote:')) {
                                                request_id = parseInt(data.slice(5), 10);
                                                if (!Number.isFinite(request_id)) {
                                                    answerText = 'Ошибка: заявка не найдена';
                                                } else {
                                                    // Проверить, существует ли заявка
                                                    const { data: reqExists } = await supabase
                                                        .from('requests')
                                                        .select('id')
                                                        .eq('id', request_id)
                                                        .maybeSingle();
                                                    if (!reqExists) {
                                                        answerText = 'Ошибка: заявка не найдена';
                                                    } else {
                                                        // Проверить, был ли уже голос
                                                        const { data: existingVote } = await supabase
                                                            .from('votes')
                                                            .select('request_id')
                                                            .eq('request_id', request_id)
                                                            .eq('voter_tg_id', from_id)
                                                            .maybeSingle();
                                                        if (existingVote) {
                                                            answerText = 'Вы уже голосовали';
                                                        } else {
                                                            // Голосование: upsert голос
                                                            try {
                                                                await supabase.from('votes').insert({ request_id, voter_tg_id: from_id }, { onConflict: ['request_id', 'voter_tg_id'] });
                                                            } catch (e) {
                                                                // ignore conflict
                                                            }
                                                            answerText = 'Голос учтён 👍';
                                                        }
                                                        // Посчитать голоса
                                                        let voteCount = 0;
                                                        try {
                                                            const { data: countData } = await supabase
                                                                .from('votes')
                                                                .select('voter_tg_id', { count: 'exact', head: true })
                                                                .eq('request_id', request_id);
                                                            voteCount = countData?.length ?? 0;
                                                        } catch (e) {
                                                            console.error('Vote count error:', e);
                                                        }
                                                        // Обновить requests.vote_count
                                                        try {
                                                            await supabase.from('requests').update({ vote_count: voteCount }).eq('id', request_id);
                                                        } catch (e) {
                                                            console.error('Update vote_count error:', e);
                                                        }
                                                        // Получить chat_id и message_id
                                                        try {
                                                            const { data: reqRow } = await supabase
                                                                .from('requests')
                                                                .select('channel_chat_id, channel_message_id')
                                                                .eq('id', request_id)
                                                                .single();
                                                            if (reqRow && reqRow.channel_chat_id && reqRow.channel_message_id) {
                                                                // Обновить inline-клавиатуру
                                                                try {
                                                                    await axios.post(
                                                                        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`,
                                                                        {
                                                                            chat_id: reqRow.channel_chat_id,
                                                                            message_id: reqRow.channel_message_id,
                                                                            reply_markup: {
                                                                                inline_keyboard: [
                                                                                    [
                                                                                        { text: `👍 Голосовать (${voteCount})`, callback_data: `vote:${request_id}` },
                                                                                        { text: `🗳 Снять голос`, callback_data: `unvote:${request_id}` }
                                                                                    ]
                                                                                ]
                                                                            }
                                                                        }
                                                                    );
                                                                } catch (e) {
                                                                    console.error('editMessageReplyMarkup error:', e);
                                                                }
                                                            }
                                                        } catch (e) {
                                                            console.error('Get channel info error:', e);
                                                        }
                                                    }
                                                }
                                            } else if (typeof data === 'string' && data.startsWith('unvote:')) {
                                                request_id = parseInt(data.slice(7), 10);
                                                if (!Number.isFinite(request_id)) {
                                                    answerText = 'Ошибка: заявка не найдена';
                                                } else {
                                                    // Проверить, существует ли заявка
                                                    const { data: reqExists, error: reqErr } = await supabase
                                                        .from('requests')
                                                        .select('id')
                                                        .eq('id', request_id)
                                                        .maybeSingle();
                                                    if (!reqExists) {
                                                        answerText = 'Ошибка: заявка не найдена';
                                                    } else {
                                                        // Удалить голос (идемпотентно)
                                                        try {
                                                            await supabase.from('votes').delete().eq('request_id', request_id).eq('voter_tg_id', from_id);
                                                        } catch (e) {
                                                            console.error('Unvote error:', e);
                                                        }
                                                        answerText = 'Голос снят';
                                                        // Посчитать голоса
                                                        let voteCount = 0;
                                                        try {
                                                            const { data: countData } = await supabase
                                                                .from('votes')
                                                                .select('voter_tg_id', { count: 'exact', head: true })
                                                                .eq('request_id', request_id);
                                                            voteCount = countData?.length ?? 0;
                                                        } catch (e) {
                                                            console.error('Vote count error:', e);
                                                        }
                                                        // Обновить requests.vote_count
                                                        try {
                                                            await supabase.from('requests').update({ vote_count: voteCount }).eq('id', request_id);
                                                        } catch (e) {
                                                            console.error('Update vote_count error:', e);
                                                        }
                                                        // Получить chat_id и message_id
                                                        try {
                                                            const { data: reqRow } = await supabase
                                                                .from('requests')
                                                                .select('channel_chat_id, channel_message_id')
                                                                .eq('id', request_id)
                                                                .single();
                                                            if (reqRow && reqRow.channel_chat_id && reqRow.channel_message_id) {
                                                                // Обновить inline-клавиатуру
                                                                try {
                                                                    await axios.post(
                                                                        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageReplyMarkup`,
                                                                        {
                                                                            chat_id: reqRow.channel_chat_id,
                                                                            message_id: reqRow.channel_message_id,
                                                                            reply_markup: {
                                                                                inline_keyboard: [
                                                                                    [
                                                                                        { text: `👍 Голосовать (${voteCount})`, callback_data: `vote:${request_id}` },
                                                                                        { text: `🗳 Снять голос`, callback_data: `unvote:${request_id}` }
                                                                                    ]
                                                                                ]
                                                                            }
                                                                        }
                                                                    );
                                                                } catch (e) {
                                                                    console.error('editMessageReplyMarkup error:', e);
                                                                }
                                                            }
                                                        } catch (e) {
                                                            console.error('Get channel info error:', e);
                                                        }
                                                    }
                                                }
                                            }
                                        } catch (errVote) {
                                            console.error('Vote/unvote handler error:', errVote);
                                            answerText = 'Ошибка обработки голосования';
                                        }
                                        // Always answer callback query
                                        try {
                                            await bot.telegram.answerCallbackQuery(callbackId, { 
                                                text: answerText, 
                                                show_alert: false 
                                            });
                                        } catch (e) {
                                            console.error('answerCallbackQuery error:', e);
                                        }
                                    }
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ ok: true }));
                                } catch (err) {
                                    console.error('❌ Telegram webhook error:', err.message);
                                    if (!res.headersSent) {
                                        res.writeHead(200, { 'Content-Type': 'application/json' });
                                        res.end(JSON.stringify({ ok: true }));
                                    }
                                }
                            });
                        }
            // Handle POST /vf/submit
            if (req.method === 'POST' && req.url === '/vf/submit') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', async () => {
                    try {
                        // Diagnostics
                        console.log('VF SUBMIT content-type:', req.headers['content-type']);
                        console.log('VF SUBMIT raw body:', body);
                        let payload = {};
                        try {
                            payload = JSON.parse(body);
                        } catch (e) {
                            console.log('VF SUBMIT body parse error:', e.message);
                        }
                        console.log('VF SUBMIT body keys:', Object.keys(payload || {}));

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
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ ok: false, error: 'title must be a string with at least 3 characters' }));
                            return;
                        }
                        if (typeof safeDescription !== 'string' || safeDescription.length < 10) {
                            console.log('VF SUBMIT description too short, incoming fields:', payload);
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ ok: false, error: 'description must be a string with at least 10 characters' }));
                            return;
                        }
                        if (tags && (!Array.isArray(tags) || !tags.every(tag => typeof tag === 'string'))) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ ok: false, error: 'tags must be an array of strings' }));
                            return;
                        }
                        if (author_tg_id && typeof author_tg_id !== 'number') {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ ok: false, error: 'author_tg_id must be a number' }));
                            return;
                        }
                        if (author_username && typeof author_username !== 'string') {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ ok: false, error: 'author_username must be a string' }));
                            return;
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

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            ok: true,
                            request_id: result.request_id,
                            channel_message_id: result.channel_message_id
                        }));
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
            // Handle GET / for health checks
            if (req.method === 'GET' && req.url === '/') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, status: 'running' }));
                return;
            }
            // Default 404 for other routes
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Not found' }));
            // ...existing code for any other routes or logic...
            // ...existing code for any other routes or logic...
            // ...existing code for any other routes or logic...
            // ...existing code for any other routes or logic...
            // ...existing code for any other routes or logic...
        });

        server.listen(PORT, '0.0.0.0', () => {
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
            console.log('SIGINT received, shutting down webhook server...');
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
            console.log('SIGTERM received, shutting down webhook server...');
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