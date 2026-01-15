// download-project.js - Скачать проект Voiceflow без логов в консоли
import vfManager from './voiceflowManager.js';
import fs from 'fs/promises';

async function downloadProject() {
    try {
        // Скачиваем компактную версию (.vfr)
        console.error('📦 Downloading compact project (.vfr)...');
        const compact = await vfManager.exportProject(true);
        await fs.writeFile('project-compact.json', JSON.stringify(compact, null, 2));
        console.error('✅ Saved to project-compact.json');

        // Скачиваем полную версию (.vf)
        console.error('📦 Downloading full project (.vf)...');
        const full = await vfManager.exportProject(false);
        await fs.writeFile('project-full.json', JSON.stringify(full, null, 2));
        console.error('✅ Saved to project-full.json');

        console.error('\n📊 Project Info:');
        console.error(`   Name: ${compact.project?.name}`);
        console.error(`   Platform: ${compact.project?.platform}`);
        console.error(`   Version: ${compact.version?.name}`);
        console.error(`   Diagrams: ${Object.keys(full.diagrams || {}).length}`);
        console.error('');
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response?.data) {
            console.error('API Error:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

downloadProject();
