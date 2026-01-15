// Удалить webhook для тестирования в development режиме
import 'dotenv/config';
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

async function deleteWebhook() {
    try {
        console.log('🗑️ Deleting webhook...');
        const result = await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log('✅ Webhook deleted:', result);
        
        // Проверить статус
        const info = await bot.telegram.getWebhookInfo();
        console.log('📊 Current webhook:', info);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

deleteWebhook();
