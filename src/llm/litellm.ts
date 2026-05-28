/**
 * LLM Client Module
 * 
 * Provider-agnostic interface using OpenAI-compatible API format.
 * Works with any LLM that supports OpenAI API format:
 * - OpenAI directly
 * - LiteLLM Proxy (self-hosted)
 * - OpenRouter
 * - Any OpenAI-compatible endpoint
 * 
 * NO provider-specific branching. Model is a runtime string.
 */

import OpenAI from "openai";
import { cacheGet, cacheSet } from "./cache";

export interface LLMConfig {
  model: string;      // Runtime string, user-provided
  apiKey: string;     // User's API key (BYOK)
  baseURL?: string;   // Optional: LiteLLM proxy, OpenRouter, etc.
  temperature?: number;
  maxTokens?: number;
  cache?: boolean;    // Persist responses by hash(model,messages) under /tmp
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Default to OpenAI, but users can override with any OpenAI-compatible endpoint
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

// Token-limit / temperature parameters differ across model families:
//  - legacy chat models + most OpenAI-compatible providers (Groq, DeepSeek,
//    Ollama, OpenRouter, ...) use `max_tokens` and accept a custom temperature.
//  - newer OpenAI models (gpt-5, o-series) renamed it to `max_completion_tokens`
//    and only accept the default temperature.
// We probe in this order and remember the shape that worked, per model, so we
// stay provider-agnostic instead of hardcoding model names.
type ParamShape = "legacy" | "completion_temp" | "completion_only";
const SHAPE_ORDER: ParamShape[] = ["legacy", "completion_temp", "completion_only"];
const shapeMemo = new Map<string, ParamShape>();

function buildParams(
  shape: ParamShape,
  model: string,
  messages: LLMMessage[],
  maxTokens: number,
  temperature: number
): Record<string, unknown> {
  const base: Record<string, unknown> = { model, messages };
  if (shape === "legacy") {
    base.max_tokens = maxTokens;
    base.temperature = temperature;
  } else if (shape === "completion_temp") {
    base.max_completion_tokens = maxTokens;
    base.temperature = temperature;
  } else {
    base.max_completion_tokens = maxTokens; // omit temperature → provider default
  }
  return base;
}

function isUnsupportedParamError(error: unknown): boolean {
  const e = error as {
    status?: number;
    code?: string;
    param?: string;
    message?: string;
  };
  if (!e || e.status !== 400) return false;
  // The next shape only helps if the 400 is about a param we actually vary.
  if (["temperature", "max_tokens", "max_completion_tokens"].includes(e.param || "")) {
    return true;
  }
  if (e.code === "unsupported_parameter" || e.code === "unsupported_value") {
    return true;
  }
  return /unsupported (parameter|value)|not supported with this model|does not support|max_completion_tokens/i.test(
    e.message || ""
  );
}

/**
 * Calls LLM using OpenAI-compatible API format.
 * 
 * This function is completely provider-agnostic:
 * - No provider detection
 * - No model name parsing
 * - Model string passed directly to API
 * 
 * For non-OpenAI providers, user sets LLM_BASE_URL to their:
 * - LiteLLM proxy: http://localhost:4000/v1
 * - OpenRouter: https://openrouter.ai/api/v1
 * - Any OpenAI-compatible endpoint
 */
export async function callLLM(
  config: LLMConfig,
  messages: LLMMessage[]
): Promise<string | null> {
  const useCache = config.cache !== false;
  if (useCache) {
    const hit = cacheGet(config, messages);
    if (hit !== null) {
      console.log(`[llm] cache hit (${config.model})`);
      return hit;
    }
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL || DEFAULT_BASE_URL,
  });
  const temperature = config.temperature ?? 0.2;
  const baseMaxTokens = config.maxTokens ?? 700;

  // Start from the shape that previously worked for this model, then fall
  // forward through the remaining shapes on "unsupported parameter" errors.
  const start = SHAPE_ORDER.indexOf(shapeMemo.get(config.model) ?? "legacy");

  for (let i = Math.max(start, 0); i < SHAPE_ORDER.length; i++) {
    const shape = SHAPE_ORDER[i];
    // Reasoning models (the completion_only shape) spend tokens on hidden
    // reasoning before any visible output, so a small budget yields an empty,
    // truncated response. Give that shape real headroom up front.
    let budget = shape === "completion_only" ? Math.max(baseMaxTokens, 4000) : baseMaxTokens;

    let truncationRetries = 0;
    while (true) {
      try {
        const response = await client.chat.completions.create(
          buildParams(shape, config.model, messages, budget, temperature) as any
        );
        const choice = response.choices[0];
        const content = choice?.message?.content?.trim() || null;

        // Empty + truncated → the budget was consumed by reasoning. Grow it and retry.
        if (!content && choice?.finish_reason === "length" && truncationRetries < 2) {
          truncationRetries++;
          const grown = Math.min(budget * 3, 16000);
          console.log(
            `[llm] ${config.model} returned empty/truncated output at budget ${budget}; retrying at ${grown}`
          );
          budget = grown;
          continue;
        }

        shapeMemo.set(config.model, shape);
        if (useCache && content) cacheSet(config, messages, content);
        return content;
      } catch (error) {
        if (isUnsupportedParamError(error) && i < SHAPE_ORDER.length - 1) {
          console.log(
            `[llm] '${shape}' params rejected by ${config.model}; retrying with '${SHAPE_ORDER[i + 1]}'`
          );
          break; // advance to the next shape in the outer loop
        }
        console.error("LLM API Error:", error);
        if (error instanceof Error) {
          console.error("Details:", error.message);
        }
        return null;
      }
    }
  }
  return null;
}

// Backward compatibility alias
export const callLiteLLM = callLLM;
export type LiteLLMConfig = LLMConfig;
export type LiteLLMMessage = LLMMessage;

