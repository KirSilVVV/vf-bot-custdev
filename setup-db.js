// Выполнить SQL скрипты в Supabase
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runSQL() {
    console.log('📊 Executing conversations.sql...');
    
    const conversationsSQL = fs.readFileSync('conversations.sql', 'utf8');
    const { error: err1 } = await supabase.rpc('exec_sql', { sql: conversationsSQL });
    
    if (err1) {
        // Try direct table creation
        const { error: err2 } = await supabase.from('conversations').select('id').limit(1);
        if (err2) {
            console.log('Creating conversations table manually...');
            // Supabase doesn't have exec_sql RPC by default, need to use REST API
            console.log('⚠️ Please run conversations.sql manually in Supabase Dashboard');
            console.log('   Dashboard → SQL Editor → Paste code → Run');
        } else {
            console.log('✅ conversations table already exists');
        }
    }
    
    console.log('\n🗳️ Executing votes.sql...');
    
    const votesSQL = fs.readFileSync('votes.sql', 'utf8');
    const { error: err3 } = await supabase.from('votes').select('id').limit(1);
    
    if (err3) {
        console.log('⚠️ Please run votes.sql manually in Supabase Dashboard');
        console.log('   Dashboard → SQL Editor → Paste code → Run');
    } else {
        console.log('✅ votes table already exists');
    }
    
    console.log('\n📋 Summary:');
    console.log('Go to: https://app.supabase.com/project/rohplqelrlwszotkmnir/sql/new');
    console.log('1. Copy conversations.sql content');
    console.log('2. Paste and click RUN');
    console.log('3. Copy votes.sql content');  
    console.log('4. Paste and click RUN');
    console.log('✅ Done!');
}

runSQL();
