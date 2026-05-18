import { CallToolRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import * as fs from 'fs';
import * as path from 'path';
import { suggestExistingPathsSync } from "./suggest.js";
import type { AnalyzerOutput } from "./analyzers/analyzer-types.js";
import { analyzeByExtension, isAnalyzedExtension, isCodeFileExtension, isConfigFileExtension, isJsTsFamily } from "./analyzers/index.js";

// Directories to exclude from scanning
const EXCLUDED_DIRS = ['.next', 'node_modules', '#export', '.git', 'dist', 'build', '.vscode', '.gradle', '.idea'];

// Helper function to check if a path should be excluded
function shouldExcludePath(pathToCheck: string): boolean {
  const basename = path.basename(pathToCheck);
  return EXCLUDED_DIRS.includes(basename);
}

// Helper function to get file stats
async function getFileStats(filePath: string): Promise<{
  size: number;
  isEmpty: boolean;
  isFile: boolean;
  isDirectory: boolean;
} | null> {
  try {
    const stats = await fs.promises.stat(filePath);
    return {
      size: stats.size,
      isEmpty: stats.size === 0,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    };
  } catch (error) {
    return null;
  }
}

async function analyzeCodeFile(filePath: string): Promise<AnalyzerOutput> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return analyzeByExtension(filePath, content) ?? { imports: [], exports: [] };
  } catch (error) {
    return { imports: [], exports: [] };
  }
}

// Interface for file information
export interface FileInfo {
  path: string;
  size: number;
  sizeFormatted: string;
  isEmpty: boolean;
  imports?: string[];
  exports?: string[];
  functions?: string[];
  moduleSpecifiers?: string[];
  localImports?: string[];
  fileType?: string;
}

// Helper function to recursively scan a directory
async function scanDirectory(dirPath: string, rootPath: string): Promise<FileInfo[]> {
  const results: FileInfo[] = [];
  
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      
      // Skip excluded directories
      if (entry.isDirectory() && shouldExcludePath(entryPath)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subdirResults = await scanDirectory(entryPath, rootPath);
        results.push(...subdirResults);
      } else if (entry.isFile()) {
        const stats = await getFileStats(entryPath);
        
        if (!stats) continue;
        
        const fileInfo: FileInfo = {
          path: entryPath,
          size: stats.size,
          sizeFormatted: formatFileSize(stats.size),
          isEmpty: stats.isEmpty
        };
        
        // Check if this is a file type we should analyze for imports/exports
        const ext = path.extname(entryPath).toLowerCase();
        if (isAnalyzedExtension(ext)) {
          if (isCodeFileExtension(ext)) {
            const { imports, exports, functions, moduleSpecifiers } = await analyzeCodeFile(entryPath);
            fileInfo.imports = imports;
            fileInfo.exports = exports;
            fileInfo.functions = functions;
            fileInfo.moduleSpecifiers = moduleSpecifiers;
          } else if (isConfigFileExtension(ext)) {
            fileInfo.fileType = 'config';
          }
        }
        
        results.push(fileInfo);
      }
    }
  } catch (error) {
    // Error scanning directory, skip
  }
  
  return results;
}

