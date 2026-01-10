/**
 * Supabase Client
 * 
 * Initializes and exports a Supabase client configured with:
 * - SUPABASE_URL: Project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for server-side operations
 * 
 * Usage:
 *   import { supabase } from './supabaseClient.js';
 *   
 *   const { data, error } = await supabase
 *     .from('table_name')
 *     .select('*');
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Supabase configuration error:');
    if (!SUPABASE_URL) console.error('   - SUPABASE_URL is missing');
    if (!SUPABASE_SERVICE_ROLE_KEY) console.error('   - SUPABASE_SERVICE_ROLE_KEY is missing');
    throw new Error('Failed to initialize Supabase client: missing required environment variables');
}

/**
 * Supabase client instance
 * Configured with service role key for full admin access
 */
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    }
});

export { supabase };
