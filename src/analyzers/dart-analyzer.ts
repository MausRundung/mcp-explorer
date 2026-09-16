import { AnalyzerOutput } from "./analyzer-types.js";

// NOTE: built via char codes to keep this file free of CR/LF escape literals, which
// some editors/patch tooling silently converts to real newlines.
const NL = String.fromCharCode(10);
const CR = String.fromCharCode(13);

function normalizeNewlines(content: string): string[] {
  return content.split(CR + NL).join(NL).split(CR).join(NL).split(NL);
}

// Dart directives (`import ... show A,\n  B;`) and function signatures (`Widget build(\n  BuildContext context,\n) {`)
// commonly span multiple lines. Join physical lines into logical statements: accumulate
// while parentheses are unbalanced, or while a started statement has no terminator yet
// (`;` for directives/expressions, `{`/`=>` for declarations).
function toLogicalStatements(content: string): string[] {
  const out: string[] = [];
  let buf = "";
  let depth = 0;

  for (const raw of normalizeNewlines(content)) {
    const line = raw.trim();

    // Standalone comment/annotation-free short lines pass straight through so they can
    // be skipped without corrupting the accumulator below.
    if (!buf && (line.length === 0 || line.startsWith("//"))) {
      if (line.length > 0) out.push(line);
      continue;
    }

    buf = buf ? `${buf} ${line}` : line;
    for (const ch of line) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
    }
    if (depth <= 0) {
      depth = 0;
      if (/;$|{$|^}$|=>[^;]*$/.test(line)) {
        out.push(buf.trim());
        buf = "";
      }
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function formatImport(entry: { from: string; kind: string; alias?: string; show?: string[]; deferred?: boolean }): string {
  const parts: string[] = [];
  parts.push(`from "${entry.from}"`);
  parts.push(`kind=${entry.kind}`);
  if (entry.deferred) parts.push("deferred");
  if (entry.alias) parts.push(`alias=${entry.alias}`);
  if (entry.show && entry.show.length > 0) parts.push(`show={${entry.show.join(", ")}}`);
  return parts.join(", ");
}

function formatExport(entry: { kind: string; name: string }): string {
  return `kind=${entry.kind}, name=${entry.name}`;
}

// Control-flow / expression keywords that must never be treated as function declarations.
const NOT_A_FUNCTION = new Set([
  "if", "for", "while", "switch", "case", "catch", "return", "else", "do", "try",
  "with", "new", "assert", "yield", "await",
]);

// Keywords that start a Dart import directive (handled separately from declarations).
const IMPORT_RE = /^import\s+(['"])([^'"]+)\1\s*(?:(deferred)\s+as\s+([\w.]+)|as\s+([\w.]+))?\s*(?:show\s+([^;]+))?\s*(?:hide\s+[^;]+)?;/;
const EXPORT_RE = /^export\s+(['"])([^'"]+)\1\s*(?:show\s+[^;]+)?;/;
const PART_RE = /^part\s+(['"])([^'"]+)\1\s*;/;
const PART_OF_RE = /^part\s+of\s+(['"])([^'"]+)\1\s*;/;
const CLASS_RE = /^(?:@[\w.]+\s+)*(?:(?:abstract|sealed|base|final|interface|freezed)\s+)+(class|enum|mixin|extension|typedef)\s+([A-Za-z_]\w*)|^(?:@[\w.]+\s+)*(class|enum|mixin|extension|typedef)\s+([A-Za-z_]\w*)/;
// A function/method declaration needs a parameter list followed by a body opener
// (`{` or `=>`). Trailing `;` calls like `print(x);` are expression statements and are
// deliberately NOT matched here.
const FUNC_RE = /^(?:@[\w.]+\s+)*(?:(?:static|const|final|external|factory|late|covariant)\s+)*(?:[A-Za-z_][\w<>?,.\s]*?\s+)?([A-Za-z_]\w*)\s*(?:<[^<>()]*>)?\s*\(([^()]*)\)\s*(?:async\s*|sync\s*)*(?:\*\s*)?(?:=>|{)/;

function parseShowList(show: string | undefined): string[] | undefined {
  if (!show) return undefined;
  const names = show
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z_]\w*$/.test(s));
  return names.length > 0 ? names : undefined;
}

export function analyzeDart(filePath: string, content: string): AnalyzerOutput {
  const imports: string[] = [];
  const exports: string[] = [];
  const functions: string[] = [];
  const moduleSpecifiers: string[] = [];
  const isGeneratedPart = /\.(g|freezed|mocks|gr)\.dart$/i.test(filePath);

  for (const stmt of toLogicalStatements(content)) {
    if (stmt.length === 0 || stmt.startsWith("//")) continue;

    const mImport = stmt.match(IMPORT_RE);
    if (mImport) {
      const from = mImport[2];
      const deferred = !!mImport[3];
      const alias = deferred ? mImport[4] : mImport[5];
      const show = parseShowList(mImport[6]);
      imports.push(formatImport({ from, kind: "import", alias, show, deferred }));
      // `dart:` URIs are SDK libraries and never map to project files.
      if (!from.startsWith("dart:")) moduleSpecifiers.push(from);
      continue;
    }

    const mExport = stmt.match(EXPORT_RE);
    if (mExport) {
      const from = mExport[2];
      imports.push(formatImport({ from, kind: "export" }));
      if (!from.startsWith("dart:")) moduleSpecifiers.push(from);
      continue;
    }

    const mPartOf = stmt.match(PART_OF_RE);
    if (mPartOf) {
      imports.push(formatImport({ from: mPartOf[2], kind: "part-of" }));
      moduleSpecifiers.push(mPartOf[2]);
      continue;
    }

    const mPart = stmt.match(PART_RE);
    if (mPart) {
      imports.push(formatImport({ from: mPart[2], kind: "part" }));
      moduleSpecifiers.push(mPart[2]);
      continue;
    }

    if (/^library(\s|;)/.test(stmt)) continue;

    const mClass = stmt.match(CLASS_RE);
    if (mClass) {
      const kind = mClass[1] ?? mClass[3];
      const name = mClass[2] ?? mClass[4];
      // Dart exports every public (no leading underscore) top-level declaration.
      if (!name.startsWith("_")) exports.push(formatExport({ kind, name }));
      continue;
    }

    const mFunc = stmt.match(FUNC_RE);
    if (mFunc) {
      const name = mFunc[1];
      if (NOT_A_FUNCTION.has(name)) continue;
      functions.push(name);
      if (!name.startsWith("_")) exports.push(formatExport({ kind: "function", name }));
      continue;
    }
  }

  const unique = <T>(arr: T[]) => Array.from(new Set(arr));
  return {
    imports: unique(imports),
    // Generated part files (`*.g.dart` etc.) only echo their source library; keep their
    // output minimal to avoid flooding explore_project results with codegen noise.
    exports: isGeneratedPart ? [] : unique(exports),
    functions: unique(functions),
    moduleSpecifiers: unique(moduleSpecifiers)
  };
}
