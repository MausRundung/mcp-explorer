import { AnalyzerOutput } from "./analyzer-types.js";

function normalizeNewlines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function countDeltaParens(s: string): number {
  let delta = 0;
  for (const ch of s) {
    if (ch === "(" || ch === "[" || ch === "{") delta += 1;
    else if (ch === ")" || ch === "]" || ch === "}") delta -= 1;
  }
  return delta;
}

function toLogicalStatements(lines: string[]): string[] {
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  for (const raw of lines) {
    const line = raw;
    if (buf.length === 0 && line.trim().startsWith("#")) continue;
    buf = buf.length === 0 ? line : `${buf}\n${line}`;
    depth += countDeltaParens(line);
    const endsWithBackslash = /\\\s*$/.test(line);
    if (depth <= 0 && !endsWithBackslash) {
      const s = buf.trim();
      if (s.length > 0) out.push(s);
      buf = "";
      depth = 0;
    }
  }
  const tail = buf.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

function formatImport(entry: { kind: string; from: string; alias?: string; names?: Array<{ name: string; alias?: string }> }): string {
  const parts: string[] = [];
  parts.push(`from "${entry.from}"`);
  parts.push(`kind=${entry.kind}`);
  if (entry.alias) parts.push(`alias=${entry.alias}`);
  if (entry.names && entry.names.length > 0) {
    const rendered = entry.names.map(n => (n.alias ? `${n.name} as ${n.alias}` : n.name)).join(", ");
    parts.push(`names={${rendered}}`);
  }
  return parts.join(", ");
}

function formatExport(entry: { kind: string; name: string }): string {
  return `kind=${entry.kind}, name=${entry.name}`;
}

export function analyzePython(_filePath: string, content: string): AnalyzerOutput {
  const imports: string[] = [];
  const exports: string[] = [];
  const functions: string[] = [];
  const moduleSpecifiers: string[] = [];

  const stmts = toLogicalStatements(normalizeNewlines(content));

  for (const stmt of stmts) {
    const mImport = stmt.match(/^\s*import\s+(.+)$/s);
    if (mImport) {
      const rest = mImport[1].trim();
      const parts = rest.split(",").map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        const m = p.match(/^([A-Za-z_][\w.]*)(?:\s+as\s+([A-Za-z_]\w*))?$/);
        if (!m) continue;
        const from = m[1];
        const alias = m[2];
        moduleSpecifiers.push(from);
        imports.push(formatImport({ kind: "import", from, alias }));
      }
      continue;
    }

    const mFrom = stmt.match(/^\s*from\s+([A-Za-z_][\w.]*)\s+import\s+(.+)$/s);
    if (mFrom) {
      const from = mFrom[1];
      let what = mFrom[2].trim();
      moduleSpecifiers.push(from);
      what = what.replace(/^\(/, "").replace(/\)$/, "").trim();
      if (what === "*") {
        imports.push(formatImport({ kind: "from-import", from, names: [{ name: "*" }] }));
      } else {
        const names = what
          .split(",")
          .map(s => s.trim())
          .filter(Boolean)
          .map(item => {
            const mm = item.match(/^([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?$/);
            if (!mm) return undefined;
            const name = mm[1];
            const alias = mm[2];
            return alias ? { name, alias } : { name };
          })
          .filter((x): x is { name: string; alias?: string } => !!x);
        if (names.length > 0) imports.push(formatImport({ kind: "from-import", from, names }));
      }
      continue;
    }

    const mAll = stmt.match(/^\s*__all__\s*=\s*\[([\s\S]*)\]\s*$/);
    if (mAll) {
      const inside = mAll[1];
      const names = Array.from(inside.matchAll(/["']([^"']+)["']/g)).map(m => m[1]).filter(Boolean);
      for (const n of names) exports.push(formatExport({ kind: "__all__", name: n }));
      continue;
    }

    const mDef = stmt.match(/^\s*(async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
    if (mDef) {
      const name = mDef[2];
      functions.push(name);
      exports.push(formatExport({ kind: "def", name }));
      continue;
    }

    const mClass = stmt.match(/^\s*class\s+([A-Za-z_]\w*)\s*[\(:]/);
    if (mClass) {
      const name = mClass[1];
      exports.push(formatExport({ kind: "class", name }));
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
