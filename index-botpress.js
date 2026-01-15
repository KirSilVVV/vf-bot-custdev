// index-botpress.js
// Telegram Bot → OpenAI GPT Customer Development Helper
// Использует существующий бот с Supabase + Telegram Stars payments

import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import path from 'path';
import OpenAI from 'openai';
import { chatWithAI, shouldOfferPublish } from './ai-helper.js';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Validate
if (!TELEGRAM_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_CHANNEL_ID) {
    console.error('❌ Missing environment variables. Need:');
    console.error('   - TELEGRAM_BOT_TOKEN');
    console.error('   - SUPABASE_URL');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    console.error('   - TELEGRAM_CHANNEL_ID');
    console.error('   - OPENAI_API_KEY (optional)');
    process.exit(1);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// OpenAI client (опциональный)
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Хранилище последних идей пользователей (для оплаты до публикации)
const userDrafts = new Map(); // userId -> { text, userName }

// Хранилище истории диалогов с AI
const userSessions = new Map(); // userId -> { messages: [], questionCount: 0 }

// ========================
// OpenAI Chat Helper
// ========================
async function getAIResponse(userId, userName, userMessage) {
    // Если OpenAI не настроен, возвращаем простой ответ
    if (!openai) {
        console.log('⚠️ OpenAI not configured, skipping AI conversation');
        return null;
    }

    try {
        // Инициализировать или получить сессию пользователя
        if (!userSessions.has(userId)) {
            const sessionId = `${userId}_${Date.now()}`;
            userSessions.set(userId, { 
                messages: [], 
                questionCount: 0,
                sessionId,
                userName 
            });
        }
        
        const session = userSessions.get(userId);
        
        // Добавить сообщение пользователя в историю
        session.messages.push({ role: 'user', content: userMessage });
        session.questionCount++;
        
        // Получить ответ от OpenAI
        const aiReply = await chatWithAI(openai, session.messages);
        
        // Добавить ответ AI в историю
        session.messages.push({ role: 'assistant', content: aiReply });
        
        console.log(`✅ OpenAI response (Q${session.questionCount}): ${aiReply.substring(0, 100)}...`);
        
        // 📊 Сохранить в Supabase для аналитики
        const readyToPublish = shouldOfferPublish(session.questionCount);
        
        try {
            await supabase.from('conversations').insert({
                user_id: userId.toString(),
                user_name: userName || 'Anonymous',
                session_id: session.sessionId,
                message_number: session.questionCount,
                message_text: userMessage,
                ai_response: aiReply,
                ready_to_publish: readyToPublish,
            });
            console.log(`📊 Conversation logged: session ${session.sessionId}, msg #${session.questionCount}`);
        } catch (dbError) {
            console.error('⚠️ Failed to log conversation:', dbError.message);
        }
        
        return aiReply;
        
    } catch (error) {
        console.error('❌ OpenAI API error:', error.message);
        return null;
    }
}

// Обработчик команды /start
bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name;
    
    console.log(`👋 /start from ${userId} (${userName})`);
    
    // Отправить приветственное видео
    try {
        const videoPath = path.join(process.cwd(), 'IMG_2085.MOV');
        console.log(`📹 Sending video from: ${videoPath}`);
        
        await ctx.replyWithVideo(
            { source: videoPath },
            {
                caption: 
                    `Привет, ${userName}! 👋\n\n` +
                    `Я бот для сбора идей и фич от сообщества.\n\n` +
                    `💡 Просто отправь мне свою идею, и я:\n` +
                    `• Запишу её в базу данных\n` +
                    `• Опубликую в канале @ai_requests для голосования\n` +
                    `• Дам возможность другим проголосовать\n\n` +
                    `⭐ За 1 Star можешь поднять свою идею в топ (+10 голосов сразу)!\n\n` +
                    `📝 Напиши свою идею прямо сейчас:`
            }
        );
        console.log(`✅ Video sent successfully`);
    } catch (err) {
        console.warn(`⚠️ Failed to send video: ${err.message}`);
        console.error(`📍 Attempted path: ${path.join(process.cwd(), 'IMG_2085.MOV')}`);
        
        // Fallback: send text-only message if video fails
        await ctx.reply(
            `Привет, ${userName}! 👋\n\n` +
            `Я бот для сбора идей и фич от сообщества.\n\n` +
            `💡 Просто отправь мне свою идею, и я:\n` +
            `• Запишу её в базу данных\n` +
            `• Опубликую в канале @ai_requests для голосования\n` +
            `• Дам возможность другим проголосовать\n\n` +
            `⭐ За 1 Star можешь поднять свою идею в топ (+10 голосов сразу)!\n\n` +
            `📝 Напиши свою идею прямо сейчас:`
        );
    }
});

