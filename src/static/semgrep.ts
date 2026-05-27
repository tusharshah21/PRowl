import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface SemgrepFinding {
  file: string;
  line: number;
  ruleId: string;
  message: string;
  severity: string;
}

function semgrepAvailable(): boolean {
  const res = spawnSync("semgrep", ["--version"], { encoding: "utf8" });
  return res.status === 0;
}

/**
 * Run Semgrep against changed files using the given configs (e.g. "p/security-audit,p/owasp-top-ten").
 * Returns up to `limit` findings restricted to the file paths supplied.
 * Returns [] silently if semgrep is not installed or fails.
 */
export function runSemgrep(
  changedFiles: string[],
  configs: string,
  limit = 30
): SemgrepFinding[] {
  if (!configs.trim()) return [];
  if (!semgrepAvailable()) {
    console.log("[semgrep] not installed, skipping");
    return [];
  }
  const targets = changedFiles.filter((f) => f && fs.existsSync(f));
  if (targets.length === 0) return [];

  const outFile = path.join(os.tmpdir(), `semgrep-${Date.now()}.json`);
  const args = ["--json", "-o", outFile, "--quiet"];
  for (const c of configs.split(",").map((s) => s.trim()).filter(Boolean)) {
    args.push("--config", c);
  }
  args.push(...targets);

  const res = spawnSync("semgrep", args, { encoding: "utf8" });
  if (res.status !== 0 && res.status !== 1) {
    // 0 = clean, 1 = findings; anything else is a failure
    console.warn("[semgrep] failed:", res.stderr?.slice(0, 200));
    return [];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(outFile, "utf8"));
    const results = Array.isArray(raw.results) ? raw.results : [];
    return results.slice(0, limit).map((r: any) => ({
      file: r.path,
      line: r.start?.line ?? 0,
      ruleId: r.check_id,
      message: (r.extra?.message ?? "").split("\n")[0].slice(0, 200),
      severity: r.extra?.severity ?? "INFO",
    }));
  } catch (e) {
    console.warn("[semgrep] could not parse output:", e);
    return [];
  }
}

export function formatFindings(findings: SemgrepFinding[]): string {
  if (findings.length === 0) return "";
  return findings
    .map(
      (f) =>
        `${f.severity} ${f.file}:${f.line} [${f.ruleId}] ${f.message}`
    )
    .join("\n");
}
