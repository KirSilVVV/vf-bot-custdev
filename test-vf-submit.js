#!/usr/bin/env node
/**
 * Test script for POST /vf/submit endpoint
 * Usage: node test-vf-submit.js
 */

import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testVfSubmit() {
    try {
        console.log('📨 Testing POST /vf/submit endpoint...');
        console.log(`   API URL: ${API_URL}`);
        console.log('');

        const payload = {
            user_id: 'test-user-123',
            user_name: 'Test User',
            request_text: '✅ Test request from Node.js script\n\nThis is a test message to verify the /vf/submit endpoint works correctly.',
            request_type: 'text',
            metadata: {
                source: 'test-script',
                timestamp: new Date().toISOString(),
            },
        };

        console.log('📤 Sending payload:');
        console.log(JSON.stringify(payload, null, 2));
        console.log('');

        const response = await axios.post(
            `${API_URL}/vf/submit`,
            payload,
            {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                }
            }
        );

        if (response.data.ok) {
            console.log('✅ Request successful!');
            console.log(`   Request ID: ${response.data.request_id}`);
            console.log(`   Message ID: ${response.data.channel_message_id}`);
            console.log(`   Chat ID: ${response.data.channel_chat_id}`);
            process.exit(0);
        } else {
            console.error('❌ API returned error:');
            console.error(JSON.stringify(response.data, null, 2));
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error:');
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
        } else if (error.request) {
            console.error('   No response from server');
            console.error(`   Message: ${error.message}`);
        } else {
            console.error(`   ${error.message}`);
        }
        process.exit(1);
    }
}

testVfSubmit();
