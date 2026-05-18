import * as fs from "fs";
import * as path from "path";

const DEFAULT_EXCLUDED_DIRS = [".git", "node_modules", ".next", "dist", "build", "#export", ".vscode", ".gradle", ".idea"];

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

export function suggestStrings(input: string, candidates: string[], limit: number = 5): string[] {
  const query = normalizeToken(input);
  if (!query) return [];

  const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
  const scored = uniqueCandidates.map((candidate) => {
    const c = normalizeToken(candidate);
    const distance = levenshteinDistance(query, c);
    const prefixBonus = c.startsWith(query) ? -Math.min(3, query.length) : 0;
    const containsBonus = c.includes(query) ? -1 : 0;
    const score = distance + prefixBonus + containsBonus;
    return { candidate, score };
  });

  scored.sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate));
  return scored.slice(0, limit).map((s) => s.candidate);
}

export function suggestExistingPathsSync(targetPath: string, limit: number = 5, directoriesOnly: boolean = false): string[] {
  const parentDir = path.dirname(targetPath);
  const wantedName = path.basename(targetPath);
  if (!wantedName) return [];

  try {
    if (!fs.existsSync(parentDir)) return [];
    const entries = fs.readdirSync(parentDir, { withFileTypes: true });
    const names = entries
      .filter((e) => (directoriesOnly ? e.isDirectory() : true))
      .map((e) => e.name);
    const suggestedNames = suggestStrings(wantedName, names, limit);
    return suggestedNames.map((name) => path.join(parentDir, name));
  } catch {
    return [];
  }
}

export async function findPackageJsonDirs(startDirectory: string, maxDepth: number = 4, limit: number = 5): Promise<string[]> {
  const results: string[] = [];
  const visited = new Set<string>();

  const normalizedStart = path.normalize(startDirectory);
  const queue: Array<{ dir: string; depth: number }> = [{ dir: normalizedStart, depth: 0 }];

  while (queue.length > 0 && results.length < limit) {
    const next = queue.shift();
    if (!next) break;

    const dir = next.dir;
    if (visited.has(dir)) continue;
    visited.add(dir);

    const base = path.basename(dir);
    if (DEFAULT_EXCLUDED_DIRS.includes(base)) continue;

    const packageJsonPath = path.join(dir, "package.json");
    try {
      const stat = await fs.promises.stat(packageJsonPath);
      if (stat.isFile()) {
        results.push(dir);
        continue;
      }
    } catch {}

    if (next.depth >= maxDepth) continue;

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (DEFAULT_EXCLUDED_DIRS.includes(entry.name)) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: next.depth + 1 });
    }
  }

  return results;
}

