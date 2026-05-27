# PRowl

**The multi-agent PR reviewer that never misses a bug.**

Open-source, self-hostable GitHub Action. Works with **any LLM provider**.

## How It Works

```mermaid
flowchart TD
    subgraph GitHub["GitHub CI/CD"]
        PR([Pull Request Opened / Updated])
        GH[GitHub API\nFetch PR Diff]
        CM[Post Inline Review\nComments with Fix Suggestions]
    end

    subgraph Action["AI Code Reviewer Action"]
        TOON[TOON Encoder\nCompact token-efficient diff]

        subgraph Orchestrator["Orchestrator Pipeline"]
            A1["Agent 1 — Reviewer\n🔍 cheap / fast model\nDetects BUG · SECURITY\nPERF · BEST_PRACTICE"]
            CHK{Issues found?}
            A2["Agent 2 — Explainer + Fixer\n🧠 smarter model\nExplanation + fixed code\nper issue · runs in parallel"]
        end
    end

    PR --> GH --> TOON --> A1 --> CHK
    CHK -- No issues --> DONE([Done — zero fixer cost])
    CHK -- Issues found --> A2 --> CM
```

1. Triggers on PR open/update
2. Fetches code diff from GitHub
3. Encodes all changed chunks into token-efficient TOON format
4. **Agent 1 (Reviewer)** — sends the full TOON diff to a cheap/fast model; detects `BUG`, `SECURITY`, `PERFORMANCE`, `BEST_PRACTICE` issues and returns a typed list
5. If no issues are found → pipeline stops; **Agent 2 is never called** (zero extra cost)
6. **Agent 2 (Explainer+Fixer)** — for each flagged chunk (not the full diff), generates an explanation and corrected code in a single LLM call; all issues are processed in parallel
7. Posts inline PR comments with: issue type label, concise explanation, and a GitHub suggestion block with the fixed code

## Features

- 🔓 **Open Source** - Self-hostable, no vendor lock-in
- 🔑 **BYOK** - Bring Your Own API Key
- 🌐 **Multi-Provider** - OpenAI, Groq, Mistral, DeepSeek, Gemini, and more
- ⚡ **Token-Efficient** - ~45% smaller than verbose JSON, ~20% smaller than raw unified diff (benchmarked) thanks to TOON encoding + context trimming
- 🧪 **Optional Semgrep pre-pass** - Free static analyzer flags candidates; LLM verifies and explains
- 💾 **Response caching** - Identical chunks within a job are not re-billed
- 🤖 **2-Agent Pipeline** - Cheap model detects issues; smarter model explains and fixes them
- 💰 **Zero Downstream Cost** - Fixer agent is skipped entirely when no issues are found

## Supported Providers

Works with any OpenAI-compatible API:

