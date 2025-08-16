import { createClient } from "@supabase/supabase-js";

// 環境変数からURLとKeyを取得
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Supabaseクライアント作成
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