// Обработчик текстовых сообщений
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || ctx.from.username || 'Anonymous';
    const userUsername = ctx.from.username || ctx.from.first_name || 'Anonymous';
    const messageText = ctx.message.text;
    
    console.log(`📩 Message from ${userId} (${userName}): ${messageText}`);
    
    try {
        // 1. Получить ответ от AI (если настроен)
        const aiResponse = await getAIResponse(userId, userName, messageText);
        
        // 2. Проверить, готова ли идея к публикации
        const session = userSessions.get(userId);
        const readyToPublish = session && shouldOfferPublish(session.questionCount);
        
        if (aiResponse && !readyToPublish) {
            // AI задает дополнительные вопросы
            await ctx.reply(aiResponse);
            
        } else {
            // Идея готова к публикации или AI не настроен
            // Сохранить черновик
            userDrafts.set(userId, { text: messageText, userName, userUsername });
            
            const finalMessage = aiResponse || 
                '💡 Отлично! Твоя идея готова к публикации.';
            
            // Предложить варианты публикации
            await ctx.reply(
                finalMessage + '\n\n' +
                '📢 Выбери как опубликовать:',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📢 Опубликовать сейчас (0 голосов)', callback_data: 'publish_free' }
                            ],
                            [
                                { text: '⭐ Клинический приоритет (1 Star)', callback_data: 'publish_priority' }
                            ]
                        ]
                    }
                }
            );
            
            // Очистить сессию после публикации
            if (session) {
                userSessions.delete(userId);
            }
        }
        
        // НЕ публикуем автоматически - ждем выбора пользователя
        
    } catch (error) {
        console.error('❌ Error processing message:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
});

// Функция публикации идеи в канал
async function publishToChannel(ctx, userId, messageText, userName, userUsername, initialVotes = 0) {
    console.log('📝 publishToChannel called:', { userId, messageText: messageText?.substring(0, 50), userName, userUsername, initialVotes });
    
    try {
        if (!messageText || messageText.length < 3) {
            console.log('❌ Message too short:', messageText?.length);
            await ctx.answerCbQuery('Идея слишком короткая (минимум 3 символа)');
            return null;
        }
        // Сохранить в Supabase
        const { data: requestData, error: insertError } = await supabase
            .from('requests')
            .insert({
                user_id: userId.toString(),
                user_name: userName,
                request_text: messageText,
                title: messageText.substring(0, 100),
                description: messageText,
                request_type: 'feature',
                vote_count: initialVotes,
                status: 'pending',
            })
            .select()
            .single();
        
        if (insertError) {
            console.error('❌ Supabase error:', insertError);
            return null;
        }
        
        const requestId = requestData.id;
        console.log(`✅ Request saved to Supabase: ${requestId}`);
        
        // Опубликовать в канал с кнопками
        const priorityBadge = initialVotes >= 10 ? '🔥 ' : '';
        const userMention = userUsername ? `@${userUsername}` : userName;
        const channelMessage = `${priorityBadge}🆕 <b>Новый запрос на фичу</b>

💡 ${messageText}

👤 От: ${userMention}
🆔 ID: ${requestId}

<i>📢 Канал: @ai_requests</i>
<i>🕐 ${new Date().toLocaleString('ru-RU')}</i>`;
        
        const channelPost = await ctx.telegram.sendMessage(
            TELEGRAM_CHANNEL_ID,
            channelMessage,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '👍 За (0)', callback_data: `vote_up_${requestId}` },
                            { text: '👎 Против (0)', callback_data: `vote_down_${requestId}` }
                        ],
                        [
                            { text: '⭐ Клинический приоритет (1 Star)', callback_data: `pay_priority_${requestId}` }
                        ]
                    ]
                }
            }
        );
        
        console.log(`✅ Posted to channel: message_id ${channelPost.message_id}`);
        
        // Обновить запись message_id
        await supabase
            .from('requests')
            .update({ 
                channel_message_id: channelPost.message_id,
                channel_chat_id: TELEGRAM_CHANNEL_ID
            })
            .eq('id', requestId);
        
        return requestId;
        
    } catch (error) {
        console.error('❌ Error publishing:', error);
        return null;
    }
}

