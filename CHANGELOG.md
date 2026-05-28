# Changelog

## 1.1.0

### Token efficiency
- Rewrote the TOON encoder as a true tabular format (`F:<path>` header + `C[N]{op,ln,code}:` schema declared once, then CSV-style rows with one-char op codes).
- Encoder now operates at the file level instead of per chunk, so the file header is emitted once.
- Context-line trimming: unchanged lines beyond ±N of any `+`/`-` are dropped. Configurable via the new `CONTEXT_LINES` input (default `2`, set `0` to drop all context).
- Benchmarked result on a representative two-file diff: **~45% smaller than the previous JSON encoder**, **~20% smaller than the raw unified diff**.

### Response caching
- New `ENABLE_CACHE` input (default `true`). LLM responses are cached by SHA256 of `(model, messages)` under the runner's temp directory. Duplicate chunks within a job (common on `synchronize` events) skip the model call entirely.

### Optional Semgrep pre-pass
- New `SEMGREP_RULES` input. When set and `semgrep` is on PATH, findings are passed to Agent 1 as priors. Agent 1 still verifies before flagging, reducing false positives.

### New provider examples
- Ollama (self-hosted, fully private): `http://localhost:11434/v1`
- GitHub Models (free for public repos): `https://models.inference.ai.azure.com`

### Fix-quality
- Agent 2 now receives **semantic context** instead of a fixed line window: a zero-dependency structural scan extracts the file's imports plus the enclosing function/class (brace-balanced for C-like/JS/TS/Go, indentation-based for Python). Oversized blocks fall back to a ±15-line window; files without a resolvable block fall back to the line window too. Gives the model the enclosing signature and imports for more accurate fixes.

### Eval harness
- New `eval/` directory with a [promptfoo](https://promptfoo.dev) harness that runs known-buggy fixture diffs through the real reviewer agent and asserts the expected issue type is flagged (plus a benign diff that must produce no false positives). Run with `npm run eval` (needs `LLM_API_KEY`).
- New `Reviewer Evals` workflow (`workflow_dispatch` only) — manual, so evals never cost tokens per-PR or block merges.

### Internal
- Reviewer prompt updated to describe the new TOON format and to instruct the model to focus on added (`+`) rows.
- Orchestrator config gained `cache` and `semgrepFindings` fields.

## 1.0.0

Initial release.
