import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// No hardcoded fallback project: if envs are missing, storage is disabled
// rather than silently pointing at some other Supabase project.
export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (!supabase) {
  console.warn('[Supabase] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) not set — file storage disabled');
}

export const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'excel-files';
