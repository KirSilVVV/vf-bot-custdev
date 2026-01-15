# Voiceflow Management API Setup

## 🎯 Что это дает

С Management API ты сможешь программно управлять проектом Voiceflow:

✅ **Менять промпты AI агентов** - обновлять инструкции для GPT
✅ **Редактировать переменные** - изменять настройки диалога
✅ **Искать в промптах** - находить и массово обновлять тексты
✅ **Бэкапы** - сохранять снимки проекта
✅ **Публикация** - деплоить изменения в production

---

## 🔑 Шаг 1: Получить Workspace API Key

1. Открой [Voiceflow](https://creator.voiceflow.com/)
2. Войди в свой workspace
3. Нажми на **Settings** (⚙️) в левом нижнем углу
4. Выбери **API Keys** или **Integrations**
5. Создай новый **Workspace API Key**
   - Name: `Management API`
   - Скопируй ключ (формат: `VF.WS.xxxxx...`)

---

## 🔍 Шаг 2: Найти Project ID

**Способ 1: Из URL**
- Открой проект в Voiceflow
- Смотри URL: `https://creator.voiceflow.com/project/PROJECT_ID/...`
- Скопируй `PROJECT_ID` (24-символьный hex: `63f7a8b9c0d1e2f3a4b5c6d7`)

**Способ 2: Через API**
```bash
curl -H "Authorization: VF.WS.YOUR_KEY" https://api.voiceflow.com/v2/workspaces
```

---

## ⚙️ Шаг 3: Настроить переменные окружения

Открой `.env` и заполни:

```dotenv
# Уже есть (Dialog API)
VOICEFLOW_API_KEY=VF.DM.695a753367592e3aab17a3cb.qMUM9KxItmXHgQOK
VOICEFLOW_VERSION_ID=695a7466287004b4a28c06db

# ДОБАВЬ ЭТИ (Management API)
VOICEFLOW_WORKSPACE_API_KEY=VF.WS.your_workspace_key_here
VOICEFLOW_PROJECT_ID=your_project_id_here
```

---

## 🚀 Использование CLI

### Базовые команды

```bash
# Информация о проекте
node vf-cli.js info

# Список всех версий
node vf-cli.js versions

# Список диаграм (flows)
node vf-cli.js diagrams

# Список переменных
node vf-cli.js variables
```

### Работа с AI промптами

```bash
# Найти все AI блоки в диаграмме
node vf-cli.js ai-blocks <DIAGRAM_ID>

# Обновить промпт
node vf-cli.js update-prompt <DIAGRAM_ID> <BLOCK_ID> "Новый промпт для AI"

# Поиск текста во всех промптах
node vf-cli.js search-prompts "product idea"
```

### Управление переменными

```bash
# Установить переменную
node vf-cli.js set-variable user_tier "premium"
```

### Бэкап и публикация

```bash
# Создать бэкап проекта
node vf-cli.js backup

# Опубликовать в production
node vf-cli.js publish
```

---

## 📝 Примеры использования

### Пример 1: Массовое обновление промптов

```javascript
import vfManager from './voiceflowManager.js';

// Найти все промпты с упоминанием "old instruction"
const results = await vfManager.searchInPrompts("old instruction");

// Обновить каждый
for (const diagram of results) {
    for (const block of diagram.blocks) {
        const newPrompt = block.prompt.replace(
            "old instruction", 
            "new instruction"
        );
        await vfManager.updateAIPrompt(
            diagram.diagramId, 
            block.id, 
            newPrompt
        );
    }
}
```

### Пример 2: Динамическая настройка AI

```javascript
import vfManager from './voiceflowManager.js';

// Получить текущие настройки
const variables = await vfManager.getVariables();

// Обновить системный промпт в зависимости от времени
const hour = new Date().getHours();
const tone = hour < 12 ? "энергичным" : "спокойным";

await vfManager.updateAIPrompt(
    "main-diagram-id",
    "welcome-block-id",
    `Будь ${tone} ассистентом. Помогай с продуктовыми идеями.`
);
```

### Пример 3: A/B тестирование промптов

```javascript
import vfManager from './voiceflowManager.js';

const promptVariants = [
    "Ты креативный помощник",
    "Ты строгий аналитик",
    "Ты дружелюбный наставник"
];

// Выбрать случайный вариант для пользователя
const randomPrompt = promptVariants[
    Math.floor(Math.random() * promptVariants.length)
];

await vfManager.updateAIPrompt(
    "diagram-id",
    "ai-block-id",
    randomPrompt
);
```

---

## 🛠️ Программное использование

### В Node.js скрипте

```javascript
import vfManager from './voiceflowManager.js';

async function main() {
    try {
        // Получить информацию о проекте
        const project = await vfManager.getProject();
        console.log('Project:', project.name);

        // Найти AI блоки
        const aiBlocks = await vfManager.findAIBlocks('diagram-id');
        
        // Обновить промпт
        await vfManager.updateAIPrompt(
            'diagram-id',
            'block-id',
            'Новый промпт'
        );

        // Создать бэкап
        const backup = await vfManager.backupProject();
        console.log('Backup created');

    } catch (error) {
        console.error('Error:', error.message);
    }
}

main();
```

### Интеграция с ботом

```javascript
// В index.js
import vfManager from './voiceflowManager.js';

// Команда для админов: изменить промпт
bot.command('set_prompt', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    
    const [diagramId, blockId, ...promptParts] = ctx.message.text.split(' ').slice(1);
    const newPrompt = promptParts.join(' ');
    
    await vfManager.updateAIPrompt(diagramId, blockId, newPrompt);
    await ctx.reply('✅ Промпт обновлен!');
});
```

---

## 📚 API Reference

### VoiceflowManager Methods

```javascript
// Project
getProject()
getVersions()
getVersion(versionId)

// Diagrams
getDiagrams(versionId)
getDiagram(diagramId, versionId)
updateDiagram(diagramId, diagramData, versionId)

// AI Prompts
updateAIPrompt(diagramId, blockId, newPrompt)
findAIBlocks(diagramId)
searchInPrompts(searchText)

// Variables
getVariables(versionId)
setVariable(variableName, defaultValue, versionId)

// Intents
getIntents(versionId)
updateIntent(intentName, utterances, versionId)

// Knowledge Base
getKnowledgeBase(versionId)
addKnowledgeDocument(documentData, versionId)

// Deployment
publishVersion(versionId)

// Utilities
backupProject()
```

---

## 🔒 Безопасность

⚠️ **ВАЖНО:**

1. **Никогда не коммить** `.env` с API ключами в git
2. **Ограничь доступ** к Workspace API key (только для доверенных)
3. **Тестируй изменения** на dev версии перед публикацией
4. **Делай бэкапы** перед массовыми изменениями
5. **Логируй все изменения** промптов для аудита

---

## 🐛 Troubleshooting

### Ошибка: "Unauthorized"
- Проверь `VOICEFLOW_WORKSPACE_API_KEY` в `.env`
- Убедись что ключ начинается с `VF.WS.`
- Проверь что ключ активен в Voiceflow Settings

### Ошибка: "Project not found"
- Проверь `VOICEFLOW_PROJECT_ID`
- Убедись что у ключа есть доступ к проекту

### Ошибка: "Block not found"
- Получи список AI блоков: `node vf-cli.js ai-blocks <DIAGRAM_ID>`
- Используй правильный `blockId` из списка

---

## 📖 Документация Voiceflow

- [Management API Reference](https://developer.voiceflow.com/reference)
- [Runtime API](https://developer.voiceflow.com/reference/dialog-manager)
- [Voiceflow Docs](https://www.voiceflow.com/docs)

---

✨ **Готово!** Теперь можешь программно управлять Voiceflow проектом.
