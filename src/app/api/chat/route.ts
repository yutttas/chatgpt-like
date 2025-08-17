// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.GOOGLE_API_KEY!;
const TEMP = Number(process.env.GEMINI_TEMP ?? 0.8);
const MAX_OUT = Number(process.env.GEMINI_MAX_TOKENS ?? 1024);

type Role = "user" | "assistant" | "system";
type ChatMsg = { role: Role; content: string };

export async function GET() {
  if (!API_KEY) return new Response("GOOGLE_API_KEY not set", { status: 500 });
  return new Response("chat endpoint ok");
}

export async function POST(req: NextRequest) {
  if (!API_KEY)
    return NextResponse.json({ error: "GOOGLE_API_KEY not set" }, { status: 500 });

  // ① body（UI から渡された履歴＆モデル）
  const body = (await req.json()) as {
    messages?: ChatMsg[];
    model?: string;          // "gemini-1.5-pro" | "gemini-1.5-flash"
    temperature?: number;
    maxTokens?: number;
  };

  const rawMessages: ChatMsg[] = Array.isArray(body?.messages) ? body.messages : [];

  // ② モデル選択（UI指定 > .env 既定）
  const modelId =
    typeof body?.model === "string" && body.model
      ? body.model
      : (process.env.GEMINI_MODEL || "gemini-1.5-pro");

  const genAI = new GoogleGenerativeAI(API_KEY);

  // ③ モデル生成（systemInstruction 付与）
  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction:
      "あなたは丁寧でわかりやすい日本語のアシスタントSHIMAという名前です。必要に応じて適切に改行し、箇条書きは簡潔にしてください。",
  });

  // ④ メッセージを Gemini 形式に
  const contents = rawMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // ⑤ ストリーミングで返却（“書きながら出る”UI対応）
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        const resp = await model.generateContentStream({
          contents,
          generationConfig: {
            temperature: typeof body?.temperature === "number" ? body.temperature : TEMP,
            maxOutputTokens: typeof body?.maxTokens === "number" ? body.maxTokens : MAX_OUT,
          },
        });

        for await (const chunk of resp.stream) {
          const part = chunk.text();
          if (part) controller.enqueue(enc.encode(part));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(enc.encode(`【エラー】${msg}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
