/**
 * TOON (Token-Oriented Object Notation) Encoder
 * Converts PR diff data into compact, token-efficient format
 */

import { Chunk, File } from "parse-diff";

export interface TOONDiff {
  file: string;
  changes: TOONChange[];
}

export interface TOONChange {
  ln?: number;  // line number (for additions/modifications)
  ln2?: number; // old line number (for deletions)
  type: "add" | "del" | "normal";
  content: string;
}

/**
 * Encodes a single file chunk into TOON format
 * TOON format is optimized for token efficiency:
 * - Uses abbreviations (ln, del, add)
 * - Removes unnecessary whitespace
 * - Compact JSON structure
 */
export function encodeDiffToTOON(file: File, chunk: Chunk): string {
  const toonDiff: TOONDiff = {
    file: file.to || file.from || "unknown",
    changes: chunk.changes.map((change) => {
      const toonChange: TOONChange = {
        type: change.type as "add" | "del" | "normal",
        content: change.content,
      };

      // Only include line numbers that exist
      if ("ln" in change && change.ln !== undefined) {
        toonChange.ln = change.ln;
      }
      if ("ln2" in change && change.ln2 !== undefined) {
        toonChange.ln2 = change.ln2;
      }

      return toonChange;
    }),
  };

  // Return compact JSON (no pretty printing to save tokens)
  return JSON.stringify(toonDiff);
}

/**
 * Creates a complete TOON-formatted prompt for code review
 */
export function createTOONPrompt(
  file: File,
  chunk: Chunk,
  prTitle: string,
  prDescription: string
): string {
  const toonData = encodeDiffToTOON(file, chunk);
  const fileExt = (file.to || file.from || "").split(".").pop() || "";

  return `You are a senior code reviewer. Analyze the diff and identify ONLY critical issues.

REVIEW FOCUS (priority order):
1. 🔴 BUGS: Logic errors, null/undefined risks, off-by-one, race conditions
2. 🟠 SECURITY: Injection, XSS, hardcoded secrets, unsafe eval, SQL injection
3. 🟡 PERFORMANCE: O(n²) in loops, memory leaks, unnecessary re-renders
4. 🔵 BEST PRACTICES: Error handling, edge cases, type safety

SKIP (do not comment on):
- Style/formatting (let linters handle)
- Minor naming suggestions
- "Consider using X" without clear benefit
- Adding comments to code
- Positive feedback

OUTPUT FORMAT (strict JSON):
{"reviews":[{"lineNumber":<line>,"reviewComment":"**[BUG|SECURITY|PERF|ISSUE]** <concise problem + fix>"}]}

If no issues found, return: {"reviews":[]}

PR: ${prTitle}${prDescription ? ` | ${prDescription}` : ""}
File: ${file.to || file.from}${fileExt ? ` (${fileExt})` : ""}

TOON:
${toonData}`;
}
