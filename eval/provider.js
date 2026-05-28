// promptfoo custom provider: runs PRowl's real reviewer agent (Agent 1) on a
// raw unified diff and returns the detected issues as JSON.
//
// The diff arrives as the rendered `prompt` (see promptfooconfig.yaml, which
// renders each fixture file into the prompt). We parse it, encode to TOON
// exactly as main.ts does, then call the reviewer agent against a live LLM.
//
// Requires env: LLM_API_KEY (and optionally LLM_MODEL, LLM_BASE_URL).
require("ts-node/register/transpile-only");

const parseDiff = require("parse-diff");
const { encodeFilesToTOON } = require("../src/toon/encoder");
const { runReviewerAgent } = require("../src/orchestrator/reviewerAgent");

class ProwlReviewerProvider {
  constructor(options = {}) {
    this.providerId = (options && options.id) || "prowl-reviewer";
    this.config = (options && options.config) || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    if (!process.env.LLM_API_KEY) {
      return { error: "LLM_API_KEY is not set — evals call a live model." };
    }
    try {
      const parsed = parseDiff(prompt);
      const toon = encodeFilesToTOON(parsed, {
        contextLines: parseInt(process.env.CONTEXT_LINES || "2", 10),
      });
      const issues = await runReviewerAgent(toon, {
        model:
          process.env.LLM_REVIEWER_MODEL ||
          process.env.LLM_MODEL ||
          "gpt-4o-mini",
        apiKey: process.env.LLM_API_KEY,
        baseURL: process.env.LLM_BASE_URL || undefined,
        temperature: 0.2,
        maxTokens: 700,
        cache: false, // never cache during evals — we want fresh model behavior
      });
      return { output: JSON.stringify(issues) };
    } catch (err) {
      return { error: String((err && err.stack) || err) };
    }
  }
}

module.exports = ProwlReviewerProvider;
