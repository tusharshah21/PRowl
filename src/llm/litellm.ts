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

export interface LLMConfig {
  model: string;      // Runtime string, user-provided
  apiKey: string;     // User's API key (BYOK)
  baseURL?: string;   // Optional: LiteLLM proxy, OpenRouter, etc.
  temperature?: number;
  maxTokens?: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Default to OpenAI, but users can override with any OpenAI-compatible endpoint
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

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
  try {
    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || DEFAULT_BASE_URL,
    });

    const response = await client.chat.completions.create({
      model: config.model,
      messages: messages,
      temperature: config.temperature ?? 0.2,
      max_tokens: config.maxTokens ?? 700,
    });

    return response.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error("LLM API Error:", error);
    if (error instanceof Error) {
      console.error("Details:", error.message);
    }
    return null;
  }
}

// Backward compatibility alias
export const callLiteLLM = callLLM;
export type LiteLLMConfig = LLMConfig;
export type LiteLLMMessage = LLMMessage;

