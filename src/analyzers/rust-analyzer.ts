import { AnalyzerOutput } from "./analyzer-types.js";

function normalizeNewlines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function toSemicolonStatements(lines: string[]): string[] {
  const out: string[] = [];
  let buf = "";
  for (const raw of lines) {
    const line = raw;
    if (buf.length === 0 && line.trim().startsWith("//")) continue;
    buf = buf.length === 0 ? line : `${buf}\n${line}`;
    if (line.includes(";")) {
      const parts = buf.split(";");
      for (let i = 0; i < parts.length - 1; i++) {
        const s = `${parts[i]};`.trim();
        if (s.length > 0) out.push(s);
      }
      buf = parts[parts.length - 1];
    }
  }
  const tail = buf.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

function formatImport(entry: { kind: string; from: string }): string {
  return `from "${entry.from}", kind=${entry.kind}`;
}

function formatExport(entry: { kind: string; name: string; vis?: string }): string {
  const parts: string[] = [];
  parts.push(`kind=${entry.kind}`);
  parts.push(`name=${entry.name}`);
  if (entry.vis) parts.push(`vis=${entry.vis}`);
  return parts.join(", ");
}

export function analyzeRust(_filePath: string, content: string): AnalyzerOutput {
  const imports: string[] = [];
  const exports: string[] = [];
  const functions: string[] = [];
  const moduleSpecifiers: string[] = [];

  const stmts = toSemicolonStatements(normalizeNewlines(content));

  for (const stmt of stmts) {
    const useMatch = stmt.match(/^\s*use\s+([\s\S]+?)\s*;\s*$/);
    if (useMatch) {
      const from = useMatch[1].replace(/\s+/g, " ").trim();
      moduleSpecifiers.push(from);
      imports.push(formatImport({ kind: "use", from }));
      continue;
    }

    const externMatch = stmt.match(/^\s*extern\s+crate\s+([A-Za-z_]\w*)\s*;\s*$/);
    if (externMatch) {
      const from = externMatch[1];
      moduleSpecifiers.push(from);
      imports.push(formatImport({ kind: "extern-crate", from }));
      continue;
    }

    const pubFn = stmt.match(/^\s*pub(\([^)]*\))?\s+(?:async\s+)?fn\s+([A-Za-z_]\w*)\b/);
    if (pubFn) {
      const vis = pubFn[1] ? `pub${pubFn[1]}` : "pub";
      const name = pubFn[2];
      functions.push(`${name}, exported`);
      exports.push(formatExport({ kind: "fn", name, vis }));
      continue;
    }

    const fn = stmt.match(/^\s*(?:async\s+)?fn\s+([A-Za-z_]\w*)\b/);
    if (fn) {
      const name = fn[1];
      functions.push(name);
      continue;
    }

    const pubItem = stmt.match(
      /^\s*pub(\([^)]*\))?\s+(struct|enum|trait|type|mod|const|static)\s+([A-Za-z_]\w*)\b/
    );
    if (pubItem) {
      const vis = pubItem[1] ? `pub${pubItem[1]}` : "pub";
      const kind = pubItem[2];
      const name = pubItem[3];
      exports.push(formatExport({ kind, name, vis }));
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
