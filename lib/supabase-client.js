import { createClient } from "@supabase/supabase-js";

let _client = null;

export function getSupabaseClient(config) {
  if (_client) return _client;

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when STORAGE_BACKEND=supabase");
  }

  _client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return _client;
}
