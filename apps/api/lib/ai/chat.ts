import Anthropic from "@anthropic-ai/sdk";
import { buildMessageBlocks, type Msg, type buildSystemBlocks } from "../anthropic";
import { chatConfig, providerKey } from "./config";
import { emptyUsage, tokenCount, type AiUsage } from "./types";
import type { ChatModelSelection } from "@atelier/shared";
import { reserveGeneration, settleGeneration } from "./budget";
import { textInputCeiling } from "./budget-policy";

export type ChatEvent = { type: "delta"; text: string } | { type: "usage"; usage: AiUsage };
type ChatInput = { model?: ChatModelSelection; system: ReturnType<typeof buildSystemBlocks>; messages: Msg[]; signal: AbortSignal; userId?: string };

/** Bound history by size as well as count, retaining whole recent exchanges. */
export function boundedChatHistory(messages: Msg[], maxChars = 40_000): Msg[] {
  const selected: Msg[] = [];
  let chars = 0;
  for (const message of messages.slice(-20).reverse()) {
    if (chars + message.content.length > maxChars) break;
    selected.unshift(message);
    chars += message.content.length;
  }
  while (selected[0]?.role === "assistant") selected.shift();
  if (!selected.length) throw new Error("chat_context_too_long");
  return selected;
}

/** SSE records can span UTF-8 chunks, multiple lines, and CRLF boundaries. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let data: string[] = [];
  const processLine = (line: string): string | undefined => {
    if (!line) {
      const event = data.length ? data.join("\n") : undefined;
      data = [];
      return event;
    }
    if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    return undefined;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      if (pending.length > 1_000_000) throw new Error("ai_stream_invalid");
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const event = processLine(pending.slice(0, newline).replace(/\r$/, ""));
        pending = pending.slice(newline + 1);
        if (event !== undefined) yield event;
      }
      if (done) break;
    }
    if (pending) processLine(pending.replace(/\r$/, ""));
    const last = processLine("");
    if (last !== undefined) yield last;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function* streamChat(input: ChatInput): AsyncGenerator<ChatEvent> {
  const config = chatConfig(input.model);
  providerKey(config.provider);
  input.signal.throwIfAborted();
  const messages = boundedChatHistory(input.messages);
  const reservation = await reserveGeneration(config, textInputCeiling({ system: input.system, messages }), input.userId);
  let confirmedUsage: AiUsage | undefined;
  try {
    if (input.signal.aborted) confirmedUsage = emptyUsage(); // Provider was not started.
    input.signal.throwIfAborted();
    yield* streamChatProvider({ ...input, messages }, usage => { confirmedUsage = usage; });
  } finally { await settleGeneration(reservation, confirmedUsage); }
}

async function* streamChatProvider(input: ChatInput, onFinalUsage: (usage: AiUsage) => void): AsyncGenerator<ChatEvent> {
  const config = chatConfig(input.model);
  const key = providerKey(config.provider);
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(config.timeoutMs)]);
  const messages = boundedChatHistory(input.messages);
  let text = "";
  if (config.provider === "anthropic") {
    const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: config.timeoutMs });
    const upstream = client.messages.stream({
      model: config.model, max_tokens: config.maxTokens,
      system: input.system, messages: buildMessageBlocks(messages),
      thinking: { type: "adaptive", display: "omitted" },
      // Opus 5.5 razona más que Opus 5 en el mismo nivel: en medio iguala a
      // Opus 5 en alto con menos tokens, así que responde antes y cuesta menos.
      output_config: { effort: "medium" },
    }, { signal });
    let usage = emptyUsage();
    for await (const event of upstream) {
      if (event.type === "message_start") {
        const u = event.message.usage;
        usage = { ...usage, inputTokens: tokenCount(u.input_tokens) + tokenCount(u.cache_creation_input_tokens) + tokenCount(u.cache_read_input_tokens),
          outputTokens: tokenCount(u.output_tokens), cachedTokens: tokenCount(u.cache_read_input_tokens), cacheWriteTokens: tokenCount(u.cache_creation_input_tokens) };
        yield { type: "usage", usage };
      } else if (event.type === "message_delta") {
        usage = { ...usage, outputTokens: tokenCount(event.usage.output_tokens) };
        yield { type: "usage", usage };
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        yield { type: "delta", text: event.delta.text };
      }
    }
    const final = await upstream.finalMessage();
    const u = final.usage;
    const finalUsage = { ...usage,
      inputTokens: tokenCount(u.input_tokens) + tokenCount(u.cache_creation_input_tokens) + tokenCount(u.cache_read_input_tokens),
      outputTokens: tokenCount(u.output_tokens), cachedTokens: tokenCount(u.cache_read_input_tokens), cacheWriteTokens: tokenCount(u.cache_creation_input_tokens),
    };
    if (Number.isSafeInteger(u.input_tokens) && Number.isSafeInteger(u.output_tokens) && finalUsage.inputTokens > 0) onFinalUsage(finalUsage);
    yield { type: "usage", usage: finalUsage };
    // Los filtros de seguridad del proveedor pueden negarse (en Opus 5.5 hay
    // uno de biología): se registra la categoría y el chef recibe un aviso.
    if (final.stop_reason === "refusal") {
      console.warn(JSON.stringify({ evt: "ai_refusal", provider: config.provider, modelId: config.model, category: final.stop_details?.category ?? null }));
      throw new Error("chat_refused");
    }
    if (final.stop_reason !== "end_turn" || !text.trim()) throw new Error("chat_response_incomplete");
    return;
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: input.system.map(block => ({ text: block.text })) },
      contents: messages.map(message => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
      generationConfig: { maxOutputTokens: config.maxTokens, thinkingConfig: { thinkingLevel: "low", includeThoughts: false } },
    }),
  });
  if (!response.ok) throw new Error(`ai_provider_http_${response.status}`);
  if (!response.body) throw new Error("chat_response_incomplete");
  let finishReason: string | undefined;
  let usage = emptyUsage();
  let completeUsage = false;
  for await (const data of sseData(response.body)) {
    if (data === "[DONE]") break;
    const chunk = JSON.parse(data);
    if (chunk.usageMetadata) {
      const u = chunk.usageMetadata;
      completeUsage = Number.isSafeInteger(u.promptTokenCount) && u.promptTokenCount > 0 && Number.isSafeInteger(u.candidatesTokenCount);
      usage = { inputTokens: tokenCount(u.promptTokenCount),
        outputTokens: tokenCount(u.candidatesTokenCount) + tokenCount(u.thoughtsTokenCount),
        reasoningTokens: tokenCount(u.thoughtsTokenCount), cachedTokens: tokenCount(u.cachedContentTokenCount) };
      yield { type: "usage", usage };
    }
    if (chunk.error || chunk.promptFeedback?.blockReason) throw new Error("ai_response_blocked");
    const candidate = chunk.candidates?.[0];
    if (candidate?.finishReason) finishReason = candidate.finishReason;
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part.text === "string" && !part.thought) {
        text += part.text;
        yield { type: "delta", text: part.text };
      }
    }
  }
  if (finishReason && completeUsage) onFinalUsage(usage);
  if (finishReason !== "STOP" || !text.trim()) throw new Error("chat_response_incomplete");
}
