import { callLLM, LLMConfig } from "../llm/litellm";
import { DetectedIssue, ReviewerResponse } from "./types";

const REVIEWER_PROMPT = `You are a fast code-review triage agent. Scan the TOON-encoded diff and flag ONLY critical issues.

DETECT:
- BUG: Logic errors, null/undefined risks, off-by-one, race conditions
- SECURITY: Injection, XSS, hardcoded secrets, unsafe eval, SQL injection
- PERFORMANCE: O(n²) in loops, memory leaks, unnecessary re-renders
- BEST_PRACTICE: Missing error handling, edge cases, type safety

SKIP: Style, formatting, naming, comments, positive feedback.

OUTPUT (strict JSON, nothing else):
{"issues":[{"file":"<path>","line":<n>,"chunk":"<minimal code snippet>","issueType":"BUG|SECURITY|PERFORMANCE|BEST_PRACTICE"}]}

If no issues: {"issues":[]}`;

function cleanJSON(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/```\s*$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/```\s*$/, "");
  }
  return cleaned;
}

export async function runReviewerAgent(
  toonDiff: string,
  config: LLMConfig
): Promise<DetectedIssue[]> {
  const response = await callLLM(config, [
    { role: "system", content: REVIEWER_PROMPT },
    { role: "user", content: toonDiff },
  ]);

  if (!response) {
    console.warn("Reviewer agent returned no response");
    return [];
  }

  try {
    const parsed: ReviewerResponse = JSON.parse(cleanJSON(response));
    if (!parsed.issues || !Array.isArray(parsed.issues)) {
      console.warn("Reviewer response missing issues array");
      return [];
    }
    const validTypes = ["BUG", "SECURITY", "PERFORMANCE", "BEST_PRACTICE"];
    return parsed.issues.filter(
      (issue) =>
        typeof issue.file === "string" &&
        typeof issue.line === "number" &&
        typeof issue.chunk === "string" &&
        validTypes.indexOf(issue.issueType) !== -1
    );
  } catch (error) {
    console.warn("Failed to parse reviewer agent response:", error);
    console.warn("Raw response:", response);
    return [];
  }
}
