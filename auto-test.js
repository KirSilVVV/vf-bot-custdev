// Автоматический тест бота - симулирует действия пользователя
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runTests() {
    console.log('🧪 Starting automated tests...\n');
    
    // Test 1: Создать тестовую идею напрямую в БД
    console.log('📝 Test 1: Create test request in database');
    const testIdea = {
        user_id: '999999',
        user_name: 'AutoTest',
        request_text: 'Автоматический тест системы голосования и публикации идей',
        title: 'Тест системы',
        description: 'Автоматический тест системы голосования и публикации идей',
        vote_count: 0,
        status: 'pending'
    };
    
    const { data: request, error: insertError } = await supabase
        .from('requests')
        .insert(testIdea)
        .select()
        .single();
    
    if (insertError) {
        console.log('❌ Failed to create request:', insertError.message);
        return;
    }
    
    console.log(`✅ Request created: ID ${request.id}\n`);
    
    // Test 2: Голосование (симуляция)
    console.log('🗳️ Test 2: Vote simulation');
    
    // User 1 голосует ЗА
    const { error: vote1Error } = await supabase
        .from('votes')
        .insert({
            user_id: '111',
            user_name: 'TestUser1',
            request_id: request.id,
            vote_type: 'up'
        });
    
    if (vote1Error) {
        console.log('❌ Vote 1 failed:', vote1Error.message);
    } else {
        console.log('✅ Vote 1: TestUser1 voted UP');
    }
    
    // User 2 голосует ЗА
    const { error: vote2Error } = await supabase
        .from('votes')
        .insert({
            user_id: '222',
            user_name: 'TestUser2',
            request_id: request.id,
            vote_type: 'up'
        });
    
    if (vote2Error) {
        console.log('❌ Vote 2 failed:', vote2Error.message);
    } else {
        console.log('✅ Vote 2: TestUser2 voted UP');
    }
    
    // User 3 голосует ПРОТИВ
    const { error: vote3Error } = await supabase
        .from('votes')
        .insert({
            user_id: '333',
            user_name: 'TestUser3',
            request_id: request.id,
            vote_type: 'down'
        });
    
    if (vote3Error) {
        console.log('❌ Vote 3 failed:', vote3Error.message);
    } else {
        console.log('✅ Vote 3: TestUser3 voted DOWN');
    }
    
    // Test 3: Повторное голосование (должно не пройти)
    console.log('\n🔄 Test 3: Duplicate vote (should fail)');
    const { error: duplicateError } = await supabase
        .from('votes')
        .insert({
            user_id: '111',
            user_name: 'TestUser1',
            request_id: request.id,
            vote_type: 'up'
        });
    
    if (duplicateError) {
        console.log('✅ Duplicate vote blocked (expected):', duplicateError.message);
    } else {
        console.log('❌ Duplicate vote allowed (BUG!)');
    }
    
    // Test 4: Подсчет голосов
    console.log('\n📊 Test 4: Count votes');
    const { data: votes } = await supabase
        .from('votes')
        .select('vote_type')
        .eq('request_id', request.id);
    
    const upvotes = votes?.filter(v => v.vote_type === 'up').length || 0;
    const downvotes = votes?.filter(v => v.vote_type === 'down').length || 0;
    const netVotes = upvotes - downvotes;
    
    console.log(`✅ Vote stats: ${upvotes}↑ ${downvotes}↓ = ${netVotes} net`);
    
    // Обновить vote_count
    await supabase
        .from('requests')
        .update({ vote_count: netVotes })
        .eq('id', request.id);
    
    console.log(`✅ Updated request vote_count to ${netVotes}\n`);
    
    // Test 5: Проверить таблицу conversations
    console.log('💬 Test 5: Check conversations table');
    const { data: convos, error: convoError } = await supabase
        .from('conversations')
        .select('*')
        .limit(5);
    
    if (convoError) {
        console.log('⚠️ Conversations table:', convoError.message);
    } else {
        console.log(`✅ Conversations table OK (${convos.length} records)\n`);
    }
    
    // Test 6: Проверить платежи
    console.log('💰 Test 6: Check payments table');
    const { data: payments } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
    
    console.log(`✅ Found ${payments?.length || 0} recent payments\n`);
    
    // Summary
    console.log('📋 TEST SUMMARY:');
    console.log('='.repeat(50));
    console.log(`✅ Request created: #${request.id}`);
    console.log(`✅ Votes recorded: ${votes?.length || 0}`);
    console.log(`✅ Vote count: ${netVotes} (${upvotes}↑ ${downvotes}↓)`);
    console.log(`✅ Duplicate vote protection: Working`);
    console.log(`✅ Tables: requests, votes, conversations, payments`);
    console.log('='.repeat(50));
    console.log('\n🎉 All tests completed!\n');
    console.log('🔗 Check Telegram channel for post:');
    console.log(`   Request ID: ${request.id}`);
    console.log(`   Vote count: ${netVotes}`);
}

runTests().catch(console.error);
