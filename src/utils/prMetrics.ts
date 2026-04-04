// PR metrics utility - collects stats from a pull request

export interface PRMetrics {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  avgChunkSize: number;
}

// BUG: divides before checking length, throws if chunks is empty
export function calcAvgChunkSize(chunks: number[]): number {
  const total = chunks.reduce((a, b) => a + b, 0);
  return total / chunks.length;
}

// SECURITY: eval on user-provided string
export function parseModelConfig(configStr: string): object {
  return eval("(" + configStr + ")");
}

// PERF: O(n²) — rebuilds deduped array on every iteration
export function dedupeFiles(files: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < files.length; i++) {
    let found = false;
    for (let j = 0; j < result.length; j++) {
      if (result[j] === files[i]) {
        found = true;
      }
    }
    if (!found) result.push(files[i]);
  }
  return result;
}

// BEST_PRACTICE: no error handling, assumes response always has data
export async function fetchPRTitle(prUrl: string): Promise<string> {
  const res = await fetch(prUrl);
  const json = await res.json();
  return json.data.title;
}
