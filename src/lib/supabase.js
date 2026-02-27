import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const SUPABASE_URL = "https://xhjwxejxumodccdimpga.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhoand4ZWp4dW1vZGNjZGltcGdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNDMxOTIsImV4cCI6MjA3NDkxOTE5Mn0.JuhsQ16Jky34db7lwRmWXDjJkKFFO2sJBnBKJyq_2MY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});



