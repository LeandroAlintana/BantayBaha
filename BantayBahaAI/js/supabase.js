import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase-config.js';

const isConfigured = !SUPABASE_URL.startsWith('PASTE_') && !SUPABASE_PUBLISHABLE_KEY.startsWith('PASTE_');

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

export async function getReporterSession() {
  if (!supabase) throw new Error('Supabase is not configured yet. Add the Project URL and publishable key in js/supabase-config.js.');

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session) return session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.session;
}
