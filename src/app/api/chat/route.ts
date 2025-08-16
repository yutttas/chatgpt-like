// src/app/api/chat/route.ts
import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";         // EdgeよりNodeが安定
export const dynamic = "force-dynamic";  // キャッシュ抑止（開発向け）

// 環境変数
const API_KEY = process.env.GOOGLE_API_KEY!;
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-pro";
const TEMP = Number(process.env.GEMINI_TEMP ?? 0.8);
const MAX_OUT = Number(process.env.GEMINI_MAX_TOKENS ?? 1024);

// 簡易型
type RawMessage = { role: "user" | "assistant" | "system"; content: string };
type GeminiContent = { role: "user" | "model"; parts: { text: string }[] };

// GET: 疎通確認用（ブラウザで /api/chat を開くとOK表示）
export async function GET() {
  if (!API_KEY) {
    return new Response("GOOGLE_API_KEY not set", { status: 500 });
  }
  return new Response("chat endpoint ok");
}

export async function POST(req: NextRequest) {
  try {
    if (!API_KEY) {
      return new Response("Server missing GOOGLE_API_KEY", { status: 500 });
    }

    // リクエストボディ
    const body = await req.json().catch(() => ({}));
    const rawMessages: RawMessage[] = Array.isArray(body?.messages)
      ? body.messages
      : [];

    // UIからのモデル指定（"gemini-1.5-pro" / "gemini-1.5-flash" 等）
    const modelId: string =
      typeof body?.model === "string" && body.model.trim()
        ? body.model.trim()
        : DEFAULT_MODEL;

    // messages[] を Gemini 形式へ（systemは除外）
    const contents: GeminiContent[] = rawMessages
      .filter(
        (m) =>
          m &&
          typeof m.content === "string" &&
          (m.role === "user" || m.role === "assistant")
      )
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content) }],
      }));

    if (contents.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid body. messages[] required." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({
      model: modelId,
      // ここで性格付け。日本語・改行・箇条書きなど好みに合わせて調整可
      systemInstruction:
        "あなたは丁寧でわかりやすい日本語アシスタントSHIMAです。" +
        "短い段落と箇条書きを使い、詰まりすぎないよう適度に改行してください。",
    });

    // 最小構成：まずは safetySettings を送らず確実に通す
    const result = await model.generateContentStream({
      contents,
      generationConfig: {
        temperature: TEMP,
        maxOutputTokens: MAX_OUT,
      },
      // safetySettings: [...]  // 必要になったら追加（正しい列挙名のみ）
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) controller.enqueue(encoder.encode(text));
          }
        } catch (e) {
          console.error("[Gemini stream error]", e);
          controller.error(e);
          return;
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err: any) {
    console.error("[Gemini API Error]", err);
    const message =
      (typeof err?.message === "string" && err.message) || "Gemini error";
    return new Response(message, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