// Обработчик callback кнопок (голосование, платежи, публикация)
bot.on('callback_query', async (ctx) => {
    try {
        const callbackData = ctx.callbackQuery.data;
        const userId = ctx.from.id;
        const userName = ctx.from.first_name || ctx.from.username || 'Anonymous';
        const messageId = ctx.callbackQuery.message?.message_id;
        const chatId = ctx.callbackQuery.message?.chat.id;
        
        console.log(`🔘 Callback from ${userId}: ${callbackData}`);
        
        // Обработка кнопок публикации в приватном чате
        if (callbackData === 'publish_free') {
            console.log('📢 Publishing free...');
            const draft = userDrafts.get(userId);
            console.log('Draft found:', draft ? 'YES' : 'NO', draft);
            
            if (!draft) {
                await ctx.answerCbQuery('Сначала отправь свою идею');
                return;
            }
            
            await ctx.answerCbQuery('Публикую...');
            console.log('Calling publishToChannel with:', { userId, text: draft.text, userName: draft.userName, userUsername: draft.userUsername });
            
            const requestId = await publishToChannel(ctx, userId, draft.text, draft.userName, draft.userUsername, 0);
            console.log('Publication result:', requestId);
            
            if (requestId) {
                await ctx.editMessageText(
                    `✅ Опубликовано в канале @ai_requests!\n\n` +
                    `📊 ID запроса: ${requestId}\n` +
                    `👍 Голосов: 0\n\n` +
                    `💡 Можешь поднять в топ за 1 Star прямо в канале`
                );
                
                // 📊 Отметить в аналитике что идея была опубликована
                const session = userSessions.get(userId);
                if (session) {
                    await supabase.from('conversations')
                        .update({ published: true })
                        .eq('session_id', session.sessionId);
                    console.log(`📊 Marked session ${session.sessionId} as published`);
                }
                
                userDrafts.delete(userId);
            } else {
                await ctx.answerCbQuery('Ошибка публикации');
            }
            return;
        }
        
        if (callbackData === 'publish_priority') {
            console.log('⭐ Publishing with priority payment...');
            const draft = userDrafts.get(userId);
            if (!draft) {
                await ctx.answerCbQuery('Сначала отправь свою идею');
                return;
            }
            
            await ctx.answerCbQuery('Открываю оплату...');
            
            try {
                // Отправить invoice через объектный синтаксис
                await bot.telegram.sendInvoice(userId, {
                    title: 'Клинический приоритет',
                    description: `Опубликовать с приоритетом (+10 голосов)\n\n"${draft.text.substring(0, 100)}..."`,
                    payload: JSON.stringify({ 
                        action: 'publish_priority',
                        user_id: userId,
                        text: draft.text,
                        user_name: draft.userName,
                        user_username: draft.userUsername
                    }),
                    provider_token: '',
                    currency: 'XTR',
                    prices: [{ label: 'Приоритет', amount: 1 }]
                });
                console.log('✅ Invoice sent');
            } catch (err) {
                console.error('❌ Invoice error:', err.message);
                await ctx.answerCbQuery('Ошибка отправки инвойса');
            }
            return;
        }
        
        // Парсинг callback_data для остальных кнопок
        const [action, type, value] = callbackData.split('_');
        
        if (action === 'vote') {
            // Голосование с ограничением 1 голос на юзера
            const isUpvote = type === 'up';
            const requestId = parseInt(value);
            
            console.log(`${isUpvote ? '👍' : '👎'} Vote for request ${requestId} from user ${userId}`);
            
            // ✅ Проверить не голосовал ли уже этот юзер
            const { data: existingVote } = await supabase
                .from('votes')
                .select('vote_type')
                .eq('user_id', userId.toString())
                .eq('request_id', requestId)
                .single();
            
            if (existingVote) {
                // Уже голосовал
                if (existingVote.vote_type === type) {
                    await ctx.answerCbQuery('✋ Ты уже проголосовал так!');
                    return;
                } else {
                    // Изменить голос (с "за" на "против" или наоборот)
                    await supabase
                        .from('votes')
                        .update({ vote_type: type })
                        .eq('user_id', userId.toString())
                        .eq('request_id', requestId);
                    
                    console.log(`🔄 Changed vote for request ${requestId}`);
                }
            } else {
                // Новый голос
                await supabase
                    .from('votes')
                    .insert({
                        user_id: userId.toString(),
                        user_name: userName,
                        request_id: requestId,
                        vote_type: type
                    });
                
                console.log(`✅ New vote recorded for request ${requestId}`);
            }
            
            // Пересчитать голоса из таблицы votes
            const { data: voteStats } = await supabase
                .from('votes')
                .select('vote_type')
                .eq('request_id', requestId);
            
            const upvotes = voteStats?.filter(v => v.vote_type === 'up').length || 0;
            const downvotes = voteStats?.filter(v => v.vote_type === 'down').length || 0;
            const netVotes = upvotes - downvotes;
            
            // Получить текущий vote_count (может содержать +10 за приоритет)
            const { data: currentRequest } = await supabase
                .from('requests')
                .select('vote_count')
                .eq('id', requestId)
                .single();
            
            const currentVotes = currentRequest?.vote_count || 0;
            
            // Если есть приоритетные голоса (currentVotes > netVotes), сохраняем разницу
            const priorityBonus = Math.max(0, currentVotes - netVotes);
            const finalVoteCount = netVotes + priorityBonus;
            
            // Обновить vote_count в requests
            await supabase
                .from('requests')
                .update({ vote_count: finalVoteCount })
                .eq('id', requestId);
            
            console.log(`✅ Vote count updated: ${requestId} → ${finalVoteCount} (${upvotes}↑ ${downvotes}↓ + ${priorityBonus} priority)`);
            
            // Обновить кнопки в канале - показываем ИТОГОВЫЙ счет
            const newKeyboard = {
                inline_keyboard: [
                    [
                        { text: `👍 Голосов: ${finalVoteCount}`, callback_data: `vote_up_${requestId}` },
                        { text: `👎 Против (${downvotes})`, callback_data: `vote_down_${requestId}` }
                    ],
                    [
                        { text: '⭐ Клинический приоритет (1 Star)', callback_data: `pay_priority_${requestId}` }
                    ]
                ]
            };
            
            try {
                await bot.telegram.editMessageReplyMarkup(chatId, messageId, undefined, newKeyboard);
            } catch (editError) {
                console.log('⚠️ Cannot edit markup:', editError.message);
            }
            
            await ctx.answerCbQuery(`${isUpvote ? '👍' : '👎'} Голос учтен! (${upvotes}↑ ${downvotes}↓)`);
            return;
        }
        
        if (action === 'pay' && type === 'priority') {
            // Платеж через Telegram Stars
            const requestId = parseInt(value);
            console.log(`💰 Payment request for feature #${requestId}`);
            
            try {
                await bot.telegram.sendInvoice(userId, {
                    title: 'Клинический приоритет',
                    description: `Поднять фичу #${requestId} в приоритет (+10 голосов)`,
                    payload: JSON.stringify({ request_id: requestId }),
                    provider_token: '',
                    currency: 'XTR',
                    prices: [{ label: 'Приоритет', amount: 1 }]
                });
                
                await ctx.answerCbQuery('💳 Инвойс отправлен!');
            } catch (invoiceError) {
                console.error('❌ Invoice error:', invoiceError.message);
                await ctx.answerCbQuery('⚠️ Начни диалог с ботом: /start');
            }
            return;
        }
        
    } catch (error) {
        console.error('❌ Callback error:', error.message);
        try {
            await ctx.answerCbQuery('⚠️ Произошла ошибка');
        } catch (e) {
            console.error('❌ Cannot answer callback:', e.message);
        }
    }
});

