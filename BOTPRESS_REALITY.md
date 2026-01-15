# ❌ Почему Botpress flow не импортируется

## Проблема

Botpress **не поддерживает импорт JSON workflows** напрямую как Voiceflow.

**В Botpress есть 2 способа создания:**

### 1️⃣ Через UI (Studio) - визуальный редактор
- Workflows → Create Workflow
- Drag & drop нод
- Настройка вручную (как в Voiceflow)

### 2️⃣ Через ADK (код на TypeScript)
- Agent Development Kit - CLI tool
- Code-based разработка
- TypeScript + hot reloading
- **Можно деплоить из терминала!**

---

## ✅ Правильный подход: ADK (code-based)

Это позволит:
- ✅ Создать бота из кода (не UI)
- ✅ Деплоить через CLI/API
- ✅ Version control (Git)
- ✅ CI/CD integration

---

## 🚀 Setup ADK для Customer Development Bot

### Шаг 1: Установить Botpress CLI

```powershell
npm install -g @botpress/cli
```

### Шаг 2: Логин в Botpress

```powershell
bp login
```

Откроется браузер → войти в Botpress аккаунт

### Шаг 3: Создать проект через ADK

```powershell
cd "C:\Users\User\Downloads\telegram chat bot"
bp init customer-dev-bot-adk
```

Выбрать:
- Template: **Blank Agent** (пустой шаблон)
- Language: **TypeScript**

### Шаг 4: Структура проекта

```
customer-dev-bot-adk/
├── src/
│   ├── index.ts           # Главный файл бота
│   ├── workflows/         # Workflows (флоу)
│   │   ├── main.ts
│   │   ├── welcome.ts
│   │   ├── problem.ts
│   │   └── draft.ts
│   ├── actions/           # Custom actions
│   │   └── saveToSupabase.ts
│   └── types.ts           # TypeScript types
├── botpress.config.ts     # Конфигурация бота
├── package.json
└── tsconfig.json
```

### Шаг 5: Разработка локально

```powershell
cd customer-dev-bot-adk
bp dev
```

Запустится dev server с hot reloading на `http://localhost:3000`

### Шаг 6: Deploy на Botpress Cloud

```powershell
bp deploy
```

---

## 📋 Альтернатива: Ручная настройка в UI (быстрее)

Если ADK сложно - можешь создать Workflows вручную в Botpress Studio:

### Время: 40 минут

1. **Создать бота в Botpress Cloud**
   - https://app.botpress.cloud
   - Create New Bot

2. **Добавить Workflows** (8 штук):
   - Main → Welcome
   - Welcome → Problem Collection
   - Problem Collection → Deep Dive
   - Deep Dive → Draft Creation
   - Draft Creation → Save to Supabase
   - Save to Supabase → Payment Offer
   - Payment Offer → Final Thanks
   - Welcome (no_medical) → Soft Exit

3. **Настроить AI Nodes** с промптами из OPTIMIZED_PROMPTS_V2.md

4. **Execute Code ноды** для:
   - Установка user_telegram_id
   - Сохранение в Supabase
   - Обработка платежей

5. **Подключить Telegram Integration**

6. **Publish**

---

## 🤔 Сравнение подходов

| Подход | Время | Сложность | Программное управление |
|--------|-------|-----------|------------------------|
| **Voiceflow (UI)** | 60 мин | 🟡 Средняя | ❌ Нет |
| **Botpress (UI)** | 40 мин | 🟡 Средняя | ❌ Нет |
| **Botpress (ADK)** | 90 мин | 🔴 Высокая | ✅ Да (CLI/API) |

---

## 💡 Рекомендация

**Для быстрого тестирования:**
→ Создай в **Botpress UI** (40 минут) - следуя инструкции ниже

**Для production с версионированием:**
→ Используй **Botpress ADK** - я создам полный TypeScript проект

**Для минимальных усилий:**
→ Доделай **Voiceflow вручную** (30 минут) по VOICEFLOW_SETUP_GUIDE.md

---

## Какой подход выбираешь?

**A)** Botpress ADK (TypeScript, CLI deploy) - я создам проект  
**B)** Botpress UI (быстро, вручную) - дам пошаговую инструкцию  
**C)** Voiceflow UI (уже есть проект cust_dev_7) - доделать за 30 мин  

Напиши букву A, B или C.
