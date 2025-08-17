// src/app/auth/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function toEmail(idOrEmail: string) {
  const v = idOrEmail.trim();
  return v.includes("@") ? v : `${v}@example.com`; // IDだけならメールに正規化
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [idOrEmail, setIdOrEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async (): Promise<void> => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const email = toEmail(idOrEmail);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace("/");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg || "ログインに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleSignup = async (): Promise<void> => {
    setBusy(true);
    setErrorMsg(null);
    try {
      if (password.length < 6) {
        setErrorMsg("パスワードは6文字以上にしてください");
        setBusy(false);
        return;
      }
      const email = toEmail(idOrEmail);

      // 1) サインアップ
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: idOrEmail.trim() } }, // 任意のメタデータ
      });
      if (error) throw error;

      // 2) メール確認OFFなら session が返る
      if (data.session) {
        router.replace("/");
        return;
      }

      // 3) メール確認ONでも一旦ログインを試す（OFF環境ならそのまま成功）
      const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
      if (loginErr) {
        setErrorMsg("登録完了。メール確認が必要な設定です。確認後にログインしてください。");
        return;
      }
      router.replace("/");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg || "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-xl">
        <div className="flex mb-6 gap-2">
          <button
            className={`flex-1 py-2 rounded ${
              mode === "login" ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"
            }`}
            onClick={() => setMode("login")}
          >
            ログイン
          </button>
          <button
            className={`flex-1 py-2 rounded ${
              mode === "signup" ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"
            }`}
            onClick={() => setMode("signup")}
          >
            新規登録
          </button>
        </div>

        <label className="block text-sm mb-1 text-gray-300">ID または メール</label>
        <input
          value={idOrEmail}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIdOrEmail(e.target.value)}
          placeholder="例) taro@gmail.com"
          className="w-full mb-4 px-3 py-2 rounded bg-gray-900 border border-gray-700 outline-none focus:ring-2 focus:ring-blue-600"
        />

        <label className="block text-sm mb-1 text-gray-300">パスワード（6文字以上）</label>
        <input
          type="password"
          value={password}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
          placeholder="••••••"
          className="w-full mb-4 px-3 py-2 rounded bg-gray-900 border border-gray-700 outline-none focus:ring-2 focus:ring-blue-600"
        />

        {errorMsg && (
          <div className="mb-4 text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
            {errorMsg}
          </div>
        )}

        <button
          disabled={busy}
          onClick={mode === "login" ? handleLogin : handleSignup}
          className={`w-full py-2 rounded font-medium ${
            busy ? "bg-gray-700 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {busy ? "処理中…" : mode === "login" ? "ログイン" : "登録してログイン"}
        </button>

        <p className="mt-4 text-xs text-gray-400">
          ※ IDのみで登録した場合は内部的に <code>@example.com</code> が付与されます。
        </p>
      </div>
    </main>
  );
}
