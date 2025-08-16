import { supabase } from "./supabaseClient";

export async function createNewSession(title: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");

  const { error } = await supabase
    .from("sessions")
    .insert([{ title, user_id: user.id }]); // ログインユーザーのIDを必ず紐づける

  if (error) throw error;
}
