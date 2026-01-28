// index-botpress.js
// Telegram Bot → OpenAI GPT Customer Development Helper
// Использует существующий бот с Supabase + Telegram Stars payments

import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import path from 'path';
import OpenAI from 'openai';
import cron from 'node-cron';
import { chatWithAI, shouldOfferPublish, parseAIFinalResponse } from './ai-helper.js';

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

// ============================================================================
// CRON: Автоматическое обновление топ-идей каждый день в 12:00 МСК
// ============================================================================
async function updateTopIdeasPost() {
    try {
        console.log('📊 [CRON] Обновляю топ-идеи...');
        
        const { data: topRequests, error } = await supabase
            .from('requests')
            .select('id, request_text, vote_count, user_name, channel_message_id')
            .order('vote_count', { ascending: false })
            .limit(10);
        
        if (error || !topRequests || topRequests.length === 0) {
            console.log('📭 [CRON] Нет идей для топа');
            return;
        }
        
        let topMessage = `🏆 <b>ТОП ИДЕЙ ПО ГОЛОСАМ</b>\n\n`;
        
        topRequests.forEach((req, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const votes = req.vote_count || 0;
            const text = req.request_text?.substring(0, 80) || 'Без описания';
            
            topMessage += `${medal} <b>${votes} голосов</b>\n`;
            topMessage += `   ${text}...\n`;
            topMessage += `   <a href="https://t.me/ai_requests/${req.channel_message_id}">Перейти →</a>\n\n`;
        });
        
        topMessage += `\n<i>Обновлено: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}</i>`;
        
        const { data: pinnedData } = await supabase
            .from('system_messages')
            .select('message_id')
            .eq('type', 'top_ideas')
            .single();
        
        if (pinnedData?.message_id) {
            try {
                await bot.telegram.editMessageText(
                    TELEGRAM_CHANNEL_ID,
                    pinnedData.message_id,
                    undefined,
                    topMessage,
                    { parse_mode: 'HTML', disable_web_page_preview: true }
                );
                console.log('✅ [CRON] Топ обновлён');
            } catch (editError) {
                const newMsg = await bot.telegram.sendMessage(TELEGRAM_CHANNEL_ID, topMessage, { 
                    parse_mode: 'HTML',
                    disable_web_page_preview: true 
                });
                await bot.telegram.pinChatMessage(TELEGRAM_CHANNEL_ID, newMsg.message_id);
                await supabase
                    .from('system_messages')
                    .upsert({ type: 'top_ideas', message_id: newMsg.message_id });
                console.log('✅ [CRON] Создан новый топ');
            }
        } else {
            const newMsg = await bot.telegram.sendMessage(TELEGRAM_CHANNEL_ID, topMessage, { 
                parse_mode: 'HTML',
                disable_web_page_preview: true 
            });
            await bot.telegram.pinChatMessage(TELEGRAM_CHANNEL_ID, newMsg.message_id);
            await supabase
                .from('system_messages')
                .insert({ type: 'top_ideas', message_id: newMsg.message_id });
            console.log('✅ [CRON] Топ создан и закреплен');
        }
    } catch (error) {
        console.error('❌ [CRON] Ошибка обновления топа:', error);
    }
}

// Cron job: каждый день в 12:00 по Москве (UTC+3 = 09:00 UTC)
cron.schedule('0 9 * * *', () => {
    console.log('⏰ [CRON] Запуск обновления топа (12:00 МСК)');
    updateTopIdeasPost();
}, {
    timezone: 'UTC'
});

