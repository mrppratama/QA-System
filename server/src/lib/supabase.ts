import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://qgnhykmemphamepbrmmh.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'anon';

export const supabase = createClient(supabaseUrl, supabaseKey);

export const BUCKET_NAME = process.env.SUPABASE_STORAGE_BUCKET || 'excel-files';
