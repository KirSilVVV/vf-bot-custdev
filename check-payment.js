import { supabase } from './supabaseClient.js';

async function checkLastPayment() {
    console.log('🔍 Проверка последнего платежа в Supabase...\n');
    
    const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);
    
    if (error) {
        console.error('❌ Ошибка:', error.message);
        return;
    }
    
    if (data && data.length > 0) {
        console.log('✅ Последний платеж найден:');
        console.log(data[0]);
    } else {
        console.log('⚠️ Платежей не найдено');
    }
}

checkLastPayment();
