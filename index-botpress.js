// index-botpress.js
// Telegram Bot → Botpress API (вместо Voiceflow)
// Использует существующий бот с Supabase + Telegram Stars payments

import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import axios from 'axios';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

// Botpress API credentials
const BOTPRESS_BOT_ID = 'af3598e4-87b5-410a-83ba-98188fd45e25';
const BOTPRESS_WORKSPACE_ID = 'wkspace_01KEZ18RBPRPA7K2V786DJVNBW';
const BOTPRESS_API_KEY = process.env.BOTPRESS_API_KEY || 'bp_bak_mOcOmZ06_bCWCYxOPxlqh2O8drVnD1rSzh8A';

// Validate
if (!TELEGRAM_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !TELEGRAM_CHANNEL_ID || !BOTPRESS_API_KEY) {
    console.error('❌ Missing environment variables. Need:');
    console.error('   - TELEGRAM_BOT_TOKEN');
    console.error('   - SUPABASE_URL');
    console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    console.error('   - TELEGRAM_CHANNEL_ID');
    console.error('   - BOTPRESS_API_KEY');
    process.exit(1);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Botpress Client
const botpressClient = axios.create({
    baseURL: `https://api.botpress.cloud/v1`,
    headers: {
        'Authorization': `Bearer ${BOTPRESS_API_KEY}`,
        'Content-Type': 'application/json',
        'x-bot-id': BOTPRESS_BOT_ID,
    },
});

// Функция отправки сообщения в Botpress через Webchat API
async function sendToBotpress(userId, messageText) {
    try {
        // Использовать Webchat API endpoint
        const webhookUrl = `https://chat.botpress.cloud/${BOTPRESS_BOT_ID}/conversations/${userId}/messages`;
        
        const response = await axios.post(
            webhookUrl,
            {
                type: 'text',
                text: messageText,
                userId: userId.toString(),
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-bot-id': BOTPRESS_BOT_ID,
                }
            }
        );
        
        console.log('✅ Message sent to Botpress');
        
        // Подождать ответа
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Получить последние сообщения
        try {
            const messagesUrl = `https://chat.botpress.cloud/${BOTPRESS_BOT_ID}/conversations/${userId}/messages`;
            const messagesResponse = await axios.get(messagesUrl, {
                headers: {
                    'x-bot-id': BOTPRESS_BOT_ID,
                }
            });
            
            const messages = messagesResponse.data.messages || [];
            const botMessages = messages.filter(m => m.userId !== userId.toString());
            
            if (botMessages.length > 0) {
                const lastMessage = botMessages[botMessages.length - 1];
                return lastMessage.text || lastMessage.payload?.text || 'Получил твою идею!';
            }
        } catch (fetchError) {
            console.log('⚠️ Could not fetch bot response:', fetchError.message);
        }
        
        return 'Спасибо! Обрабатываю твою идею...';
        
    } catch (error) {
        console.error('❌ Botpress API error:', error.response?.data || error.message);
        return 'Произошла ошибка при обработке. Но я сохраню твою идею!';
    }
}

// Обработчик команды /start
bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name;
    
    console.log(`👋 /start from ${userId} (${userName})`);
    
    await ctx.reply(
        `Привет, ${userName}! 👋\n\n` +
        `Я бот для сбора идей и фич от сообщества.\n\n` +
        `💡 Просто отправь мне свою идею, и я:\n` +
        `• Запишу её в базу данных\n` +
        `• Опубликую в канале для голосования\n` +
        `• Дам возможность другим проголосовать\n\n` +
        `⭐ За 300 Telegram Stars можешь поднять свою идею в топ (+10 голосов сразу)!\n\n` +
        `📝 Напиши свою идею прямо сейчас:`
    );
});

// Обработчик текстовых сообщений
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || ctx.from.username || 'Anonymous';
    const messageText = ctx.message.text;
    
    console.log(`📩 Message from ${userId} (${userName}): ${messageText}`);
    
    try {
        // 1. Отправить в Botpress AI для обработки/улучшения идеи
        const botpressResponse = await sendToBotpress(userId, messageText);
        
        // 2. Ответить юзеру (Botpress может помочь уточнить идею)
        await ctx.reply(botpressResponse);
        
        // 3. Если Botpress подтвердил что это готовая фича - публикуем
        // (пока публикуем сразу, позже можно добавить команду /submit)
        if (messageText.length > 10) { // Минимальная валидация
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
                    vote_count: 0,
                    status: 'pending',
                })
                .select()
                .single();
            
            if (insertError) {
                console.error('❌ Supabase error:', insertError);
                return;
            }
            
            const requestId = requestData.id;
            console.log(`✅ Request saved to Supabase: ${requestId}`);
            
            // Опубликовать в канал с кнопками
            const channelMessage = `🆕 <b>Новый запрос на фичу</b>

💡 ${messageText}

👤 От: ${userName}
🆔 ID: ${requestId}

👍 Голосов: 0

<i>Отправлено ${new Date().toLocaleString('ru-RU')}</i>`;
            
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
                                { text: '⭐ Клинический приоритет (300 Stars)', callback_data: `pay_priority_${requestId}` }
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
            
            // Уведомить о публикации
            await ctx.reply(
                `📢 Опубликовано в канале!\n\n` +
                `📊 ID: ${requestId}\n` +
                `⭐ Можешь поднять в топ за 300 Stars`
            );
        }
        
    } catch (error) {
        console.error('❌ Error processing message:', error);
        await ctx.reply('Произошла ошибка. Попробуйте позже.');
    }
});

