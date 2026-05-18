import { AnalyzerOutput } from "./analyzer-types.js";

function normalizeNewlines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function formatImport(entry: { from: string; kind: string; alias?: string }): string {
  const parts: string[] = [];
  parts.push(`from "${entry.from}"`);
  parts.push(`kind=${entry.kind}`);
  if (entry.alias) parts.push(`alias=${entry.alias}`);
  return parts.join(", ");
}

function formatExport(entry: { kind: string; name: string; vis?: string }): string {
  const parts: string[] = [];
  parts.push(`kind=${entry.kind}`);
  parts.push(`name=${entry.name}`);
  if (entry.vis) parts.push(`vis=${entry.vis}`);
  return parts.join(", ");
}

export function analyzeCSharp(_filePath: string, content: string): AnalyzerOutput {
  const imports: string[] = [];
  const exports: string[] = [];
  const moduleSpecifiers: string[] = [];

  for (const raw of normalizeNewlines(content)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith("//")) continue;

    const mUsing = line.match(/^using\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z_][\w.]*)\s*;\s*$/);
    if (mUsing) {
      const alias = mUsing[1];
      const from = mUsing[2];
      moduleSpecifiers.push(from);
      imports.push(formatImport({ from, alias, kind: "using-alias" }));
      continue;
    }

    const mUsingNs = line.match(/^using\s+([A-Za-z_][\w.]*)\s*;\s*$/);
    if (mUsingNs) {
      const from = mUsingNs[1];
      moduleSpecifiers.push(from);
      imports.push(formatImport({ from, kind: "using" }));
      continue;
    }

    const mType = line.match(/^(public|internal)\s+(?:partial\s+)?(class|interface|enum|struct|record)\s+([A-Za-z_]\w*)\b/);
    if (mType) {
      const vis = mType[1];
      const kind = mType[2];
      const name = mType[3];
      exports.push(formatExport({ kind, name, vis }));
      continue;
    }
  }

  const unique = <T>(arr: T[]) => Array.from(new Set(arr));
  return { imports: unique(imports), exports: unique(exports), moduleSpecifiers: unique(moduleSpecifiers) };
}
