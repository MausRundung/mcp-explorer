import { AnalyzerOutput } from "./analyzer-types.js";

function normalizeNewlines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function isExportedGoIdent(name: string): boolean {
  const c = name.charCodeAt(0);
  return c >= 65 && c <= 90;
}

function formatImport(entry: { from: string; alias?: string; kind: string }): string {
  const parts: string[] = [];
  parts.push(`from "${entry.from}"`);
  parts.push(`kind=${entry.kind}`);
  if (entry.alias) parts.push(`alias=${entry.alias}`);
  return parts.join(", ");
}

function formatExport(entry: { kind: string; name: string }): string {
  return `kind=${entry.kind}, name=${entry.name}`;
}

export function analyzeGo(_filePath: string, content: string): AnalyzerOutput {
  const imports: string[] = [];
  const exports: string[] = [];
  const functions: string[] = [];
  const moduleSpecifiers: string[] = [];

  const lines = normalizeNewlines(content);
  let inImportBlock = false;
  let inConstBlock = false;
  let inVarBlock = false;
  let inTypeBlock = false;

  const pushImport = (from: string, alias?: string) => {
    moduleSpecifiers.push(from);
    imports.push(formatImport({ from, alias, kind: "import" }));
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    if (line.startsWith("//")) continue;

    if (!inImportBlock) {
      const mStart = line.match(/^import\s*\(\s*$/);
      if (mStart) {
        inImportBlock = true;
        continue;
      }

      const mSingle = line.match(/^import\s+(?:(\w+|_|\.)\s+)?\"([^\"]+)\"\s*$/);
      if (mSingle) {
        const alias = mSingle[1];
        const from = mSingle[2];
        pushImport(from, alias);
        continue;
      }
    } else {
      if (line.startsWith(")")) {
        inImportBlock = false;
        continue;
      }
      const m = line.match(/^(?:(\w+|_|\.)\s+)?\"([^\"]+)\"/);
      if (m) {
        const alias = m[1];
        const from = m[2];
        pushImport(from, alias);
        continue;
      }
    }

    if (!inConstBlock && line.match(/^const\s*\(\s*$/)) {
      inConstBlock = true;
      continue;
    }
    if (inConstBlock) {
      if (line.startsWith(")")) {
        inConstBlock = false;
        continue;
      }
      const m = line.match(/^([A-Za-z_]\w*)\b/);
      if (m && isExportedGoIdent(m[1])) exports.push(formatExport({ kind: "const", name: m[1] }));
      continue;
    }

    if (!inVarBlock && line.match(/^var\s*\(\s*$/)) {
      inVarBlock = true;
      continue;
    }
    if (inVarBlock) {
      if (line.startsWith(")")) {
        inVarBlock = false;
        continue;
      }
      const m = line.match(/^([A-Za-z_]\w*)\b/);
      if (m && isExportedGoIdent(m[1])) exports.push(formatExport({ kind: "var", name: m[1] }));
      continue;
    }

    if (!inTypeBlock && line.match(/^type\s*\(\s*$/)) {
      inTypeBlock = true;
      continue;
    }
    if (inTypeBlock) {
      if (line.startsWith(")")) {
        inTypeBlock = false;
        continue;
      }
      const m = line.match(/^([A-Za-z_]\w*)\b/);
      if (m && isExportedGoIdent(m[1])) exports.push(formatExport({ kind: "type", name: m[1] }));
      continue;
    }

    const mFunc = line.match(/^func\s+(?:\([^\)]*\)\s*)?([A-Za-z_]\w*)\s*\(/);
    if (mFunc) {
      const name = mFunc[1];
      functions.push(name);
      if (isExportedGoIdent(name)) exports.push(formatExport({ kind: "func", name }));
      continue;
    }

    const mType = line.match(/^type\s+([A-Za-z_]\w*)\b/);
    if (mType) {
      const name = mType[1];
      if (isExportedGoIdent(name)) exports.push(formatExport({ kind: "type", name }));
      continue;
    }

    const mConst = line.match(/^const\s+([A-Za-z_]\w*)\b/);
    if (mConst) {
      const name = mConst[1];
      if (isExportedGoIdent(name)) exports.push(formatExport({ kind: "const", name }));
      continue;
    }

    const mVar = line.match(/^var\s+([A-Za-z_]\w*)\b/);
    if (mVar) {
      const name = mVar[1];
      if (isExportedGoIdent(name)) exports.push(formatExport({ kind: "var", name }));
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
