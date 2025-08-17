// src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_KEY = process.env.GOOGLE_API_KEY!;
const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-pro";
const TEMP = Number(process.env.GEMINI_TEMP ?? 0.8);
const MAX_OUT = Number(process.env.GEMINI_MAX_TOKENS ?? 1024);

type Role = "user" | "assistant" | "system";
type ChatMessage = { role: Role; content: string };

type GenRole = "user" | "model";
type GenContent = { role: GenRole; parts: { text: string }[] };

interface ChatRequestBody {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function GET() {
  if (!API_KEY) return new Response("GOOGLE_API_KEY not set", { status: 500 });
  return new Response("chat endpoint ok");
}

export async function POST(req: NextRequest) {
  if (!API_KEY)
    return NextResponse.json({ error: "GOOGLE_API_KEY not set" }, { status: 500 });

  const { messages, model, temperature, maxTokens } =
    (await req.json()) as ChatRequestBody;

  const genAI = new GoogleGenerativeAI(API_KEY);
  const m = genAI.getGenerativeModel({ model: model ?? DEFAULT_MODEL });

  const contents: GenContent[] = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  // ★ ストリームで逐次テキストを吐き出す
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        const resp = await m.generateContentStream({
          contents,
          generationConfig: {
            temperature: typeof temperature === "number" ? temperature : TEMP,
            maxOutputTokens: typeof maxTokens === "number" ? maxTokens : MAX_OUT,
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
