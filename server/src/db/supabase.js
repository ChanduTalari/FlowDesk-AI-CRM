import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// This client is backend-only. Never expose the service role key to the browser.
export const supabase = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    db: {
      schema: "public",
    },
  },
);