// Helper function to format file size to human-readable format
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to format the results into a readable text output
function formatResults(files: FileInfo[], dirPath: string): string {
  const lines: string[] = [];
  
  lines.push(`# Project Analysis Results for: ${dirPath}`);
  lines.push(`Total files found: ${files.length}\n`);

  const codeFiles = files.filter(f => {
    const ext = path.extname(f.path).toLowerCase();
    return isJsTsFamily(ext);
  });
  const fileSet = new Set(codeFiles.map(f => path.normalize(f.path)));

  const parseJsonWithComments = (text: string): any | undefined => {
    try {
      const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, "");
      const noLine = noBlock.replace(/\/\/.*$/gm, "");
      return JSON.parse(noLine);
    } catch {
      return undefined;
    }
  };

  const loadTsConfig = (): { baseUrl?: string; paths?: Record<string, string[]> } | undefined => {
    try {
      const tsConfigPath = path.join(dirPath, "tsconfig.json");
      const raw = fs.readFileSync(tsConfigPath, "utf-8");
      const json = parseJsonWithComments(raw);
      const compilerOptions = json?.compilerOptions;
      const baseUrl = typeof compilerOptions?.baseUrl === "string" ? compilerOptions.baseUrl : undefined;
      const paths = typeof compilerOptions?.paths === "object" && compilerOptions?.paths ? (compilerOptions.paths as Record<string, string[]>) : undefined;
      return { baseUrl, paths };
    } catch {
      return undefined;
    }
  };

  const tsConfig = loadTsConfig();

  const resolveCandidatesForBase = (base: string): string[] => {
    const candidates: string[] = [];
    if (path.extname(base)) {
      candidates.push(base);
      return candidates;
    }
    candidates.push(`${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.d.ts`);
    candidates.push(path.join(base, "index.ts"), path.join(base, "index.tsx"), path.join(base, "index.js"), path.join(base, "index.jsx"));
    return candidates;
  };

  const tryResolveNonRelativeImport = (spec: string): string | undefined => {
    if (!tsConfig?.paths) return undefined;
    const baseUrl = tsConfig.baseUrl ? path.resolve(dirPath, tsConfig.baseUrl) : dirPath;
    const entries = Object.entries(tsConfig.paths);

    for (const [key, targets] of entries) {
      let starMatch: string | undefined;
      if (key.includes("*")) {
        const [prefix, suffix] = key.split("*");
        if (!spec.startsWith(prefix) || !spec.endsWith(suffix ?? "")) continue;
        starMatch = spec.slice(prefix.length, spec.length - (suffix?.length ?? 0));
      } else {
        if (spec !== key) continue;
      }

      for (const t of targets) {
        const replaced = starMatch !== undefined ? t.replace("*", starMatch) : t;
        const absBase = path.resolve(baseUrl, replaced);
        for (const c of resolveCandidatesForBase(absBase)) {
          const normalized = path.normalize(c);
          if (fileSet.has(normalized)) return normalized;
        }
      }
    }

    return undefined;
  };

  const tryResolveLocalImport = (importerPath: string, spec: string): string | undefined => {
    if (spec.startsWith(".")) {
      const base = path.resolve(path.dirname(importerPath), spec);
      for (const c of resolveCandidatesForBase(base)) {
        const normalized = path.normalize(c);
        if (fileSet.has(normalized)) return normalized;
      }
      return undefined;
    }

    return tryResolveNonRelativeImport(spec);
  };

  let edgeCount = 0;
  const indegree = new Map<string, number>();
  const outdegree = new Map<string, number>();

  for (const f of codeFiles) {
    const specs = f.moduleSpecifiers ?? [];
    const resolved = specs
      .map(s => tryResolveLocalImport(f.path, s))
      .filter((x): x is string => !!x);
    const uniqueResolved = Array.from(new Set(resolved));
    if (uniqueResolved.length > 0) {
      f.localImports = uniqueResolved.map(p => path.relative(dirPath, p));
    }
    outdegree.set(f.path, uniqueResolved.length);
    for (const dep of uniqueResolved) {
      edgeCount += 1;
      indegree.set(dep, (indegree.get(dep) ?? 0) + 1);
    }
  }

  if (edgeCount > 0) {
    const topImported = Array.from(indegree.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    const topImporting = Array.from(outdegree.entries())
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 10)
      .filter(([, v]) => (v ?? 0) > 0);

    lines.push(`## Dependency Graph (local imports)`);
    lines.push(`Edges: ${edgeCount}`);
    if (topImported.length > 0) {
      lines.push(`\nMost imported files:`);
      for (const [p, c] of topImported) {
        lines.push(`- \`${path.relative(dirPath, p)}\` (imported ${c}x)`);
      }
    }
    if (topImporting.length > 0) {
      lines.push(`\nMost importing files:`);
      for (const [p, c] of topImporting) {
        lines.push(`- \`${path.relative(dirPath, p)}\` (imports ${c} local files)`);
      }
    }
    lines.push("");
  }
  
  // Sort files by path for easier reading
  files.sort((a, b) => a.path.localeCompare(b.path));
  
  for (const file of files) {
    // Display relative path
    const relativePath = path.relative(dirPath, file.path);
    lines.push(`## ${relativePath}`);
    lines.push(`Size: ${file.sizeFormatted} ${file.isEmpty ? '(Empty File)' : ''}`);
    
    if (file.imports && file.imports.length > 0) {
      lines.push(`\nImports:`);
      file.imports.forEach((imp: string) => lines.push(`- \`${imp.trim()}\``));
    }
    
    if (file.exports && file.exports.length > 0) {
      lines.push(`\nExports:`);
      file.exports.forEach((exp: string) => lines.push(`- \`${exp.trim()}\``));
    }

    if (file.functions && file.functions.length > 0) {
      lines.push(`\nFunctions:`);
      file.functions.forEach((fn: string) => lines.push(`- \`${fn.trim()}\``));
    }

    if (file.localImports && file.localImports.length > 0) {
      lines.push(`\nLocal Imports (resolved):`);
      file.localImports.forEach((p: string) => lines.push(`- \`${p.trim()}\``));
    }
    
    lines.push(''); // Add empty line between files
  }
  
  return lines.join('\n');
}

