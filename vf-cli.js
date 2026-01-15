#!/usr/bin/env node
// vf-cli.js
// CLI для управления Voiceflow проектом

import vfManager from './voiceflowManager.js';
import fs from 'fs/promises';
import path from 'path';

const command = process.argv[2];
const args = process.argv.slice(3);

const commands = {
    // Project Export
    'export': async () => {
        console.log('📦 Exporting project (.vfr format)...\n');
        const project = await vfManager.exportProject(true);
        console.log(`Project: ${project.project?.name}`);
        console.log(`Platform: ${project.project?.platform}`);
        console.log(`Version: ${project.version?.name}`);
        console.log(`\n💡 To save JSON: node vf-cli.js export > project.json`);
    },

    'export-full': async () => {
        console.log('📦 Exporting full project (.vf format)...\n');
        const project = await vfManager.exportProject(false);
        console.log(`Project: ${project.project?.name}`);
        console.log(`Diagrams: ${Object.keys(project.diagrams || {}).length}`);
        console.log(`\n💡 To save JSON: node vf-cli.js export-full > project-full.json`);
    },

    'set-var': async () => {
        const [userId, key, ...valueParts] = args;
        const value = valueParts.join(' ');
        if (!userId || !key || !value) {
            console.error('❌ Usage: node vf-cli.js set-var <userId> <key> <value>');
            console.error('   Example: node vf-cli.js set-var 123456 system_prompt "You are helpful"');
            process.exit(1);
        }
        await vfManager.setUserVariables(userId, { [key]: value });
        console.log(`✅ Set ${key} = "${value}" for user ${userId}`);
    },

    // Knowledge Base
    'kb-list': async () => {
        console.log('📚 Getting Knowledge Base documents...\n');
        const docs = await vfManager.listKnowledgeDocuments();
        if (!docs || docs.length === 0) {
            console.log('No documents found');
            return;
        }
        docs.forEach(d => {
            console.log(`- ${d.name || d.id}`);
            console.log(`  Status: ${d.status || 'unknown'}`);
        });
    },

    'kb-query': async () => {
        const question = args.join(' ');
        if (!question) {
            console.error('❌ Usage: node vf-cli.js kb-query <your question>');
            return;
        }
        console.log(`🔍 Querying: "${question}"\n`);
        const result = await vfManager.queryKnowledgeBase(question);
        console.log('Answer:', result.answer || result);
    },

    // Analytics
    'analytics': async () => {
        const days = parseInt(args[0]) || 7;
        const endTime = Date.now();
        const startTime = endTime - (days * 24 * 60 * 60 * 1000);
        
        console.log(`📊 Getting analytics for last ${days} days...\n`);
        const data = await vfManager.getAnalytics(startTime, endTime);
        console.log(JSON.stringify(data, null, 2));
    },

    'transcripts': async () => {
        const limit = parseInt(args[0]) || 10;
        console.log(`💬 Getting last ${limit} transcripts...\n`);
        const transcripts = await vfManager.searchTranscripts({ limit });
        console.log(`Found ${transcripts.length} transcript(s)`);
        transcripts.forEach((t, i) => {
            console.log(`\n${i + 1}. Session: ${t.sessionID}`);
            console.log(`   Time: ${new Date(t.timestamp).toLocaleString()}`);
        });
    },

    // Project info
    'info': async () => {
        console.log('📊 Project Info:\n');
        console.log('API Key:', process.env.VOICEFLOW_API_KEY?.substring(0, 20) + '...');
        console.log('Version ID:', process.env.VOICEFLOW_VERSION_ID);
        console.log('\n✅ Using Agent API Key for all operations');
    },

    'help': () => {
        console.log(`
🎯 Voiceflow API CLI

📋 Available commands:

  Project Management:
    export                       - Export project (.vfr compact format)
    export-full                  - Export full project (.vf with all details)
    set-var <userId> <key> <val> - Set variable for user (for dynamic prompts)

  Knowledge Base:
    kb-list                      - List all documents
    kb-query <question>          - Query knowledge base
    
  Analytics & Transcripts:
    analytics [days]             - Get usage analytics (default: 7 days)
    transcripts [limit]          - Get recent transcripts (default: 10)
    
  Project Info:
    info                         - Show project configuration
    
  Help:
    help                         - Show this help

📝 Examples:
    node vf-cli.js info
    node vf-cli.js export > project.json
    node vf-cli.js set-var 123456 system_prompt "You are helpful AI"
    node vf-cli.js kb-list
    node vf-cli.js kb-query "Как создать продукт?"
    node vf-cli.js analytics 30
    node vf-cli.js transcripts 20

💡 Dynamic Prompts:
    In Voiceflow, use {system_prompt} variable in AI blocks
    Then change it per user: set-var <userId> system_prompt "New prompt"
        `);
    }
};

// Main execution
async function main() {
    if (!command || !commands[command]) {
        console.error('❌ Unknown command:', command || '(none)');
        console.log('\n💡 Run: node vf-cli.js help\n');
        process.exit(1);
    }

    try {
        await commands[command]();
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response?.data) {
            console.error('API Error:', error.response.data);
        }
        process.exit(1);
    }
}

main();
