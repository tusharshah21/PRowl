import * as fs from "fs";

const MAX_BLOCK_LINES = 120;
const MAX_IMPORT_LINES = 40;
const FALLBACK_RADIUS = 15;

type Style = "brace" | "indent";

const INDENT_EXTS = new Set(["py", "pyi"]);
const BRACE_EXTS = new Set([
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "go", "java", "c", "h", "cc", "cpp", "hpp", "cs",
  "rs", "kt", "kts", "swift", "scala", "php", "rb",
]);

function styleFor(ext: string): Style {
  if (INDENT_EXTS.has(ext)) return "indent";
  return "brace"; // default; brace-balance degrades gracefully on unknown langs
}

const IMPORT_PATTERNS: RegExp[] = [
  /^\s*import\b/,                       // JS/TS/Java/Python/Go/Kotlin/Swift
  /^\s*export\s+.*\bfrom\b/,            // TS re-exports
  /^\s*from\s+\S+\s+import\b/,          // Python
  /^\s*(const|let|var)\s+.*=\s*require\(/, // CommonJS
  /^\s*#include\b/,                     // C/C++
  /^\s*using\b/,                        // C#
  /^\s*use\b/,                          // Rust/PHP
  /^\s*require(_relative)?\b/,          // Ruby
  /^\s*package\b/,                      // Go/Java package decl (cheap, useful)
];

function collectImports(lines: string[]): string[] {
  const out: string[] = [];
  // Scan only the head of the file; stop after a run of non-import code so we
  // don't sweep the whole file on languages without a clear import block.
  let sinceLastImport = 0;
  for (let i = 0; i < lines.length && out.length < MAX_IMPORT_LINES; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (IMPORT_PATTERNS.some((re) => re.test(line))) {
      out.push(`${i + 1}: ${line}`);
      sinceLastImport = 0;
    } else {
      sinceLastImport++;
      if (sinceLastImport > 8) break;
    }
  }
  return out;
}

const BLOCK_SIGNATURE =
  /\b(function|class|interface|struct|enum|impl|trait|def|fn|func|public|private|protected|static|async|export|const)\b/;

// Walk the prefix [0..targetIdx] tracking a stack of line indices that opened a
// still-open `{`. The innermost still-open block that looks like a declaration
// is the enclosing function/class; otherwise fall back to the innermost block.
function enclosingBraceBlock(
  lines: string[],
  targetIdx: number
): { start: number; end: number } | null {
  const openStack: number[] = [];
  let inBlockComment = false;

  for (let i = 0; i <= targetIdx; i++) {
    const raw = lines[i];
    for (let c = 0; c < raw.length; c++) {
      const ch = raw[c];
      const next = raw[c + 1];
      if (inBlockComment) {
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          c++;
        }
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        c++;
        continue;
      }
      if (ch === "/" && next === "/") break; // rest of line is a comment
      if (ch === "{") openStack.push(i);
      else if (ch === "}") openStack.pop();
    }
  }

  if (openStack.length === 0) return null;

  let start = openStack[openStack.length - 1];
  for (let s = openStack.length - 1; s >= 0; s--) {
    if (BLOCK_SIGNATURE.test(lines[openStack[s]])) {
      start = openStack[s];
      break;
    }
  }

  // Pull in a multi-line signature that precedes the opening brace line.
  while (
    start > 0 &&
    !BLOCK_SIGNATURE.test(lines[start]) &&
    BLOCK_SIGNATURE.test(lines[start - 1])
  ) {
    start--;
  }

  // Find the matching close brace from `start`.
  let depth = 0;
  let started = false;
  let end = lines.length - 1;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") {
        depth++;
        started = true;
      } else if (ch === "}") {
        depth--;
      }
    }
    if (started && depth <= 0) {
      end = i;
      break;
    }
  }

  return { start, end };
}

// Python-style: the enclosing def/class is the nearest line above the target
// with strictly smaller indentation that starts a def/class block.
function enclosingIndentBlock(
  lines: string[],
  targetIdx: number
): { start: number; end: number } | null {
  const indentOf = (s: string) => s.length - s.replace(/^\s*/, "").length;
  const targetIndent = indentOf(lines[targetIdx]);

  let start = -1;
  let headerIndent = 0;
  for (let i = targetIdx; i >= 0; i--) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const ind = indentOf(line);
    if (ind < targetIndent && /^\s*(async\s+def|def|class)\b/.test(line)) {
      start = i;
      headerIndent = ind;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length - 1;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    if (indentOf(line) <= headerIndent) {
      end = i - 1;
      break;
    }
  }
  return { start, end };
}

function numbered(lines: string[], lo: number, hi: number): string {
  const out: string[] = [];
  for (let i = lo; i <= hi; i++) out.push(`${i + 1}: ${lines[i]}`);
  return out.join("\n");
}

/**
 * Returns the file's imports plus the function/class enclosing `line`, each
 * prefixed with its 1-based line number. Falls back to a ±15-line window when
 * no enclosing block can be resolved. Returns null if the file is unavailable.
 */
export function extractSemanticContext(
  filePath: string,
  line: number
): string | null {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    const targetIdx = Math.min(Math.max(line - 1, 0), lines.length - 1);
    const ext = (filePath.split(".").pop() || "").toLowerCase();
    const style = styleFor(ext);

    let block =
      style === "indent"
        ? enclosingIndentBlock(lines, targetIdx)
        : enclosingBraceBlock(lines, targetIdx);

    // Cap oversized blocks to a window around the target so a 2000-line file
    // doesn't blow the prompt budget.
    if (block && block.end - block.start > MAX_BLOCK_LINES) {
      block = {
        start: Math.max(block.start, targetIdx - FALLBACK_RADIUS),
        end: Math.min(block.end, targetIdx + FALLBACK_RADIUS),
      };
    }

    if (!block) {
      const lo = Math.max(0, targetIdx - FALLBACK_RADIUS);
      const hi = Math.min(lines.length - 1, targetIdx + FALLBACK_RADIUS);
      block = { start: lo, end: hi };
    }

    const imports = collectImports(lines);
    const parts: string[] = [];
    // Don't repeat import lines if the enclosing block already covers the head.
    const importsBelowBlock = imports.length > 0 && block.start > MAX_IMPORT_LINES;
    if (imports.length > 0 && importsBelowBlock) {
      parts.push("Imports:", imports.join("\n"), "");
    }
    parts.push("Enclosing block (line: code):", numbered(lines, block.start, block.end));
    return parts.join("\n");
  } catch {
    return null;
  }
}
