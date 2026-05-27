import { runReviewerAgent } from "./reviewerAgent";
import { runExplainerFixAgent } from "./explainerFixAgent";
import { OrchestratorConfig, ReviewResult } from "./types";

export { OrchestratorConfig, ReviewResult } from "./types";

export async function orchestrate(
  toonDiff: string,
  config: OrchestratorConfig
): Promise<ReviewResult[]> {
  const reviewerConfig = {
    model: config.reviewerModel,
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    temperature: 0.2,
    maxTokens: 700,
    cache: config.cache,
  };

  console.log(`[orchestrator] Running reviewer agent with model: ${config.reviewerModel}`);
  const issues = await runReviewerAgent(toonDiff, reviewerConfig, config.semgrepFindings);

  if (issues.length === 0) {
    console.log("[orchestrator] No issues detected — skipping fixer agent");
    return [];
  }

  console.log(`[orchestrator] ${issues.length} issue(s) found — running fixer agent in parallel`);

  const fixerConfig = {
    model: config.fixerModel,
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    temperature: 0.2,
    maxTokens: 700,
    cache: config.cache,
  };

  const fixResults = await Promise.all(
    issues.map(async (issue) => {
      const fix = await runExplainerFixAgent(
        issue.chunk,
        issue.issueType,
        issue.line,
        fixerConfig,
        issue.file
      );
      if (!fix) return null;
      return {
        file: issue.file,
        lineNumber: fix.lineNumber,
        explanation: fix.explanation,
        fixedCode: fix.fixedCode,
        issueType: issue.issueType,
      } as ReviewResult;
    })
  );

  return fixResults.filter((r): r is ReviewResult => r !== null);
}