// Pre-checkout query (подтверждение платежа)
bot.on('pre_checkout_query', async (ctx) => {
    await ctx.answerPreCheckoutQuery(true);
});

// Обработчик successful_payment (Telegram Stars)
bot.on('successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    const userId = ctx.from.id;
    const payload = JSON.parse(payment.invoice_payload);
    
    console.log(`✅ Payment received from ${userId}:`, payload);
    
    // Сохранить платеж в Supabase
    const { data: paymentData } = await supabase
        .from('payments')
        .insert({
            user_id: userId.toString(),
            feature_id: payload.request_id?.toString() || null,
            kind: 'clinical_priority',
            stars: payment.total_amount,
            telegram_charge_id: payment.telegram_payment_charge_id,
        })
        .select()
        .single();
    
    console.log(`✅ Payment saved to Supabase: ${paymentData?.id}`);
    
    // Если это оплата ДО публикации (publish_priority)
    if (payload.action === 'publish_priority') {
        console.log('💰 Priority payment - publishing with +10 votes');
        
        const requestId = await publishToChannel(
            ctx, 
            payload.user_id, 
            payload.text, 
            payload.user_name,
            payload.user_username, 
            10 // Сразу 10 голосов
        );
        
        if (requestId) {
            // Обновить payment с request_id
            await supabase
                .from('payments')
                .update({ feature_id: requestId.toString() })
                .eq('id', paymentData.id);
            
            await ctx.reply(
                `🎉 Спасибо за поддержку!\n\n` +
                `🔥 Твоя идея опубликована с клиническим приоритетом!\n\n` +
                `📊 ID: ${requestId}\n` +
                `⭐ Бонус: +10 голосов сразу\n\n` +
                `📢 Следи за голосованием в канале!`
            );
            
            userDrafts.delete(payload.user_id);
        }
        return;
    }
    
    // Обновить голоса в Supabase (+10 за клинический приоритет)
    if (payload.request_id) {
        const requestId = payload.request_id;
        
        // Получить текущее количество голосов
        const { data: currentRequest } = await supabase
            .from('requests')
            .select('vote_count')
            .eq('id', requestId)
            .single();
        
        const newVoteCount = (currentRequest?.vote_count || 0) + 10;
        
        // Обновить vote_count
        const { error } = await supabase
            .from('requests')
            .update({ vote_count: newVoteCount })
            .eq('id', requestId);
        
        if (error) {
            console.error('❌ Supabase update error:', error);
        } else {
            console.log(`✅ Request #${requestId} updated: +10 votes (now ${newVoteCount})`);
            
            // Отправить благодарность
            await ctx.reply(
                `🎉 Спасибо за поддержку!\n\n` +
                `⭐ Идея #${requestId} получила клинический приоритет!\n` +
                `🔥 Бонус: +10 голосов (всего ${newVoteCount})\n\n` +
                `📊 Следи за голосованием в канале @ai_requests`
            );
        }
    }
});

// Express сервер для Render health checks
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 Telegram → Botpress Bridge активен!');
});

app.listen(PORT, () => {
    console.log(`✅ Express server на порту ${PORT}`);
});

// Запуск Telegram бота
if (process.env.NODE_ENV === 'production') {
    // Production: webhook mode
    const WEBHOOK_DOMAIN = process.env.RENDER_EXTERNAL_URL || `https://vf-bot-custdev.onrender.com`;
    bot.telegram.setWebhook(`${WEBHOOK_DOMAIN}/telegram-webhook`);
    
    app.use(bot.webhookCallback('/telegram-webhook'));
    console.log(`✅ Telegram webhook: ${WEBHOOK_DOMAIN}/telegram-webhook`);
    
    // Graceful shutdown для webhook
    process.once('SIGINT', () => {
        console.log('Shutting down...');
        process.exit(0);
    });
    process.once('SIGTERM', () => {
        console.log('Shutting down...');
        process.exit(0);
    });
} else {
    // Development: polling mode
    bot.launch();
    console.log('✅ Telegram bot started (polling mode)');
    
    // Graceful shutdown для polling
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
}
