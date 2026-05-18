import { AnalyzerOutput } from "./analyzer-types.js";

function normalizeNewlines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function formatImport(entry: { from: string; kind: string }): string {
  return `from "${entry.from}", kind=${entry.kind}`;
}

function formatExport(entry: { kind: string; name: string }): string {
  return `kind=${entry.kind}, name=${entry.name}`;
}

export function analyzeJava(_filePath: string, content: string): AnalyzerOutput {
  const imports: string[] = [];
  const exports: string[] = [];
  const moduleSpecifiers: string[] = [];

  for (const raw of normalizeNewlines(content)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith("//")) continue;

    const mImport = line.match(/^import\s+(static\s+)?([A-Za-z_][\w.]*|\w+(?:\.\w+)*\.\*)\s*;\s*$/);
    if (mImport) {
      const from = mImport[2];
      moduleSpecifiers.push(from);
      imports.push(formatImport({ from, kind: mImport[1] ? "import-static" : "import" }));
      continue;
    }

    const mType = line.match(/^(?:public\s+|protected\s+|private\s+)?(class|interface|enum|record)\s+([A-Za-z_]\w*)\b/);
    if (mType) {
      exports.push(formatExport({ kind: mType[1], name: mType[2] }));
      continue;
    }
  }

  const unique = <T>(arr: T[]) => Array.from(new Set(arr));
  return { imports: unique(imports), exports: unique(exports), moduleSpecifiers: unique(moduleSpecifiers) };
}