// Обработчик callback кнопок (голосование и платежи)
bot.on('callback_query', async (ctx) => {
    try {
        const callbackData = ctx.callbackQuery.data;
        const userId = ctx.from.id;
        const messageId = ctx.callbackQuery.message.message_id;
        const chatId = ctx.callbackQuery.message.chat.id;
        
        console.log(`🔘 Callback from ${userId}: ${callbackData}`);
        
        // Парсинг callback_data
        const [action, type, requestId] = callbackData.split('_');
        
        if (action === 'vote') {
            // Голосование
            const isUpvote = type === 'up';
            const voteChange = isUpvote ? 1 : -1;
            
            // Обновить счетчик в Supabase
            const { data: currentRequest } = await supabase
                .from('requests')
                .select('vote_count')
                .eq('id', requestId)
                .single();
            
            const newVoteCount = (currentRequest?.vote_count || 0) + voteChange;
            
            await supabase
                .from('requests')
                .update({ vote_count: newVoteCount })
                .eq('id', requestId);
            
            console.log(`✅ Vote updated: ${currentRequest?.vote_count} → ${newVoteCount}`);
            
            // Обновить кнопки в канале
            const newKeyboard = {
                inline_keyboard: [
                    [
                        { text: `👍 За (${newVoteCount})`, callback_data: `vote_up_${requestId}` },
                        { text: `👎 Против (0)`, callback_data: `vote_down_${requestId}` }
                    ],
                    [
                        { text: '⭐ Клинический приоритет (300 Stars)', callback_data: `pay_priority_${requestId}` }
                    ]
                ]
            };
            
            try {
                // Редактировать сообщение в канале напрямую
                await bot.telegram.editMessageReplyMarkup(
                    chatId,
                    messageId,
                    undefined,
                    newKeyboard
                );
            } catch (editError) {
                console.log('⚠️ Cannot edit channel message markup:', editError.message);
            }
            
            // Ответить пользователю
            await ctx.answerCbQuery(`${isUpvote ? '👍' : '👎'} Голос учтен! Всего: ${newVoteCount}`);
            
        } else if (action === 'pay' && type === 'priority') {
            // Платеж через Telegram Stars
            console.log(`💰 Payment request for feature #${requestId}`);
            
            try {
                // Отправить инвойс пользователю в ЛС
                await bot.telegram.sendInvoice(
                    userId,
                    'Клинический приоритет',
                    `Поднять фичу #${requestId} в приоритет и получить +10 голосов сразу`,
                    JSON.stringify({ request_id: requestId }),
                    '', // provider_token не нужен для Stars
                    'XTR',
                    [{ label: 'Клинический приоритет', amount: 300 }]
                );
                
                await ctx.answerCbQuery('💳 Инвойс отправлен в личные сообщения!');
            } catch (invoiceError) {
                console.error('❌ Invoice error:', invoiceError.message);
                await ctx.answerCbQuery('⚠️ Сначала начните диалог с ботом в ЛС: /start');
            }
        }
    } catch (error) {
        console.error('❌ Callback error:', error.message);
        try {
            await ctx.answerCbQuery('⚠️ Произошла ошибка. Попробуйте позже.');
        } catch (e) {
            console.error('❌ Cannot answer callback:', e.message);
        }
    }
});

// Обработчик successful_payment (Telegram Stars)
bot.on('successful_payment', async (ctx) => {
    const payment = ctx.message.successful_payment;
    const userId = ctx.from.id;
    const payload = JSON.parse(payment.invoice_payload);
    
    console.log(`✅ Payment received from ${userId}:`, payload);
    
    // Обновить Supabase
    if (payload.request_id) {
        const { error } = await supabase
            .from('requests')
            .update({
                payment_status: 'paid',
                votes: 10, // +10 голосов за оплату
            })
            .eq('id', payload.request_id);
        
        if (error) {
            console.error('❌ Supabase update error:', error);
        } else {
            console.log('✅ Request updated in Supabase');
            
            // Отправить благодарность
            await ctx.reply(`Спасибо за поддержку! 🙏⭐\n\nТвоя идея получила клинический приоритет и **+10 голосов** сразу!\n\n📊 Следи за каналом для голосования:\n${TELEGRAM_CHANNEL_ID}`);
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
    const WEBHOOK_DOMAIN = process.env.RENDER_EXTERNAL_URL || `https://your-app.onrender.com`;
    bot.telegram.setWebhook(`${WEBHOOK_DOMAIN}/telegram-webhook`);
    
    app.use(bot.webhookCallback('/telegram-webhook'));
    console.log(`✅ Telegram webhook: ${WEBHOOK_DOMAIN}/telegram-webhook`);
} else {
    // Development: polling mode
    bot.launch();
    console.log('✅ Telegram bot started (polling mode)');
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
