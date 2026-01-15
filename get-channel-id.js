import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

async function getChannelId() {
    try {
        // Попробуем получить информацию о канале @ai_requests
        const chat = await bot.telegram.getChat('@ai_requests');
        console.log('✅ Channel found:');
        console.log('ID:', chat.id);
        console.log('Type:', chat.type);
        console.log('Title:', chat.title);
        console.log('Username:', chat.username);
        
        console.log('\n📝 Update your .env file:');
        console.log(`TELEGRAM_CHANNEL_ID=${chat.id}`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n💡 Make sure:');
        console.log('1. Bot is added to the channel as admin');
        console.log('2. Channel username is @ai_requests');
    }
    
    process.exit(0);
}

getChannelId();
