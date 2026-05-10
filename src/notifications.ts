import { ReviewResult } from "./orchestrator";

interface NotificationConfig {
  discordWebhookUrl?: string;
  slackBotToken?: string;
  slackChannelId?: string;
  slackWebhookUrl?: string;
}

interface NotificationContext {
  repoFullName: string;
  prNumber: number;
  prTitle: string;
  prUrl: string;
  action: string;
}

interface NotificationThreadRefs {
  discordMessageId?: string;
  slackThreadTs?: string;
}

function appendWaitQuery(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}wait=true`;
}

async function postJson(url: string, payload: Record<string, unknown>, headers?: Record<string, string>): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    body: JSON.stringify(payload),
  });
}

function buildStartMessage(context: NotificationContext): string {
  return [
    `AI review started for ${context.repoFullName}`,
    `PR #${context.prNumber}: ${context.prTitle}`,
    `PR: ${context.prUrl}`,
    `Event: ${context.action}`,
  ].join("\n");
}

function truncate(input: string, maxLength: number): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function buildResultMessage(results: ReviewResult[]): string {
  if (results.length === 0) {
    return "Review finished: no issues found by the reviewer.";
  }

  const lines = results.slice(0, 3).map((result, index) => {
    const explanation = truncate(result.explanation, 220);
    return [
      `${index + 1}. [${result.issueType}] ${result.file}:${result.lineNumber}`,
      `   Detail: ${explanation}`,
    ].join("\n");
  });

  const extraCount = results.length - lines.length;
  if (extraCount > 0) {
    lines.push(`...and ${extraCount} more issue(s).`);
  }

  return [
    `Review finished: ${results.length} issue(s) found.`,
    "Top findings:",
    ...lines,
  ].join("\n");
}

export class Notifier {
  private config: NotificationConfig;

  constructor(config: NotificationConfig) {
    this.config = config;
  }

  isEnabled(): boolean {
    return Boolean(
      this.config.discordWebhookUrl ||
        this.config.slackWebhookUrl ||
        (this.config.slackBotToken && this.config.slackChannelId)
    );
  }

  async sendStart(context: NotificationContext): Promise<NotificationThreadRefs> {
    const message = buildStartMessage(context);
    const refs: NotificationThreadRefs = {};

    if (this.config.discordWebhookUrl) {
      try {
        const response = await postJson(appendWaitQuery(this.config.discordWebhookUrl), {
          content: message,
        });
        if (response.ok) {
          const data = (await response.json()) as { id?: string };
          refs.discordMessageId = data.id;
        } else {
          console.warn("Discord start notification failed:", response.status);
        }
      } catch (error) {
        console.warn("Discord start notification error:", error);
      }
    }

    if (this.config.slackBotToken && this.config.slackChannelId) {
      try {
        const response = await postJson(
          "https://slack.com/api/chat.postMessage",
          {
            channel: this.config.slackChannelId,
            text: message,
          },
          {
            Authorization: `Bearer ${this.config.slackBotToken}`,
          }
        );

        const data = (await response.json()) as { ok?: boolean; ts?: string; error?: string };
        if (response.ok && data.ok && data.ts) {
          refs.slackThreadTs = data.ts;
        } else {
          console.warn("Slack start notification failed:", data.error || response.status);
        }
      } catch (error) {
        console.warn("Slack start notification error:", error);
      }
    } else if (this.config.slackWebhookUrl) {
      try {
        const response = await postJson(this.config.slackWebhookUrl, { text: message });
        if (!response.ok) {
          console.warn("Slack webhook start notification failed:", response.status);
        }
      } catch (error) {
        console.warn("Slack webhook start notification error:", error);
      }
    }

    return refs;
  }

  async sendResult(results: ReviewResult[], refs: NotificationThreadRefs): Promise<void> {
    const message = buildResultMessage(results);

    if (this.config.discordWebhookUrl) {
      try {
        const payload: Record<string, unknown> = { content: message };
        if (refs.discordMessageId) {
          payload.message_reference = { message_id: refs.discordMessageId };
          payload.allowed_mentions = { replied_user: false };
        }

        const response = await postJson(this.config.discordWebhookUrl, payload);
        if (!response.ok) {
          console.warn("Discord result notification failed:", response.status);
        }
      } catch (error) {
        console.warn("Discord result notification error:", error);
      }
    }

    if (this.config.slackBotToken && this.config.slackChannelId) {
      try {
        const payload: Record<string, unknown> = {
          channel: this.config.slackChannelId,
          text: message,
        };
        if (refs.slackThreadTs) {
          payload.thread_ts = refs.slackThreadTs;
        }

        const response = await postJson(
          "https://slack.com/api/chat.postMessage",
          payload,
          {
            Authorization: `Bearer ${this.config.slackBotToken}`,
          }
        );

        const data = (await response.json()) as { ok?: boolean; error?: string };
        if (!response.ok || !data.ok) {
          console.warn("Slack result notification failed:", data.error || response.status);
        }
      } catch (error) {
        console.warn("Slack result notification error:", error);
      }
    } else if (this.config.slackWebhookUrl) {
      try {
        const response = await postJson(this.config.slackWebhookUrl, { text: message });
        if (!response.ok) {
          console.warn("Slack webhook result notification failed:", response.status);
        }
      } catch (error) {
        console.warn("Slack webhook result notification error:", error);
      }
    }
  }
}
