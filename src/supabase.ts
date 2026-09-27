import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kkcyyhxdswenndcnwzvy.supabase.co";
const SUPABASE_KEY = "sb_publishable_BWO1Da3KflZvuJOosz28-w_n3V9fNGG";

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);