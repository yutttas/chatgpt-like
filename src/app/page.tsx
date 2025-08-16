"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type SessionRow = {
  id: string;
  title: string | null;
  user_id: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

type ShimaModel = "pro" | "flash";

export default function Page() {
  const router = useRouter();

  // Auth
  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");

  // UI
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [model, setModel] = useState<ShimaModel>("pro"); // SHIMA 1.5 Pro / Flash

  // Data
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [messages, setMessages] = useState<MessageRow[]>([]);

  // Inputs
  const [newTitle, setNewTitle] = useState("");
  const [input, setInput] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [menuOpenId, setMenuOpenId] = useState<string | null>(null); // 3点メニュー

  const bottomRef = useRef<HTMLDivElement | null>(null);

  // --- Auth guard ---
  useEffect(() => {
    let unsub: { unsubscribe: () => void } | null = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      const sess = data.session;
      if (!sess) {
        setAuthLoading(false);
        router.push("/auth");
        return;
      }
      setUserId(sess.user.id);
      setUserEmail(sess.user.email ?? "");
      setAuthLoading(false);

      const sub = supabase.auth.onAuthStateChange((_e, s) => {
        if (!s) {
          router.push("/auth");
        } else {
          setUserId(s.user.id);
          setUserEmail(s.user.email ?? "");
        }
      });
      unsub = sub.data.subscription;

      await fetchSessions(sess.user.id);
    })();

    return () => {
      unsub?.unsubscribe();
    };
  }, [router]);

  // --- Fetch sessions (only mine) ---
  const fetchSessions = async (uid = userId) => {
    if (!uid) return;
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("user_id", uid) // ★ 自分の分だけ
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetch sessions error:", error);
      return;
    }
    const rows = (data || []) as SessionRow[];
    setSessions(rows);
    if (!selectedSessionId && rows.length > 0) {
      setSelectedSessionId(rows[0].id);
    }
  };

  // --- Fetch messages of selected session ---
  useEffect(() => {
    if (!selectedSessionId) {
      setMessages([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("session_id", selectedSessionId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("fetch messages error:", error);
        return;
      }
      setMessages((data || []) as MessageRow[]);
    })();
  }, [selectedSessionId]);

  // --- Auto scroll ---
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- Create new session ---
  const createNewSession = async () => {
    if (!userId) {
      alert("ログインしてください");
      return;
    }
    const title = newTitle.trim() || "新しいチャット";
    const { data, error } = await supabase
      .from("sessions")
      .insert([{ title, user_id: userId }]) // ★ user_id 付与
      .select()
      .single();

    if (error || !data) {
      console.error("Insert session error:", error);
      return;
    }

    const row = data as SessionRow;
    setSessions((prev) => [row, ...prev]);
    setSelectedSessionId(row.id);
    setNewTitle("");
  };

  // --- Rename/Delete session (with user_id guard) ---
  const renameSession = async (s: SessionRow) => {
    const next = window.prompt("新しいタイトルを入力", s.title ?? "") ?? "";
    const title = next.trim();
    if (!title) return;

    const { error } = await supabase
      .from("sessions")
      .update({ title })
      .eq("id", s.id)
      .eq("user_id", userId); // ★ 自分のものだけ

    if (error) {
      console.error("rename error:", error);
      return;
    }
    setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, title } : x)));
  };

  const deleteSession = async (s: SessionRow) => {
    if (!confirm("このチャットを削除しますか？")) return;

    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", s.id)
      .eq("user_id", userId); // ★ 自分のものだけ

    if (error) {
      console.error("delete error:", error);
      return;
    }
    setSessions((prev) => prev.filter((x) => x.id !== s.id));
    if (selectedSessionId === s.id) {
      setSelectedSessionId(null);
      setMessages([]);
    }
  };

  // --- Send message (stream) ---
  const handleSend = async () => {
    if (!selectedSessionId || !input.trim() || isLoading) return;

    const newUserMsg: MessageRow = {
      id: crypto.randomUUID(),
      role: "user",
      content: input,
      session_id: selectedSessionId,
      created_at: new Date().toISOString(),
    };

    // 楽観更新
    setMessages((prev) => [...prev, newUserMsg]);
    setInput("");
    setIsLoading(true);

    // 保存（user）
    await supabase.from("messages").insert([
      { role: "user", content: newUserMsg.content, session_id: selectedSessionId },
    ]);

    // タイピング仮メッセ（★このまま表示し、最初のチャンクで置換する）
    const typingId = `typing-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: typingId, role: "assistant", content: "typing", session_id: selectedSessionId },
    ]);

    // 送信用コンテキスト（今画面にある履歴＋今回の発話）
    const history = [...messages, newUserMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // SHIMA→Gemini モデルID変換
    const modelId = model === "pro" ? "gemini-1.5-pro" : "gemini-1.5-flash";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ★ body.model を route.ts が優先採用
        body: JSON.stringify({ messages: history, model: modelId }),
      });

      if (!res.body) throw new Error("No response body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let aiText = "";

      // ★ 空文字にしない：最初のチャンクを受け取ったら typing を置換
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        aiText += decoder.decode(value, { stream: true });

        setMessages((prev) => {
          const cp = [...prev];
          const idx = cp.findIndex((m) => m.id === typingId);
          if (idx >= 0) {
            cp[idx] = { ...cp[idx], content: aiText }; // typing → 本文に置換
          }
          return cp;
        });
      }

      // 保存（assistant）
      await supabase.from("messages").insert([
        { role: "assistant", content: aiText, session_id: selectedSessionId },
      ]);
    } catch (e) {
      console.error("AI error:", e);
      setMessages((prev) => {
        const cp = [...prev];
        const idx = cp.findIndex((m) => m.id === typingId);
        if (idx >= 0) cp[idx] = { ...cp[idx], content: "Gemini error" };
        return cp;
      });
    } finally {
      setIsLoading(false);
    }
  };

  // --- Logout ---
  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
        読み込み中…
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* サイドバーを閉じているときだけ“開く”ボタン */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="サイドバーを開く"
          className="fixed left-3 top-3 z-50 rounded-md bg-white/10 hover:bg-white/15 px-3 py-2"
          title="サイドバーを開く"
        >
          ☰
        </button>
      )}

      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="w-72 shrink-0 border-r border-white/10 bg-[#0f172a]">
          <div className="flex h-full flex-col gap-3 p-4">
            {/* ヘッダー：メール + ハンバーガー（閉じる） */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-widest text-white/60">
                  チャット履歴
                </div>
                <div className="mt-1 text-sm text-white/70">{userEmail}</div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="サイドバーを閉じる"
                className="ml-3 rounded-md p-2 text-white/80 hover:bg-white/10"
                title="サイドバーを閉じる"
              >
                ☰
              </button>
            </div>

            <button
              onClick={handleLogout}
              className="self-start rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15"
            >
              ログアウト
            </button>

            {/* 新規作成 */}
            <div className="mt-1 flex gap-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="新しいチャットタイトル"
                className="w-full rounded-md border border-white/10 bg-[#0b1220] px-3 py-2 text-sm placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <button
                onClick={createNewSession}
                className="min-w-[64px] whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm hover:bg-blue-700"
              >
                追加
              </button>
            </div>

            {/* セッション一覧（自分のだけ） */}
            <div className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
              {sessions.map((s) => (
                <div key={s.id} className="relative group">
                  <button
                    onClick={() => {
                      setSelectedSessionId(s.id);
                      setMenuOpenId(null);
                    }}
                    className={`w-full truncate whitespace-nowrap rounded-md px-3 py-2 text-left ${
                      selectedSessionId === s.id
                        ? "bg-white/10"
                        : "hover:bg-white/5"
                    }`}
                    title={s.title || "新しいチャット"}
                  >
                    {s.title || "新しいチャット"}
                  </button>

                  {/* 3点メニュー */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId((v) => (v === s.id ? null : s.id));
                      }}
                      className="rounded-md px-2 py-1 text-white/70 hover:bg-white/10"
                      aria-label="メニュー"
                    >
                      ⋯
                    </button>
                  </div>

                  {menuOpenId === s.id && (
                    <div
                      className="absolute right-8 top-1/2 z-20 -translate-y-1/2 overflow-hidden rounded-md border border-white/10 bg-[#0b1220] text-sm shadow-lg"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          renameSession(s);
                          setMenuOpenId(null);
                        }}
                        className="block w-full px-3 py-2 text-left hover:bg-white/10"
                      >
                        タイトル編集
                      </button>
                      <button
                        onClick={() => {
                          deleteSession(s);
                          setMenuOpenId(null);
                        }}
                        className="block w-full px-3 py-2 text-left text-red-300 hover:bg-white/10"
                      >
                        削除
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* Main */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* ヘッダ：モデル名（左）＋ 切替（右） */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h1 className="truncate text-sm text-white/80">
            {model === "pro" ? "SHIMA 1.5 Pro" : "SHIMA 1.5 Flash"}
          </h1>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ShimaModel)}
            className="rounded-md border border-white/10 bg-[#0b1220] px-2 py-1.5 text-sm hover:bg-white/5 focus:outline-none"
            title="モデル切替"
          >
            <option value="pro">SHIMA 1.5 Pro</option>
            <option value="flash">SHIMA 1.5 Flash</option>
          </select>
        </div>

        {/* メッセージ一覧（吹き出し） */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {selectedSessionId ? (
            messages.map((m) => {
              const isAssistant = m.role === "assistant";
              const bubbleBase =
                "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed shadow-sm border";
              const bubbleColor = isAssistant
                ? "bg-[#111827] border-white/10 text-white"
                : "bg-blue-600 border-blue-400/20 text-white";
              return (
                <div
                  key={m.id}
                  className={`mb-3 flex ${isAssistant ? "justify-start" : "justify-end"}`}
                >
                  <div className={`${bubbleBase} ${bubbleColor} break-words min-w-[3rem]`}>
                    {m.content === "typing" ? (
                      <span className="dot-typing">●●●</span>
                    ) : (
                      m.content || "…" // 空文字でも最小表示
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-white/60">
              左の「新しいチャット」から始めてください。
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 入力欄 */}
        {selectedSessionId && (
          <div className="border-t border-white/10 bg-[#0f172a]/70 p-4">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !isComposing) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={2}
                placeholder="メッセージを入力…（Shift+Enterで改行）"
                className="min-h-[44px] flex-1 resize-none rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              />
              <button
                onClick={handleSend}
                disabled={isLoading}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm ${
                  isLoading
                    ? "cursor-not-allowed bg-gray-600/60"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                送信
              </button>
            </div>
          </div>
        )}
      </main>

      {/* typing dots */}
      <style jsx>{`
        .dot-typing {
          display: inline-block;
          letter-spacing: 0.25rem;
          animation: dot-typing 1s steps(1, end) infinite;
        }
        @keyframes dot-typing {
          0%,
          20% {
            color: transparent;
          }
          40% {
            color: #fff;
          }
          60% {
            color: transparent;
          }
          80% {
            color: #fff;
          }
          100% {
            color: transparent;
          }
        }
      `}</style>
    </div>
  );
}