| Provider | Free Tier? | Base URL |
|----------|------------|----------|
| [OpenAI](https://platform.openai.com) | No | *(default)* |
| [Groq](https://groq.com) | ✅ Yes | `https://api.groq.com/openai/v1` |
| [DeepSeek](https://platform.deepseek.com) | ✅ Yes | `https://api.deepseek.com/v1` |
| [Mistral](https://mistral.ai) | ✅ Yes | `https://api.mistral.ai/v1` |
| [Together AI](https://together.ai) | ✅ Yes | `https://api.together.xyz/v1` |
| [Fireworks](https://fireworks.ai) | ✅ Yes | `https://api.fireworks.ai/inference/v1` |
| [OpenRouter](https://openrouter.ai) | No | `https://openrouter.ai/api/v1` |
| [Google Gemini](https://ai.google.dev) | ✅ Yes | `https://generativelanguage.googleapis.com/v1beta/openai` |
| [Ollama](https://ollama.com) (self-hosted, 100% private) | ✅ Free | `http://localhost:11434/v1` |
| [GitHub Models](https://github.com/marketplace/models) | ✅ Free for public repos | `https://models.inference.ai.azure.com` |

## Quick Start

### 1. Get an API Key

Pick any provider above. For free options, try **Groq** or **DeepSeek**.

### 2. Add Secret to Your Repo

Go to: **Settings → Secrets → Actions → New repository secret**
- Name: `LLM_API_KEY`
- Value: Your API key

### 3. Create Workflow

Create `.github/workflows/ai-review.yml`:

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: tusharshah21/ai-code-reviewer@main
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
          LLM_MODEL: "gpt-4o"

# Optional: Discord + Slack notifications

Add any of these optional secrets if you want commit-trigger and review-result notifications in chat:

- `DISCORD_WEBHOOK_URL` for Discord channel notifications
- `SLACK_BOT_TOKEN` + `SLACK_CHANNEL_ID` for threaded Slack notifications (recommended)
- `SLACK_WEBHOOK_URL` for basic Slack notifications (fallback, non-threaded)

Example:

```yaml
      - uses: tusharshah21/ai-code-reviewer@main
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
          LLM_MODEL: "gpt-4o"
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
          SLACK_CHANNEL_ID: ${{ secrets.SLACK_CHANNEL_ID }}
```
```

That's it! PRs will now get AI reviews with explanation and fix suggestions.

#### Optional: Use separate models for detection vs. fixing

```yaml
      - uses: tusharshah21/ai-code-reviewer@main
        with:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
          LLM_REVIEWER_MODEL: "gpt-4o-mini"   # cheap & fast for triage
          LLM_FIXER_MODEL: "gpt-4o"           # smarter for explanations & fixes
```

---

## Provider Examples

### OpenAI (default)
```yaml
LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}
LLM_MODEL: "gpt-4o"
```

### Groq (FREE & Fast)
```yaml
LLM_API_KEY: ${{ secrets.GROQ_API_KEY }}
LLM_MODEL: "llama-3.3-70b-versatile"
LLM_BASE_URL: "https://api.groq.com/openai/v1"
```

### DeepSeek (FREE & Cheap)
```yaml
LLM_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
LLM_MODEL: "deepseek-chat"
LLM_BASE_URL: "https://api.deepseek.com/v1"
```

### Mistral AI
```yaml
LLM_API_KEY: ${{ secrets.MISTRAL_API_KEY }}
LLM_MODEL: "mistral-large-latest"
LLM_BASE_URL: "https://api.mistral.ai/v1"
```

### Google Gemini
```yaml
LLM_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
LLM_MODEL: "gemini-1.5-flash"
LLM_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai"
```

### Together AI
```yaml
LLM_API_KEY: ${{ secrets.TOGETHER_API_KEY }}
LLM_MODEL: "meta-llama/Llama-3.3-70B-Instruct-Turbo"
LLM_BASE_URL: "https://api.together.xyz/v1"
```

### OpenRouter (100+ models)
```yaml
LLM_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
LLM_MODEL: "anthropic/claude-3.5-sonnet"
LLM_BASE_URL: "https://openrouter.ai/api/v1"
```

### Ollama (self-hosted, fully private — runs on your own runner)
```yaml
LLM_API_KEY: "ollama"   # any non-empty string; Ollama ignores it
LLM_MODEL: "qwen2.5-coder:7b"
LLM_BASE_URL: "http://localhost:11434/v1"
```

### GitHub Models (free for public repos)
```yaml
LLM_API_KEY: ${{ secrets.GITHUB_TOKEN }}
LLM_MODEL: "gpt-4o-mini"
LLM_BASE_URL: "https://models.inference.ai.azure.com"
```

---

## Configuration

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `GITHUB_TOKEN` | Yes | - | Auto-provided by GitHub |
| `LLM_API_KEY` | Yes | - | Your provider's API key |
| `LLM_MODEL` | No | `gpt-4o` | Model used by **both** agents. If you only set this, both agents run on the same model. Set `LLM_REVIEWER_MODEL` / `LLM_FIXER_MODEL` to split them. |
| `LLM_BASE_URL` | No | OpenAI | Provider's API endpoint |
| `LLM_REVIEWER_MODEL` | No | `LLM_MODEL` | Fast/cheap model for issue detection (Agent 1). Overrides `LLM_MODEL` for Agent 1 only. |
| `LLM_FIXER_MODEL` | No | `LLM_MODEL` | Smarter model for explanation and fix generation (Agent 2). Overrides `LLM_MODEL` for Agent 2 only. |
| `exclude` | No | - | Files to skip (glob patterns) |
| `CONTEXT_LINES` | No | `2` | Unchanged lines kept around each `+`/`-` in the TOON diff. Lower = cheaper, higher = more context. Set `0` to drop all context. |
| `ENABLE_CACHE` | No | `true` | Cache LLM responses by hash of (model, messages) for the duration of the job. Set `false` to disable. |
| `SEMGREP_RULES` | No | - | Optional Semgrep rulesets (e.g. `p/security-audit,p/owasp-top-ten`). When set and `semgrep` is on PATH, findings are passed to Agent 1 as priors. |
| `DISCORD_WEBHOOK_URL` | No | - | Posts a start message (commit/PR context) and a reply with reviewer results to Discord. |
| `SLACK_BOT_TOKEN` | No | - | Slack bot token (`xoxb-...`) used for threaded messages via `chat.postMessage`. |
| `SLACK_CHANNEL_ID` | No | - | Slack channel ID for bot-thread notifications. Used with `SLACK_BOT_TOKEN`. |
| `SLACK_WEBHOOK_URL` | No | - | Slack incoming webhook fallback (non-threaded) when bot token/channel are not provided. |

---

---

## Token efficiency (benchmarked)

Measured on a representative two-file diff (auth fix + util change):

| Format | Chars | ~Tokens |
|---|---|---|
| Raw unified diff | 1,401 | ~351 |
| Verbose per-chunk JSON | 2,055 | ~514 |
| **Compact TOON (this action)** | **1,126** | **~282** |

That's **~45% smaller than verbose JSON** and **~20% smaller than the raw unified diff** the model would otherwise see. Drop `CONTEXT_LINES` to `0` for further savings on huge PRs.

## Semgrep pre-pass (optional)

If you set `SEMGREP_RULES` and have `semgrep` installed on the runner, PRowl will:

1. Run Semgrep against changed files with the rulesets you choose
2. Pass the findings to Agent 1 as **priors** — Agent 1 still verifies and filters false positives
3. Agent 2 explains and proposes a fix

```yaml
- run: pip install semgrep
- uses: tusharshah21/ai-code-reviewer@main
  with:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
    SEMGREP_RULES: "p/security-audit,p/owasp-top-ten"
```

## Cost Comparison

Example for reviewing 1000 lines (with TOON + caching):

| Provider | Model | Cost/Review |
|----------|-------|-------------|
| Groq | Llama 3.3 70B | **FREE** |
| DeepSeek | DeepSeek Chat | ~$0.001 |
| OpenAI | GPT-4o | ~$0.02 |
| OpenAI | GPT-4o-mini | ~$0.002 |

---

## Presentation

[View the PRowl pitch deck →](https://gamma.app/docs/The-multi-agent-PR-reviewer-that-never-misses-a-bug-di1s9mpkpq1kcb8)

---

## License

MIT - Free and open source
#PRowl