console.log('⏰ Cron job настроен: обновление топа каждый день в 12:00 МСК');

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
                    `Бот помогает собрать и структурировать рабочие задачи и наблюдения и превратить их в идеи для цифровых решений.\n\n` +
                    `Ответьте на несколько вопросов — это поможет оформить проблему и её структуру.`
            }
        );
        console.log(`✅ Video sent successfully`);
    } catch (err) {
        console.warn(`⚠️ Failed to send video: ${err.message}`);
        console.error(`📍 Attempted path: ${path.join(process.cwd(), 'IMG_2085.MOV')}`);
        
        // Fallback: send text-only message if video fails
        await ctx.reply(
            `Бот помогает собрать и структурировать рабочие задачи и наблюдения и превратить их в идеи для цифровых решений.\n\n` +
            `Ответьте на несколько вопросов — это поможет оформить проблему и её структуру.`
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
            // AI задает дополнительные вопросы (еще не собрана полная информация)
            await ctx.reply(aiResponse);
            
        } else if (aiResponse && readyToPublish) {
            // Проверить что AI сгенерировал финальный ответ с полным описанием
            const { fullDescription, shortDraft } = parseAIFinalResponse(aiResponse);
            
            // Если AI не сгенерировал полное описание - продолжаем опрос
            if (!fullDescription || !shortDraft) {
                console.log('⚠️ AI response does not contain full description yet, continuing interview...');
                await ctx.reply(aiResponse);
                return;
            }
            
            // AI завершил опрос и сформировал продуктовую фичу
            await ctx.reply(aiResponse);
            
            // Сохранить оба варианта в черновик
            userDrafts.set(userId, { 
                text: shortDraft, // Краткая версия для канала
                fullDescription: fullDescription, // Полная версия для базы
                userName, 
                userUsername 
            });
            
            console.log(`📝 Feature ready: short=${shortDraft.substring(0, 50)}..., full=${fullDescription.substring(0, 50)}...`);
            
            // Предложить варианты публикации ТОЛЬКО после полного описания
            await ctx.reply(
                '🎉 Отлично! Твоя фича готова к публикации!\n\n' +
                'Выбери стратегию:\n\n' +
                '💡 Фишка: ТОП-10 идей попадают в закреплённый пост → больше видимость → быстрее в разработку!',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📢 Бесплатно (с 0 голосов, медленный рост)', callback_data: 'publish_free' }
                            ],
                            [
                                { text: '🔥 ПРИОРИТЕТ за 1⭐ (+10 голосов = ТОП!)', callback_data: 'publish_priority' }
                            ],
                            [
                                { text: '⭐ Купить звёзды (если нет)', url: 'https://gaming-goods.ru/t/telegram-stars?product=966299&ref=20' }
                            ]
                        ]
                    }
                }
            );
            
            // Очистить сессию после публикации
            if (session) {
                userSessions.delete(userId);
            }
        } else {
            // AI не настроен или fallback
            userDrafts.set(userId, { 
                text: messageText, 
                fullDescription: messageText,
                userName, 
                userUsername 
            });
            
            const finalMessage = '💡 Отлично! Твоя идея готова к публикации.';
            
            // Предложить варианты публикации
            await ctx.reply(
                finalMessage + '\n\n' +
                'Выбери стратегию:\n\n' +
                '💡 Фишка: ТОП-10 идей попадают в закреплённый пост → больше видимость → быстрее в разработку!',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '📢 Бесплатно (с 0 голосов, медленный рост)', callback_data: 'publish_free' }
                            ],
                            [
                                { text: '🔥 ПРИОРИТЕТ за 1⭐ (+10 голосов = ТОП!)', callback_data: 'publish_priority' }
                            ],
                            [
                                { text: '⭐ Купить звёзды (если нет)', url: 'https://gaming-goods.ru/t/telegram-stars?product=966299&ref=20' }
                            ]
                        ]
                    }
                }
            );
        }
        
    } catch (error) {
        console.error('❌ Error processing message:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
});

