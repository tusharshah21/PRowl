import * as fs from "fs";
import { callLLM, LLMConfig } from "../llm/litellm";
import { ExplainerFixResponse, IssueType } from "./types";

const SURROUNDING_LINES = 15;

function buildPrompt(issueType: IssueType): string {
  return `You are a senior engineer. You receive a code chunk flagged as a ${issueType} issue, optionally with surrounding file context.

Your job:
1. Explain the problem concisely (1-3 sentences)
2. Provide the corrected code (only the chunk, not the surrounding context)

OUTPUT (strict JSON, nothing else):
{"explanation":"<what's wrong and why>","fixedCode":"<corrected code snippet>","lineNumber":<original line number>}`;
}

function readSurrounding(filePath: string, line: number): string | null {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    const lo = Math.max(0, line - 1 - SURROUNDING_LINES);
    const hi = Math.min(lines.length, line + SURROUNDING_LINES);
    const slice = lines.slice(lo, hi);
    return slice.map((l, i) => `${lo + i + 1}: ${l}`).join("\n");
  } catch {
    return null;
  }
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
  const surrounding = filePath ? readSurrounding(filePath, lineNumber) : null;
  const userParts = [`Line ${lineNumber}:`, chunk];
  if (surrounding) {
    userParts.push("", "Surrounding file context (line: code):", surrounding);
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
