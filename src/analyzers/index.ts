import * as path from "path";
import { AnalyzerOutput } from "./analyzer-types.js";
import { analyzeJsOrTs } from "./js-ts-analyzer.js";
import { analyzePython } from "./python-analyzer.js";
import { analyzeRust } from "./rust-analyzer.js";
import { analyzeGo } from "./go-analyzer.js";
import { analyzeJava } from "./java-analyzer.js";
import { analyzeKotlin } from "./kotlin-analyzer.js";
import { analyzeCSharp } from "./csharp-analyzer.js";

export const CODE_FILE_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".kt", ".kts", ".go", ".rs", ".cs"] as const;
export const CONFIG_FILE_EXTENSIONS = [".json", ".yaml", ".yml", ".toml", ".xml", ".gradle", ".properties"] as const;
export const ANALYZED_EXTENSIONS = [...CODE_FILE_EXTENSIONS, ...CONFIG_FILE_EXTENSIONS] as const;

export function isCodeFileExtension(ext: string): boolean {
  return (CODE_FILE_EXTENSIONS as readonly string[]).includes(ext);
}

export function isConfigFileExtension(ext: string): boolean {
  return (CONFIG_FILE_EXTENSIONS as readonly string[]).includes(ext);
}

export function isAnalyzedExtension(ext: string): boolean {
  return (ANALYZED_EXTENSIONS as readonly string[]).includes(ext);
}

export function isJsTsFamily(ext: string): boolean {
  return ext === ".js" || ext === ".jsx" || ext === ".ts" || ext === ".tsx";
}

export function analyzeByExtension(filePath: string, content: string): AnalyzerOutput | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".js" || ext === ".jsx" || ext === ".ts" || ext === ".tsx") return analyzeJsOrTs(filePath, content);
  if (ext === ".py") return analyzePython(filePath, content);
  if (ext === ".rs") return analyzeRust(filePath, content);
  if (ext === ".go") return analyzeGo(filePath, content);
  if (ext === ".java") return analyzeJava(filePath, content);
  if (ext === ".kt" || ext === ".kts") return analyzeKotlin(filePath, content);
  if (ext === ".cs") return analyzeCSharp(filePath, content);
  return undefined;
}
