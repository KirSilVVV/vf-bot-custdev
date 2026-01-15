// Скрипт для создания закрепленного поста с топ-идеями
// Обновляется автоматически при изменении голосов

import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

async function updateTopIdeasPost() {
    try {
        console.log('📊 Получаю топ-идеи из базы...');
        
        // Получить топ-10 идей по количеству голосов
        const { data: topRequests, error } = await supabase
            .from('requests')
            .select('id, request_text, vote_count, user_name, channel_message_id')
            .order('vote_count', { ascending: false })
            .limit(10);
        
        if (error) {
            console.error('❌ Ошибка получения данных:', error);
            return;
        }
        
        if (!topRequests || topRequests.length === 0) {
            console.log('📭 Нет идей для отображения');
            return;
        }
        
        // Сформировать текст топа
        let topMessage = `🏆 <b>ТОП ИДЕЙ ПО ГОЛОСАМ</b>\n\n`;
        
        topRequests.forEach((req, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const votes = req.vote_count || 0;
            const text = req.request_text?.substring(0, 80) || 'Без описания';
            
            topMessage += `${medal} <b>${votes} голосов</b>\n`;
            topMessage += `   ${text}...\n`;
            topMessage += `   <a href="https://t.me/ai_requests/${req.channel_message_id}">Перейти →</a>\n\n`;
        });
        
        topMessage += `\n<i>Обновлено: ${new Date().toLocaleString('ru-RU')}</i>`;
        
        // Проверить есть ли уже закрепленное сообщение
        const { data: pinnedData } = await supabase
            .from('system_messages')
            .select('message_id')
            .eq('type', 'top_ideas')
            .single();
        
        if (pinnedData?.message_id) {
            // Обновить существующее
            console.log('📝 Обновляю существующий топ...');
            try {
                await bot.telegram.editMessageText(
                    CHANNEL_ID,
                    pinnedData.message_id,
                    undefined,
                    topMessage,
                    { parse_mode: 'HTML', disable_web_page_preview: true }
                );
                console.log('✅ Топ обновлён');
            } catch (editError) {
                console.error('⚠️ Не удалось обновить, создаю новый:', editError.message);
                // Создать новый если не удалось обновить
                const newMsg = await bot.telegram.sendMessage(CHANNEL_ID, topMessage, { 
                    parse_mode: 'HTML',
                    disable_web_page_preview: true 
                });
                
                await bot.telegram.pinChatMessage(CHANNEL_ID, newMsg.message_id);
                
                // Обновить в базе
                await supabase
                    .from('system_messages')
                    .upsert({ type: 'top_ideas', message_id: newMsg.message_id });
                
                console.log('✅ Создан новый закрепленный топ');
            }
        } else {
            // Создать новое закрепленное сообщение
            console.log('📌 Создаю новый закрепленный топ...');
            const newMsg = await bot.telegram.sendMessage(CHANNEL_ID, topMessage, { 
                parse_mode: 'HTML',
                disable_web_page_preview: true 
            });
            
            await bot.telegram.pinChatMessage(CHANNEL_ID, newMsg.message_id);
            
            // Сохранить в базу
            await supabase
                .from('system_messages')
                .insert({ type: 'top_ideas', message_id: newMsg.message_id });
            
            console.log('✅ Топ создан и закреплен');
        }
        
    } catch (error) {
        console.error('❌ Ошибка:', error);
    } finally {
        process.exit(0);
    }
}

// Создать таблицу system_messages если не существует
async function ensureSystemMessagesTable() {
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS system_messages (
            id SERIAL PRIMARY KEY,
            type TEXT UNIQUE NOT NULL,
            message_id BIGINT NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
    `;
    
    console.log('📝 Создаю таблицу system_messages если не существует...');
    // Эту команду нужно выполнить в Supabase SQL Editor
    console.log('⚠️  Выполните в Supabase SQL Editor:\n', createTableSQL);
}

// ensureSystemMessagesTable();
updateTopIdeasPost();
