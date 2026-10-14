import type { PostgrestError } from "@supabase/supabase-js";

/** Table, function or column not created yet (portal migrations not applied). */
export function isSchemaMissing(error: Pick<PostgrestError, "code"> | null) {
  return !!error && ["PGRST202", "PGRST205", "PGRST204", "42P01", "42883", "42703"].includes(error.code);
}
