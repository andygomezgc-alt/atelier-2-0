// Bring-your-own-key (BYOK) chat streaming.
//
// When a user configures their own provider + API key + model in profile, the
// chat route routes here instead of the server's Anthropic SDK call. Each
// provider has its own SDK; this module wraps them in a single
// `streamBYOK` async generator that yields `{type: "delta", text}` events and
// a final `{type: "done", usage}` event, mirroring the shape the SSE
// transport already produces for the Anthropic-default flow.
//
// We flatten the system prompt to a plain string here. The Anthropic-default
// path keeps its multi-block prompt cache; BYOK trades that for portability.

import Anthropic, { APIUserAbortError } from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

export type BYOKProvider = "anthropic" | "openai" | "google";

export type BYOKInput = {
  provider: BYOKProvider;
  apiKey: string;
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  signal: AbortSignal;
  maxTokens?: number;
};

export type BYOKEvent =
  | { type: "delta"; text: string }
  | { type: "done"; inputTokens?: number; outputTokens?: number };

export async function* streamBYOK(input: BYOKInput): AsyncGenerator<BYOKEvent> {
  switch (input.provider) {
    case "anthropic":
      yield* streamAnthropic(input);
      return;
    case "openai":
      yield* streamOpenAI(input);
      return;
    case "google":
      yield* streamGoogle(input);
      return;
    default: {
      const _exhaustive: never = input.provider;
      throw new Error(`Unsupported provider: ${String(_exhaustive)}`);
    }
  }
}

async function* streamAnthropic(input: BYOKInput): AsyncGenerator<BYOKEvent> {
  const client = new Anthropic({ apiKey: input.apiKey });
  const stream = client.messages.stream(
    {
      model: input.model,
      max_tokens: input.maxTokens ?? 2048,
      system: input.system,
      messages: input.messages,
    },
    { signal: input.signal },
  );

  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "delta", text: event.delta.text };
      }
    }
    const final = await stream.finalMessage();
    yield {
      type: "done",
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
    };
  } catch (err) {
    if (err instanceof APIUserAbortError) return;
    throw err;
  }
}

async function* streamOpenAI(input: BYOKInput): AsyncGenerator<BYOKEvent> {
  const client = new OpenAI({ apiKey: input.apiKey });
  const stream = await client.chat.completions.create(
    {
      model: input.model,
      max_tokens: input.maxTokens ?? 2048,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: input.system },
        ...input.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    },
    { signal: input.signal },
  );

  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) yield { type: "delta", text: delta };
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens;
      outputTokens = chunk.usage.completion_tokens;
    }
  }
  yield { type: "done", inputTokens, outputTokens };
}

async function* streamGoogle(input: BYOKInput): AsyncGenerator<BYOKEvent> {
  const client = new GoogleGenAI({ apiKey: input.apiKey });
  // Gemini's chat is single "contents" array; system instruction is separate.
  const contents = input.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // Normalise the model id: Google's API rejects names with spaces, the
  // optional "models/" prefix and the "google/" prefix users sometimes paste
  // from other providers. Spaces are the common typo — "gemini 2.5 flash"
  // should still work.
  const model = input.model
    .trim()
    .replace(/^models\//, "")
    .replace(/^google\//, "")
    .replace(/\s+/g, "-")
    .toLowerCase();

  const stream = await client.models.generateContentStream({
    model,
    contents,
    config: {
      systemInstruction: input.system,
      maxOutputTokens: input.maxTokens ?? 2048,
      abortSignal: input.signal,
    },
  });

  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield { type: "delta", text };
    const u = chunk.usageMetadata;
    if (u) {
      inputTokens = u.promptTokenCount;
      outputTokens = u.candidatesTokenCount;
    }
  }
  yield { type: "done", inputTokens, outputTokens };
}
