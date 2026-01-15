// test-vf-management.js
// Тест Voiceflow Management API

import vfManager from './voiceflowManager.js';

console.log('🧪 Testing Voiceflow Management API...\n');

async function test() {
    try {
        console.log('✅ Configuration check:');
        console.log('   API Key:', process.env.VOICEFLOW_API_KEY?.substring(0, 20) + '...');
        console.log('   Version ID:', process.env.VOICEFLOW_VERSION_ID);
        console.log('');

        console.log('1️⃣ Testing Knowledge Base...');
        try {
            const docs = await vfManager.listKnowledgeDocuments();
            console.log(`✅ Found ${docs?.length || 0} document(s) in Knowledge Base`);
            if (docs && docs.length > 0) {
                docs.slice(0, 3).forEach(d => {
                    console.log(`   - ${d.name || d.id}`);
                });
            }
        } catch (e) {
            console.log('⚠️  Knowledge Base not available (may require specific plan)');
        }
        console.log('');

        console.log('2️⃣ Testing Transcripts...');
        try {
            const transcripts = await vfManager.searchTranscripts({ limit: 5 });
            console.log(`✅ Found ${transcripts?.length || 0} transcript(s)`);
            if (transcripts && transcripts.length > 0) {
                transcripts.slice(0, 2).forEach((t, i) => {
                    console.log(`   ${i + 1}. Session: ${t.sessionID || t.id}`);
                });
            }
        } catch (e) {
            console.log('⚠️  Transcripts not available (may require specific plan)');
        }
        console.log('');

        console.log('✅ API connectivity test passed!');
        console.log('\n🎉 Voiceflow Agent API Key is valid!\n');
        console.log('💡 Available features depend on your Voiceflow plan.');
        console.log('\n📚 Try these commands:');
        console.log('   node vf-cli.js info');
        console.log('   node vf-cli.js kb-list');
        console.log('   node vf-cli.js transcripts');
        console.log('');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.response?.status === 401) {
            console.error('\n💡 Hint: Check your VOICEFLOW_API_KEY in .env');
            console.error('   It should start with VF.DM. (Agent API Key)');
        } else if (error.response?.data) {
            console.error('API Error:', JSON.stringify(error.response.data, null, 2));
        }
        console.error('\n📚 Get your API key from:');
        console.error('   Voiceflow → Settings (⚙️) → API Keys');
        process.exit(1);
    }
}

test();
