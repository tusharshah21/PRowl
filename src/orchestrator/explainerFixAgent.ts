import { callLLM, LLMConfig } from "../llm/litellm";
import { extractSemanticContext } from "./semanticContext";
import { ExplainerFixResponse, IssueType } from "./types";

function buildPrompt(issueType: IssueType): string {
  return `You are a senior engineer. You receive a code chunk flagged as a ${issueType} issue, optionally with surrounding file context.

Your job:
1. Explain the problem concisely (1-3 sentences)
2. Provide the corrected code (only the chunk, not the surrounding context)

OUTPUT (strict JSON, nothing else):
{"explanation":"<what's wrong and why>","fixedCode":"<corrected code snippet>","lineNumber":<original line number>}`;
}

function cleanJSON(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/```\s*$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "");
  }
  return cleaned;
}

export async function runExplainerFixAgent(
  chunk: string,
  issueType: IssueType,
  lineNumber: number,
  config: LLMConfig,
  filePath?: string
): Promise<ExplainerFixResponse | null> {
  const surrounding = filePath ? extractSemanticContext(filePath, lineNumber) : null;
  const userParts = [`Line ${lineNumber}:`, chunk];
  if (surrounding) {
    userParts.push("", surrounding);
  }
  const response = await callLLM(config, [
    { role: "system", content: buildPrompt(issueType) },
    { role: "user", content: userParts.join("\n") },
  ]);

  if (!response) {
    console.warn("Explainer/fix agent returned no response");
    return null;
  }

  try {
    const parsed: ExplainerFixResponse = JSON.parse(cleanJSON(response));
    if (
      typeof parsed.explanation !== "string" ||
      typeof parsed.fixedCode !== "string" ||
      typeof parsed.lineNumber !== "number"
    ) {
      console.warn("Invalid explainer/fix response structure");
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Failed to parse explainer/fix response:", error);
    console.warn("Raw response:", response);
    return null;
  }
}
