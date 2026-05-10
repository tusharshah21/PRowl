import { readFileSync } from "fs";
import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import parseDiff, { Chunk, File } from "parse-diff";
import minimatch from "minimatch";
import { encodeDiffToTOON } from "./toon/encoder";
import { orchestrate, OrchestratorConfig } from "./orchestrator";
import { Notifier } from "./notifications";

const GITHUB_TOKEN: string = core.getInput("GITHUB_TOKEN");
const LLM_API_KEY: string = core.getInput("LLM_API_KEY");
const LLM_MODEL: string = core.getInput("LLM_MODEL");
const LLM_BASE_URL: string = core.getInput("LLM_BASE_URL");
const LLM_REVIEWER_MODEL: string = core.getInput("LLM_REVIEWER_MODEL") || LLM_MODEL;
const LLM_FIXER_MODEL: string = core.getInput("LLM_FIXER_MODEL") || LLM_MODEL;
const DISCORD_WEBHOOK_URL: string = core.getInput("DISCORD_WEBHOOK_URL");
const SLACK_BOT_TOKEN: string = core.getInput("SLACK_BOT_TOKEN");
const SLACK_CHANNEL_ID: string = core.getInput("SLACK_CHANNEL_ID");
const SLACK_WEBHOOK_URL: string = core.getInput("SLACK_WEBHOOK_URL");

const octokit = new Octokit({ auth: GITHUB_TOKEN });

interface PRDetails {
  owner: string;
  repo: string;
  pull_number: number;
  title: string;
  description: string;
  url: string;
}

async function getPRDetails(): Promise<PRDetails> {
  const { repository, number } = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH || "", "utf8")
  );
  const prResponse = await octokit.pulls.get({
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
  });
  return {
    owner: repository.owner.login,
    repo: repository.name,
    pull_number: number,
    title: prResponse.data.title ?? "",
    description: prResponse.data.body ?? "",
    url: prResponse.data.html_url ?? "",
  };
}

async function getDiff(
  owner: string,
  repo: string,
  pull_number: number
): Promise<string | null> {
  const response = await octokit.pulls.get({
    owner,
    repo,
    pull_number,
    mediaType: { format: "diff" },
  });
  // @ts-expect-error - response.data is a string
  return response.data;
}

async function analyzeCode(
  parsedDiff: File[],
  prDetails: PRDetails
): Promise<{
  comments: Array<{ body: string; path: string; line: number }>;
  results: Awaited<ReturnType<typeof orchestrate>>;
}> {
  const comments: Array<{ body: string; path: string; line: number }> = [];

  // Build full TOON-encoded diff string for the orchestrator
  const toonChunks: string[] = [];
  for (const file of parsedDiff) {
    if (file.to === "/dev/null") continue;
    for (const chunk of file.chunks) {
      toonChunks.push(encodeDiffToTOON(file, chunk));
    }
  }

  if (toonChunks.length === 0) {
    return { comments, results: [] };
  }

  const toonDiff = toonChunks.join("\n");

  const config: OrchestratorConfig = {
    reviewerModel: LLM_REVIEWER_MODEL,
    fixerModel: LLM_FIXER_MODEL,
    apiKey: LLM_API_KEY,
    baseURL: LLM_BASE_URL || undefined,
  };

  const results = await orchestrate(toonDiff, config);

  for (const result of results) {
    const body = `**[${result.issueType}]** ${result.explanation}\n\n\`\`\`suggestion\n${result.fixedCode}\n\`\`\``;
    comments.push({
      body,
      path: result.file,
      line: result.lineNumber,
    });
  }

  return { comments, results };
}

async function createReviewComment(
  owner: string,
  repo: string,
  pull_number: number,
  comments: Array<{ body: string; path: string; line: number }>
): Promise<void> {
  await octokit.pulls.createReview({
    owner,
    repo,
    pull_number,
    comments,
    event: "COMMENT",
  });
}

async function main() {
  const prDetails = await getPRDetails();
  const notifier = new Notifier({
    discordWebhookUrl: DISCORD_WEBHOOK_URL || undefined,
    slackBotToken: SLACK_BOT_TOKEN || undefined,
    slackChannelId: SLACK_CHANNEL_ID || undefined,
    slackWebhookUrl: SLACK_WEBHOOK_URL || undefined,
  });

  let diff: string | null;
  const eventData = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8")
  );
  const commitSha: string =
    eventData.after || eventData.pull_request?.head?.sha || "";

  const notificationRefs = notifier.isEnabled()
    ? await notifier.sendStart({
        repoFullName: `${prDetails.owner}/${prDetails.repo}`,
        prNumber: prDetails.pull_number,
        prTitle: prDetails.title,
        prUrl: prDetails.url,
        action: eventData.action || "unknown",
        commitSha,
      })
    : {};

  if (eventData.action === "opened") {
    diff = await getDiff(
      prDetails.owner,
      prDetails.repo,
      prDetails.pull_number
    );
  } else if (eventData.action === "synchronize") {
    const newBaseSha = eventData.before;
    const newHeadSha = eventData.after;

    const response = await octokit.repos.compareCommits({
      headers: {
        accept: "application/vnd.github.v3.diff",
      },
      owner: prDetails.owner,
      repo: prDetails.repo,
      base: newBaseSha,
      head: newHeadSha,
    });

    diff = String(response.data);
  } else {
    console.log("Unsupported event:", process.env.GITHUB_EVENT_NAME);
    return;
  }

  if (!diff) {
    console.log("No diff found");
    return;
  }

  const parsedDiff = parseDiff(diff);

  const excludePatterns = core
    .getInput("exclude")
    .split(",")
    .map((s) => s.trim());

  const filteredDiff = parsedDiff.filter((file) => {
    return !excludePatterns.some((pattern) =>
      minimatch(file.to ?? "", pattern)
    );
  });

  const analysis = await analyzeCode(filteredDiff, prDetails);
  if (analysis.comments.length > 0) {
    await createReviewComment(
      prDetails.owner,
      prDetails.repo,
      prDetails.pull_number,
      analysis.comments
    );
  }

  if (notifier.isEnabled()) {
    await notifier.sendResult(analysis.results, notificationRefs);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
