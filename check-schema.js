import { supabase } from './supabaseClient.js';

async function checkSchema() {
    console.log('🔍 Проверка структуры таблицы requests...\n');
    
    // Попытка получить одну запись
    const { data, error } = await supabase
        .from('requests')
        .select('*')
        .limit(1);
    
    if (error) {
        console.error('❌ Ошибка:', error.message);
        process.exit(1);
    }
    
    if (data && data.length > 0) {
        console.log('✅ Найдена запись. Доступные колонки:');
        console.log(Object.keys(data[0]));
        console.log('\n📄 Пример записи:');
        console.log(data[0]);
    } else {
        console.log('⚠️ Таблица пустая. Вставим тестовую запись...');
        
        const { data: newData, error: insertError } = await supabase
            .from('requests')
            .insert({
                user_id: 'test-schema-check',
                user_name: 'Test',
                request_text: 'Test request',
            })
            .select();
        
        if (insertError) {
            console.error('❌ Ошибка вставки:', insertError.message);
        } else {
            console.log('✅ Запись создана. Колонки:');
            console.log(Object.keys(newData[0]));
        }
    }
}

checkSchema();
