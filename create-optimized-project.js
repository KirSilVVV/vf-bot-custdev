/**
 * Создание оптимизированного Voiceflow проекта через Management API
 * 
 * ВАЖНО: Voiceflow Management API имеет ограничения:
 * - Можно создать проект
 * - Можно обновить название/настройки
 * - НО нельзя программно создать агентов через публичный API
 * 
 * Решение: Этот скрипт создаст новый проект и выведет инструкции
 */

const axios = require('axios');
require('dotenv').config();

const VF_API_KEY = process.env.VOICEFLOW_API_KEY;
const WORKSPACE_ID = 'peEq9W4bED'; // из project-full.json

async function createOptimizedProject() {
    try {
        console.log('🚀 Создание нового Voiceflow проекта...\n');

        // 1. Создать новый проект
        const createResponse = await axios.post(
            'https://api.voiceflow.com/v2/projects',
            {
                name: 'Customer Development Bot v2',
                teamID: WORKSPACE_ID,
                type: 'chat',
                platform: 'webchat',
                members: []
            },
            {
                headers: {
                    'Authorization': VF_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        const newProject = createResponse.data;
        console.log('✅ Проект создан!');
        console.log('Project ID:', newProject._id);
        console.log('Dev Version ID:', newProject.devVersion);
        console.log('');

        // 2. Получить API ключи нового проекта
        console.log('📋 Следующие шаги:\n');
        console.log('1. Открой Voiceflow: https://creator.voiceflow.com/project/' + newProject._id);
        console.log('2. Настрой агентов вручную по инструкции в VOICEFLOW_SETUP_GUIDE.md');
        console.log('');
        console.log('3. Получи новые API ключи:');
        console.log('   - Открой Project Settings (⚙️)');
        console.log('   - Перейди в API Keys');
        console.log('   - Create New Key');
        console.log('   - Скопируй API Key и Version ID');
        console.log('');
        console.log('4. Обнови .env:');
        console.log('   VOICEFLOW_API_KEY=' + newProject._id + '_xxx (получишь в шаге 3)');
        console.log('   VOICEFLOW_VERSION_ID=' + newProject.devVersion);
        console.log('');

        return newProject;

    } catch (error) {
        console.error('❌ Ошибка при создании проекта:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
        }
        throw error;
    }
}

// Запуск
createOptimizedProject()
    .then(() => {
        console.log('\n✅ Готово! Следуй инструкциям выше.');
    })
    .catch((err) => {
        console.error('\n❌ Не удалось создать проект');
        process.exit(1);
    });
