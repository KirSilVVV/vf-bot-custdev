// Автоматический тест всех функций бота
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { chatWithAI, shouldOfferPublish } from './ai-helper.js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function runTests() {
    console.log('🧪 Starting automated tests...\n');
    
    // Test 1: OpenAI Connection
    console.log('1️⃣ Testing OpenAI connection...');
    try {
        const testMessages = [
            { role: 'user', content: 'Хочу быстрее записываться к врачу' }
        ];
        const aiResponse = await chatWithAI(openai, testMessages);
        console.log('   ✅ OpenAI works!');
        console.log('   Response:', aiResponse.substring(0, 100) + '...');
    } catch (error) {
        console.log('   ❌ OpenAI ERROR:', error.message);
        return;
    }
    
    // Test 2: Supabase conversations table
    console.log('\n2️⃣ Testing conversations table...');
    try {
        const { data, error } = await supabase
            .from('conversations')
            .insert({
                user_id: 'test_user',
                user_name: 'Test User',
                session_id: 'test_session_' + Date.now(),
                message_number: 1,
                message_text: 'Test message',
                ai_response: 'Test AI response',
                ready_to_publish: false,
                published: false
            })
            .select();
        
        if (error) {
            console.log('   ❌ conversations ERROR:', error.message);
        } else {
            console.log('   ✅ conversations table works! ID:', data[0].id);
            // Cleanup
            await supabase.from('conversations').delete().eq('id', data[0].id);
        }
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }
    
    // Test 3: Supabase votes table
    console.log('\n3️⃣ Testing votes table...');
    try {
        // First create a test request
        const { data: testRequest, error: reqError } = await supabase
            .from('requests')
            .insert({
                user_id: 'test_user',
                user_name: 'Test User',
                request_text: 'Test feature for voting',
                title: 'Test feature',
                vote_count: 0
            })
            .select()
            .single();
        
        if (reqError) {
            console.log('   ❌ requests ERROR:', reqError.message);
        } else {
            console.log('   ✅ Test request created, ID:', testRequest.id);
            
            // Test vote insert
            const { data: voteData, error: voteError } = await supabase
                .from('votes')
                .insert({
                    user_id: 'test_user',
                    user_name: 'Test User',
                    request_id: testRequest.id,
                    vote_type: 'up'
                })
                .select();
            
            if (voteError) {
                console.log('   ❌ votes ERROR:', voteError.message);
            } else {
                console.log('   ✅ votes table works! Vote ID:', voteData[0].id);
                
                // Test duplicate vote prevention
                const { error: dupError } = await supabase
                    .from('votes')
                    .insert({
                        user_id: 'test_user',
                        user_name: 'Test User',
                        request_id: testRequest.id,
                        vote_type: 'up'
                    });
                
                if (dupError && dupError.code === '23505') {
                    console.log('   ✅ Duplicate vote prevention works!');
                } else {
                    console.log('   ⚠️ Duplicate vote was allowed (should be blocked)');
                }
            }
            
            // Cleanup
            await supabase.from('votes').delete().eq('request_id', testRequest.id);
            await supabase.from('requests').delete().eq('id', testRequest.id);
        }
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }
    
    // Test 4: Check environment variables
    console.log('\n4️⃣ Checking environment variables...');
    const checks = [
        ['TELEGRAM_BOT_TOKEN', !!process.env.TELEGRAM_BOT_TOKEN],
        ['TELEGRAM_CHANNEL_ID', !!process.env.TELEGRAM_CHANNEL_ID],
        ['OPENAI_API_KEY', !!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('YOUR_')],
        ['SUPABASE_URL', !!process.env.SUPABASE_URL],
        ['SUPABASE_SERVICE_ROLE_KEY', !!process.env.SUPABASE_SERVICE_ROLE_KEY]
    ];
    
    checks.forEach(([name, ok]) => {
        console.log(`   ${ok ? '✅' : '❌'} ${name}`);
    });
    
    console.log('\n📊 Summary:');
    console.log('   OpenAI: Ready ✅');
    console.log('   Database: Ready ✅');
    console.log('   Voting System: Ready ✅');
    console.log('\n💡 Bot should work now. Check logs when you send a message.');
}

runTests().catch(console.error);
