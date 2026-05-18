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

function formatExport(entry: { kind: string; name: string }): string {
  return `kind=${entry.kind}, name=${entry.name}`;
}

export function analyzeKotlin(_filePath: string, content: string): AnalyzerOutput {
  const imports: string[] = [];
  const exports: string[] = [];
  const functions: string[] = [];
  const moduleSpecifiers: string[] = [];

  for (const raw of normalizeNewlines(content)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith("//")) continue;

    const mImport = line.match(/^import\s+([A-Za-z_][\w.]*)(?:\s+as\s+([A-Za-z_]\w*))?\s*$/);
    if (mImport) {
      const from = mImport[1];
      const alias = mImport[2];
      moduleSpecifiers.push(from);
      imports.push(formatImport({ from, alias, kind: "import" }));
      continue;
    }

    const mDecl = line.match(/^(?:public\s+|internal\s+)?(class|interface|object|fun|val|var|typealias)\s+([A-Za-z_]\w*)\b/);
    if (mDecl) {
      const kind = mDecl[1];
      const name = mDecl[2];
      exports.push(formatExport({ kind, name }));
      if (kind === "fun") functions.push(name);
      continue;
    }
  }

  const unique = <T>(arr: T[]) => Array.from(new Set(arr));
  return {
    imports: unique(imports),
    exports: unique(exports),
    functions: unique(functions),
    moduleSpecifiers: unique(moduleSpecifiers)
  };
}
