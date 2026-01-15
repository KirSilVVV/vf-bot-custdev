// Удалить ВСЕ сообщения из канала по диапазону ID
import 'dotenv/config';
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

async function deleteAllMessages() {
    console.log('🗑️  Удаляю все сообщения из канала...');
    console.log('⚠️  Это может занять несколько минут\n');
    
    let deleted = 0;
    let errors = 0;
    
    // Попробуем удалить последние 1000 сообщений
    // (обычно у тестового канала не больше)
    for (let messageId = 1; messageId <= 1000; messageId++) {
        try {
            await bot.telegram.deleteMessage(CHANNEL_ID, messageId);
            deleted++;
            if (deleted % 10 === 0) {
                console.log(`✅ Удалено: ${deleted} сообщений...`);
            }
        } catch (error) {
            errors++;
            // Игнорируем ошибки (сообщение не существует)
        }
        
        // Пауза чтобы не превысить rate limit Telegram
        if (messageId % 20 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    console.log(`\n✅ ГОТОВО!`);
    console.log(`📊 Удалено: ${deleted} сообщений`);
    console.log(`⚠️  Ошибок (сообщения не найдены): ${errors}`);
    
    process.exit(0);
}

deleteAllMessages();
