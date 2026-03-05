import { createSqliteStorage } from "./sqlite-storage.js";

export async function createStorage(config, db) {
  const backend = config.storageBackend;

  if (backend === "supabase") {
    const { getSupabaseClient } = await import("../supabase-client.js");
    const { createSupabaseStorage } = await import("./supabase-storage.js");
    const supabase = getSupabaseClient(config);
    console.log("[storage] using Supabase backend");
    return createSupabaseStorage(supabase);
  }

  console.log("[storage] using SQLite backend");
  return createSqliteStorage(db);
}