// Функция публикации идеи в канал
async function publishToChannel(ctx, userId, messageText, userName, userUsername, initialVotes = 0, fullDescription = null) {
    console.log('📝 publishToChannel called:', { userId, messageText: messageText?.substring(0, 50), fullDesc: fullDescription?.substring(0, 50), userName, userUsername, initialVotes });
    
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
                request_text: messageText, // Краткая версия для канала
                full_description: fullDescription || messageText, // Полная версия для реализации
                title: messageText.substring(0, 100),
                description: messageText,
                request_type: 'feature',
                vote_count: initialVotes,
                has_priority: initialVotes >= 10, // Флаг приоритета
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
        const channelMessage = `${priorityBadge}🆕 <b>НОВАЯ ИДЕЯ ОТ СООБЩЕСТВА</b>

💡 ${messageText}

👤 Автор: ${userMention}
💰 Заработает: 25% от выручки если продукт дойдет до разработки и начнет продаваться

📊 Голосуй ЗА если хочешь видеть эту фичу!
ТОП-10 идей разрабатывает ИИ-команда БЕСПЛАТНО.

<i>🆔 ${requestId} • ${new Date().toLocaleString('ru-RU')}</i>`;
        
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
                            { text: '🔥 ПОДНЯТЬ В ТОП за 1⭐ (+10 голосов)', callback_data: `pay_priority_${requestId}` }
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
            console.log('Calling publishToChannel with:', { userId, text: draft.text, fullDesc: draft.fullDescription?.substring(0, 50), userName: draft.userName, userUsername: draft.userUsername });
            
            const requestId = await publishToChannel(
                ctx, 
                userId, 
                draft.text, 
                draft.userName, 
                draft.userUsername, 
                0,
                draft.fullDescription
            );
            console.log('Publication result:', requestId);
            
            if (requestId) {
                await ctx.editMessageText(
                    `✅ Опубликовано в @ai_requests!\n\n` +
                    `📊 ID: ${requestId} | 👍 Голосов: 0\n\n` +
                    `⚡ СОВЕТ: Набери 10+ голосов чтобы попасть в ТОП-лист!\n` +
                    `Или ускорь процесс за 1⭐ (+10 голосов) прямо в канале.\n\n` +
                    `💰 Когда разработают → ты получишь 25% от каждого клиента!`
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
                // Payload ограничен 128 байтами - храним только userId, остальное берём из draft
                await bot.telegram.sendInvoice(userId, {
                    title: '🔥 ТОП-приоритет для твоей идеи',
                    description: `✅ +10 голосов СРАЗУ\n✅ Попадание в ТОП-10 (закреплённый пост)\n✅ Шанс разработки ИИ-командой\n💰 Ты заработаешь 25% от каждого клиента!\n\n"${draft.text.substring(0, 80)}..."`,
                    payload: JSON.stringify({ 
                        action: 'publish_priority',
                        user_id: userId
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
            
            // Проверить есть ли приоритет (ФИКСИРОВАННЫЙ +10)
            const { data: currentRequest } = await supabase
                .from('requests')
                .select('has_priority')
                .eq('id', requestId)
                .single();
            
            // Приоритетный бонус = ФИКСИРОВАННЫЙ +10 если оплачен
            const priorityBonus = currentRequest?.has_priority ? 10 : 0;
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
                        { text: '🔥 ПОДНЯТЬ В ТОП за 1⭐ (+10 голосов)', callback_data: `pay_priority_${requestId}` }
                    ]
                ]
            };
            
            try {
                await bot.telegram.editMessageReplyMarkup(chatId, messageId, undefined, newKeyboard);
            } catch (editError) {
                // Игнорируем если кнопки не изменились (Telegram API особенность)
                if (!editError.message.includes('message is not modified')) {
                    console.log('⚠️ Cannot edit markup:', editError.message);
                }
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
        
        // Получить draft по userId (данные не в payload из-за лимита 128 байт)
        const draft = userDrafts.get(payload.user_id);
        if (!draft) {
            console.error('❌ Draft not found for user:', payload.user_id);
            await ctx.reply('❌ Ошибка: черновик не найден. Попробуй отправить идею заново.');
            return;
        }
        
        const requestId = await publishToChannel(
            ctx, 
            payload.user_id, 
            draft.text, 
            draft.userName,
            draft.userUsername, 
            10, // Сразу 10 голосов
            draft.fullDescription
        );
        
        if (requestId) {
            // Обновить payment с request_id
            await supabase
                .from('payments')
                .update({ feature_id: requestId.toString() })
                .eq('id', paymentData.id);
            
            await ctx.reply(
                `🎉 КРАСАВЧИК! Твоя идея в ТОПе!\n\n` +
                `🔥 Статус: ПРИОРИТЕТ (+10 голосов)\n` +
                `📊 ID: ${requestId}\n` +
                `📈 Позиция: Скорее всего в ТОП-10!\n\n` +
                `🚀 Что дальше:\n` +
                `✅ Следи за голосами в @ai_requests\n` +
                `✅ ТОП-идеи берём в разработку ПЕРВЫМИ\n` +
                `✅ Получишь прототип + 25% выручки от клиентов\n\n` +
                `💬 Поделись постом с друзьями → больше голосов → быстрее в разработку!`
            );
            
            userDrafts.delete(payload.user_id);
        }
        return;
    }
    
    // Обновить голоса в Supabase (+10 за клинический приоритет)
    if (payload.request_id) {
        const requestId = payload.request_id;
        
        // Получить текущее количество голосов и message_id
        const { data: currentRequest } = await supabase
            .from('requests')
            .select('vote_count, channel_message_id, channel_chat_id')
            .eq('id', requestId)
            .single();
        
        const newVoteCount = (currentRequest?.vote_count || 0) + 10;
        
        // Обновить vote_count И установить has_priority = true
        const { error } = await supabase
            .from('requests')
            .update({ 
                vote_count: newVoteCount,
                has_priority: true  // Установить флаг приоритета
            })
            .eq('id', requestId);
        
        if (error) {
            console.error('❌ Supabase update error:', error);
        } else {
            console.log(`✅ Request #${requestId} updated: +10 votes (now ${newVoteCount})`);
            
            // Обновить кнопки в канале
            if (currentRequest?.channel_message_id && currentRequest?.channel_chat_id) {
                try {
                    // Пересчитать downvotes из таблицы votes
                    const { data: voteStats } = await supabase
                        .from('votes')
                        .select('vote_type')
                        .eq('request_id', requestId);
                    
                    const downvotes = voteStats?.filter(v => v.vote_type === 'down').length || 0;
                    
                    const updatedKeyboard = {
                        inline_keyboard: [
                            [
                                { text: `👍 Голосов: ${newVoteCount}`, callback_data: `vote_up_${requestId}` },
                                { text: `👎 Против (${downvotes})`, callback_data: `vote_down_${requestId}` }
                            ],
                            [
                                { text: '⭐ Приоритет (1⭐)', callback_data: `pay_priority_${requestId}` }
                            ]
                        ]
                    };
                    
                    await bot.telegram.editMessageReplyMarkup(
                        currentRequest.channel_chat_id,
                        currentRequest.channel_message_id,
                        undefined,
                        updatedKeyboard
                    );
                    
                    console.log(`✅ Updated channel buttons for request #${requestId}: ${newVoteCount} votes`);
                } catch (editError) {
                    console.log('⚠️ Cannot edit channel markup:', editError.message);
                }
            }
            
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
