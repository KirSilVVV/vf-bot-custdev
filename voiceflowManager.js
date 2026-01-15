// voiceflowManager.js
// Voiceflow Management API - для управления проектом, промптами и алгоритмами

import axios from 'axios';
import 'dotenv/config';

// Используем тот же API ключ что и для Dialog API (VF.DM.xxx)
const VF_API_KEY = process.env.VOICEFLOW_API_KEY;
const VF_VERSION_ID = process.env.VOICEFLOW_VERSION_ID;

// Voiceflow использует один ключ для всех API
const DIALOG_BASE_URL = 'https://general-runtime.voiceflow.com';
const API_BASE_URL = 'https://api.voiceflow.com';

/**
 * Voiceflow Manager - работа с проектом через публичные API
 */
class VoiceflowManager {
    constructor(apiKey = VF_API_KEY, versionId = VF_VERSION_ID) {
        this.apiKey = apiKey;
        this.versionId = versionId;
        
        this.client = axios.create({
            baseURL: API_BASE_URL,
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
    }

    // ============================================
    // PROJECT EXPORT / IMPORT (READ-ONLY)
    // ============================================

    /**
     * Скачать проект (.vf или .vfr файл) - содержит все блоки, промпты, переменные
     * 
     * @param {boolean} prototype - true для .vfr (компактный), false для .vf (полный)
     * @param {string} versionAlias - 'development' или 'production' (опционально)
     * @returns {Promise<Object>} - проект в JSON формате
     */
    async exportProject(prototype = true, versionAlias = null) {
        try {
            const versionId = versionAlias || this.versionId;
            const response = await this.client.get(`/v2/versions/${versionId}/export`, {
                params: { prototype }
            });
            console.log(`✅ Exported project (${prototype ? '.vfr' : '.vf'}):`, response.data.project?.name);
            return response.data;
        } catch (error) {
            console.error('❌ Failed to export project:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Установить переменные для пользователя (для динамических промптов)
     * 
     * @param {string} userId - ID пользователя
     * @param {Object} variables - Объект с переменными { system_prompt: "...", ... }
     * @returns {Promise<Object>}
     */
    async setUserVariables(userId, variables) {
        try {
            const response = await axios.patch(
                `${DIALOG_BASE_URL}/state/${this.versionId}/user/${userId}/variables`,
                variables,
                {
                    headers: {
                        'Authorization': this.apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: 20000
                }
            );
            console.log(`✅ Set variables for user ${userId}:`, Object.keys(variables));
            return response.data;
        } catch (error) {
            console.error('❌ Failed to set variables:', error.response?.data || error.message);
            throw error;
        }
    }

    // ============================================
    // KNOWLEDGE BASE MANAGEMENT
    // ============================================

    /**
     * Upload document to Knowledge Base
     */
    async uploadKnowledgeDocument(file, url, name) {
        try {
            const formData = new FormData();
            if (file) formData.append('file', file);
            if (url) formData.append('url', url);
            if (name) formData.append('name', name);

            const response = await this.client.post('/v1/knowledge-base/docs/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to upload knowledge document: ${error.message}`);
        }
    }

    /**
     * Query Knowledge Base
     */
    async queryKnowledgeBase(question, settings = {}) {
        try {
            const response = await this.client.post('/knowledge-base/query', {
                question,
                ...settings
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to query knowledge base: ${error.message}`);
        }
    }

    /**
     * List Knowledge Base documents
     */
    async listKnowledgeDocuments() {
        try {
            const response = await this.client.get('/v1/knowledge-base/docs');
            return response.data;
        } catch (error) {
            throw new Error(`Failed to list knowledge documents: ${error.message}`);
        }
    }

    /**
     * Delete Knowledge Base document
     */
    async deleteKnowledgeDocument(documentId) {
        try {
            const response = await this.client.delete(`/v1/knowledge-base/docs/${documentId}`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to delete knowledge document: ${error.message}`);
        }
    }

    // ============================================
    // ANALYTICS & TRANSCRIPTS
    // ============================================

    /**
     * Get analytics/usage data
     */
    async getAnalytics(startTime, endTime) {
        try {
            const response = await this.client.post('/v1/analytics/query/usage', {
                startTime,
                endTime,
                versionID: this.versionId
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get analytics: ${error.message}`);
        }
    }

    /**
     * Search transcripts
     */
    async searchTranscripts(query = {}) {
        try {
            const response = await this.client.post('/v1/transcripts/search', {
                versionID: this.versionId,
                ...query
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to search transcripts: ${error.message}`);
        }
    }

    /**
     * Get specific transcript
     */
    async getTranscript(sessionId) {
        try {
            const response = await this.client.get(`/v1/transcripts/${sessionId}`);
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get transcript: ${error.message}`);
        }
    }
}

// Export singleton instance
export default new VoiceflowManager();

// Also export class for custom instances
export { VoiceflowManager };
