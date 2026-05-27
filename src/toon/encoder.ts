/**
 * TOON (Token-Oriented Object Notation) Encoder
 *
 * Compact tabular encoding for PR diffs. Declares a row schema once per file
 * instead of repeating field names on every change row, and strips unchanged
 * context lines beyond a small window around any add/del.
 *
 * Format:
 *   F:<path>
 *   C[N]{op,ln,code}:
 *   <op>,<ln>,<json-quoted-code>
 *   ...
 *
 * op is "+" (add), "-" (del), or " " (context).
 */

import { Chunk, File } from "parse-diff";

export interface EncodeOptions {
  contextLines?: number; // unchanged lines kept around each +/- run (default 2)
}

interface Row {
  op: "+" | "-" | " ";
  ln: number;
  code: string;
}

function stripLeadingMarker(content: string, op: string): string {
  if (content.length > 0 && content[0] === op) return content.slice(1);
  return content;
}

function rowsFromChunk(chunk: Chunk, contextLines: number): Row[] {
  const changes = chunk.changes;
  const keep = new Array(changes.length).fill(false);

  for (let i = 0; i < changes.length; i++) {
    if (changes[i].type !== "normal") {
      const lo = Math.max(0, i - contextLines);
      const hi = Math.min(changes.length - 1, i + contextLines);
      for (let j = lo; j <= hi; j++) keep[j] = true;
    }
  }

  const rows: Row[] = [];
  for (let i = 0; i < changes.length; i++) {
    if (!keep[i]) continue;
    const c: any = changes[i];
    const op: "+" | "-" | " " =
      c.type === "add" ? "+" : c.type === "del" ? "-" : " ";
    const ln: number =
      c.type === "normal"
        ? (c.ln2 ?? c.ln1 ?? 0)
        : (c.ln ?? 0);
    rows.push({ op, ln, code: stripLeadingMarker(c.content ?? "", op) });
  }
  return rows;
}

/**
 * Encode a list of parsed diff files into a single compact TOON string.
 * This is the primary encoder used by the action.
 */
export function encodeFilesToTOON(
  files: File[],
  opts: EncodeOptions = {}
): string {
  const ctx = opts.contextLines ?? 2;
  const out: string[] = [];

  for (const file of files) {
    if (file.to === "/dev/null") continue;
    const path = file.to || file.from || "unknown";

    const rows: Row[] = [];
    for (const chunk of file.chunks) {
      rows.push(...rowsFromChunk(chunk, ctx));
    }
    if (rows.length === 0) continue;

    out.push(`F:${path}`);
    out.push(`C[${rows.length}]{op,ln,code}:`);
    for (const r of rows) {
      out.push(`${r.op},${r.ln},${JSON.stringify(r.code)}`);
    }
  }

  return out.join("\n");
}

/**
 * Legacy per-chunk encoder kept for backward compatibility with any external
 * callers. Internally we now build the TOON document at the file level via
 * encodeFilesToTOON.
 */
export function encodeDiffToTOON(file: File, chunk: Chunk): string {
  return encodeFilesToTOON([{ ...file, chunks: [chunk] } as File]);
}