// Helper function to check if a path is inside an allowed directory
function isPathAllowed(pathToCheck: string, allowedDirectories: string[]): boolean {
  if (allowedDirectories.length === 0) return true;
  const resolvedPath = path.resolve(pathToCheck).replace(/\\/g, '/');
  return allowedDirectories.some(dir => {
    const resolvedDir = path.resolve(dir).replace(/\\/g, '/');
    return resolvedPath === resolvedDir || resolvedPath.startsWith(resolvedDir + '/');
  });
}

function resolveUserPath(inputPath: string, baseDirectory: string): string {
  if (path.isAbsolute(inputPath)) return path.normalize(inputPath);
  return path.normalize(path.join(baseDirectory, inputPath));
}

// Tool definition
export const exploreProjectTool = {
  name: "explore_project",
  description: "Lists all files in a directory with their sizes. For JS/TS/TSX/JSX it parses imports/exports/functions and resolves local import edges to summarize dependency entanglement. Also extracts import/export-like declarations for common languages (Python/Java/Kotlin/Go/Rust/C#). Excludes common build directories like node_modules, .git, dist, etc.",
  inputSchema: {
    type: "object",
    properties: {
      directory: { 
        type: "string",
        description: "The directory path to analyze"
      },
      subDirectory: {
        type: "string",
        description: "Optional subdirectory within the main directory to analyze",
        default: ""
      },
      includeHidden: { 
        type: "boolean", 
        description: "Whether to include hidden files and directories (starting with .)",
        default: false
      }
    },
    required: ["directory"]
  }
};

// Tool handler
export async function handleExploreProject(args: any, allowedDirectories: string[]) {
  const directory = args.directory as string;
  const subDirectory = args.subDirectory as string || "";
  const includeHidden = (args.includeHidden as boolean) || false;
  
  if (!directory) {
    throw new McpError(
      ErrorCode.InvalidRequest, 
      "Directory parameter is required"
    );
  }
  
  try {
    const baseDirectory = allowedDirectories[0] || process.cwd();

    let fullDirPath = resolveUserPath(directory, baseDirectory);
    if (subDirectory) {
      fullDirPath = path.join(fullDirPath, subDirectory);
    }
    
    // Normalize path for comparison
    fullDirPath = path.normalize(fullDirPath);
    
    // Check if the path is allowed
    if (!isPathAllowed(fullDirPath, allowedDirectories)) {
      throw new McpError(
        ErrorCode.InvalidRequest, 
        `Access denied: The path '${fullDirPath}' is not in the list of allowed directories: ${allowedDirectories.join(', ')}`
      );
    }
    
    // Validate that the directory exists
    const dirStats = await getFileStats(fullDirPath);
    if (!dirStats || !dirStats.isDirectory) {
      const suggestions = suggestExistingPathsSync(fullDirPath, 5, true);
      const suffix = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
      throw new McpError(
        ErrorCode.InvalidRequest, 
        `The path '${fullDirPath}' does not exist or is not a directory.${suffix}`
      );
    }
    
    const files = await scanDirectory(fullDirPath, fullDirPath);
    
    // Filter out hidden files if not includeHidden
    const filteredFiles = includeHidden 
      ? files 
      : files.filter(file => !path.basename(file.path).startsWith('.'));
    
    if (filteredFiles.length === 0) {
      const emptyResult = `# Project Analysis Results for: ${fullDirPath}\n\nNo files found in the directory.\n\n**Note:** This could mean:\n- The directory is empty\n- All files are hidden (use includeHidden=true to see hidden files)\n- All files are in excluded directories (${EXCLUDED_DIRS.join(', ')})`;
      return {
        content: [
          {
            type: "text",
            text: emptyResult
          }
        ]
      };
    }
    
    const formattedResults = formatResults(filteredFiles, fullDirPath);
    
    return {
      content: [
        {
          type: "text",
          text: formattedResults
        }
      ]
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(
      ErrorCode.InternalError, 
      `Error analyzing project: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
