#!/usr/bin/env node
/**
 * Test script to send a message to Telegram channel
 * Usage: node test-send-message.js
 * 
 * Make sure to set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID in .env first
 */

import 'dotenv/config';
import axios from 'axios';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

if (!TOKEN) {
    console.error('❌ Error: TELEGRAM_BOT_TOKEN not set in .env');
    process.exit(1);
}

if (!CHANNEL_ID) {
    console.error('❌ Error: TELEGRAM_CHANNEL_ID not set in .env');
    process.exit(1);
}

async function sendTestMessage() {
    try {
        console.log('📤 Sending test message to Telegram channel...');
        console.log(`   Token: ${TOKEN.substring(0, 10)}...`);
        console.log(`   Channel: ${CHANNEL_ID}`);
        console.log('');

        const response = await axios.post(
            `https://api.telegram.org/bot${TOKEN}/sendMessage`,
            {
                chat_id: CHANNEL_ID,
                text: '✅ Тест: бот успешно пишет в канал',
                parse_mode: 'HTML'
            },
            {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                }
            }
        );

        if (response.data.ok) {
            console.log('✅ Message sent successfully!');
            console.log(`   Message ID: ${response.data.result.message_id}`);
            console.log(`   Chat ID: ${response.data.result.chat.id}`);
            console.log(`   Date: ${new Date(response.data.result.date * 1000).toISOString()}`);
            process.exit(0);
        } else {
            console.error('❌ Telegram API returned error:');
            console.error(JSON.stringify(response.data, null, 2));
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error sending message:');
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
        } else if (error.request) {
            console.error('   No response from Telegram API');
            console.error(`   Request: ${error.message}`);
        } else {
            console.error(`   ${error.message}`);
        }
        process.exit(1);
    }
}

sendTestMessage();
