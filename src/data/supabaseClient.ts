import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from './supabaseUrl';

export const supabase = createClient(
  normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL),
  import.meta.env.VITE_SUPABASE_ANON_KEY.trim(),
);
