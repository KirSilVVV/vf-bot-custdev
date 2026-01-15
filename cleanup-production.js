// Утилита для очистки канала и базы данных перед продакшеном
// Удаляет все тестовые посты из канала и requests из Supabase

import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { createClient } from '@supabase/supabase-js';
import readline from 'readline';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

// Интерактивное подтверждение
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function cleanupChannel() {
    console.log('\n⚠️  ОЧИСТКА КАНАЛА И БАЗЫ ДАННЫХ ⚠️\n');
    console.log('Это действие:');
    console.log('1. Удалит ВСЕ посты из канала @ai_requests');
    console.log('2. Удалит ВСЕ записи из таблиц: requests, votes, payments, conversations');
    console.log('3. Действие НЕОБРАТИМО!\n');
    
    const confirm1 = await question('Вы уверены? Введите "ДА" для продолжения: ');
    
    if (confirm1.trim() !== 'ДА') {
        console.log('❌ Отменено пользователем');
        rl.close();
        process.exit(0);
    }
    
    const confirm2 = await question('Последнее предупреждение! Введите "УДАЛИТЬ ВСЁ" для подтверждения: ');
    
    if (confirm2.trim() !== 'УДАЛИТЬ ВСЁ') {
        console.log('❌ Отменено пользователем');
        rl.close();
        process.exit(0);
    }
    
    console.log('\n🗑️  Начинаю очистку...\n');
    
    try {
        // 1. Получить все requests для удаления сообщений из канала
        console.log('📊 Получаю список постов из базы...');
        const { data: requests, error: fetchError } = await supabase
            .from('requests')
            .select('id, channel_message_id, channel_chat_id')
            .order('id', { ascending: true });
        
        if (fetchError) {
            console.error('❌ Ошибка получения данных:', fetchError);
            rl.close();
            process.exit(1);
        }
        
        console.log(`✅ Найдено ${requests?.length || 0} постов\n`);
        
        // 2. Удалить сообщения из канала
        if (requests && requests.length > 0) {
            console.log('🗑️  Удаляю сообщения из канала...');
            let deletedCount = 0;
            let errorCount = 0;
            
            for (const req of requests) {
                if (req.channel_message_id && req.channel_chat_id) {
                    try {
                        await bot.telegram.deleteMessage(req.channel_chat_id, req.channel_message_id);
                        deletedCount++;
                        console.log(`✅ Удалено сообщение #${req.id} (msg: ${req.channel_message_id})`);
                        
                        // Пауза чтобы не словить rate limit
                        await new Promise(resolve => setTimeout(resolve, 100));
                    } catch (err) {
                        errorCount++;
                        console.log(`⚠️  Не удалось удалить сообщение #${req.id}: ${err.message}`);
                    }
                }
            }
            
            console.log(`\n📊 Удалено из канала: ${deletedCount} сообщений (ошибок: ${errorCount})\n`);
        }
        
        // 3. Очистить таблицы в Supabase
        console.log('🗑️  Очищаю таблицы Supabase...\n');
        
        // Удаляем в правильном порядке (сначала зависимые таблицы)
        const tables = [
            'votes',          // Зависит от requests
            'payments',       // Зависит от requests
            'conversations',  // Независимая
            'requests'        // Главная таблица
        ];
        
        for (const table of tables) {
            try {
                const { error: deleteError, count } = await supabase
                    .from(table)
                    .delete()
                    .neq('id', 0); // Удаляем все записи
                
                if (deleteError) {
                    console.error(`❌ Ошибка удаления из ${table}:`, deleteError);
                } else {
                    console.log(`✅ Таблица ${table} очищена`);
                }
            } catch (err) {
                console.error(`❌ Ошибка при очистке ${table}:`, err.message);
            }
        }
        
        console.log('\n✅ ОЧИСТКА ЗАВЕРШЕНА!');
        console.log('\n📢 Канал и база данных готовы к продакшену');
        console.log('💡 Теперь можно запускать бота с чистого листа\n');
        
    } catch (error) {
        console.error('\n❌ Критическая ошибка:', error);
    } finally {
        rl.close();
        process.exit(0);
    }
}

cleanupChannel();
