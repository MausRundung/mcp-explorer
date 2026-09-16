import { CallToolRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import * as fs from 'fs';
import * as path from 'path';
import { suggestExistingPathsSync } from "./suggest.js";

// Interface for search results
export interface SearchResult {
  filePath: string;
  relativePath: string;
  matches: SearchMatch[];
  fileSize: number;
  fileSizeFormatted: string;
  lastModified: Date;
  fileExtension: string;
}

export interface SearchMatch {
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
  snippet: string;
}

// Interface for search options
export interface SearchOptions {
  pattern: string;
  searchPath: string;
  extensions?: string[];
  excludeExtensions?: string[];
  excludePatterns?: string[];
  regexMode?: boolean;
  caseSensitive?: boolean;
  wordBoundary?: boolean;
  multiline?: boolean;
  maxDepth?: number;
  followSymlinks?: boolean;
  includeBinary?: boolean;
  minSize?: number;
  maxSize?: number;
  modifiedAfter?: string;
  modifiedBefore?: string;
  snippetLength?: number;
  maxResults?: number;
  sortBy?: 'relevance' | 'file' | 'lineNumber' | 'modified' | 'size';
  groupByFile?: boolean;
  excludeComments?: boolean;
  excludeStrings?: boolean;
  excludeGenerated?: boolean;
  outputFormat?: 'text' | 'json';
}

// Default excluded directories
const DEFAULT_EXCLUDED_DIRS = ['.git', 'node_modules', '.next', 'dist', 'build', '#export', '.vscode', '.gradle', '.idea', '.dart_tool', 'ephemeral', 'Pods', '.symlinks'];

// Code-generation suffixes used by Dart/Flutter build_runner packages (json_serializable,
// freezed, mockito, pages router). Files with these suffixes are machine-written mirrors
// of a hand-authored source library and are usually noise in search results.
const GENERATED_DART_RE = /\.(g|freezed|mocks|gr|i18n)\.dart$/i;

// Helper function to check if a path should be excluded
function shouldExcludePath(pathToCheck: string, excludePatterns: string[]): boolean {
  const basename = path.basename(pathToCheck);
  
  // Check default excluded directories
  if (DEFAULT_EXCLUDED_DIRS.includes(basename)) {
    return true;
  }
  
  // Check custom exclude patterns
  return excludePatterns.some(pattern => {
    if (pattern.includes('*') || pattern.includes('?')) {
      // Simple glob pattern matching
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(regexPattern, 'i').test(basename);
    }
    return basename.includes(pattern);
  });
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

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to check if file matches size criteria
function matchesSize(fileSize: number, minSize?: number, maxSize?: number): boolean {
  if (minSize !== undefined && fileSize < minSize) return false;
  if (maxSize !== undefined && fileSize > maxSize) return false;
  return true;
}

// Helper function to check if file matches date criteria
function matchesDate(fileStat: fs.Stats, modifiedAfter?: string, modifiedBefore?: string): boolean {
  if (modifiedAfter) {
    const afterDate = new Date(modifiedAfter);
    if (fileStat.mtime < afterDate) return false;
  }
  if (modifiedBefore) {
    const beforeDate = new Date(modifiedBefore);
    if (fileStat.mtime > beforeDate) return false;
  }
  return true;
}

// Helper function to check if file matches extension criteria
function matchesExtension(filePath: string, extensions?: string[], excludeExtensions?: string[]): boolean {
  const ext = path.extname(filePath).toLowerCase();
  
  if (excludeExtensions && excludeExtensions.some(excludeExt => 
    excludeExt.toLowerCase() === ext || excludeExt.toLowerCase() === ext.slice(1))) {
    return false;
  }
  
  if (extensions && extensions.length > 0) {
    return extensions.some(allowedExt => 
      allowedExt.toLowerCase() === ext || allowedExt.toLowerCase() === '.' + ext.slice(1));
  }
  
  return true;
}

// Helper function to check if content is likely binary
function isBinaryContent(content: Buffer): boolean {
  // Check for null bytes which are common in binary files
  for (let i = 0; i < Math.min(1024, content.length); i++) {
    if (content[i] === 0) return true;
  }
  return false;
}

// Extensions that use C-style comments (`//`, `/* */`) and `'`/`"`/backtick strings.
const C_STYLE_COMMENT_EXTS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
  '.java', '.c', '.cpp', '.cs', '.dart',
]);

// Build a per-character mask marking positions that fall inside a comment or a string
// literal, depending on the requested options. Unlike the previous approach this NEVER
// mutates file content: the caller still searches and displays the ORIGINAL text, so
// snippets and line numbers stay truthful. It only records which offsets to suppress so
// that matches located inside comments/strings can be dropped without falsifying output.
function buildSuppressionMask(
  content: string,
  excludeComments: boolean,
  excludeStrings: boolean,
  fileExtension: string
): Uint8Array | null {
  if (!excludeComments && !excludeStrings) return null;

  const n = content.length;
  const mask = new Uint8Array(n);
  const cStyle = C_STYLE_COMMENT_EXTS.has(fileExtension);
  const isPython = fileExtension === '.py';
  const isMarkup = fileExtension === '.html' || fileExtension === '.xml';

  let i = 0;
  while (i < n) {
    const ch = content[i];
    const next = i + 1 < n ? content[i + 1] : '';

    // Line comments
    if (cStyle && ch === '/' && next === '/') {
      let j = i;
      while (j < n && content[j] !== '\n') j++;
      if (excludeComments) mask.fill(1, i, j);
      i = j;
      continue;
    }
    if (isPython && ch === '#') {
      let j = i;
      while (j < n && content[j] !== '\n') j++;
      if (excludeComments) mask.fill(1, i, j);
      i = j;
      continue;
    }
    // Block comments
    if (cStyle && ch === '/' && next === '*') {
      let j = i + 2;
      while (j < n && !(content[j] === '*' && content[j + 1] === '/')) j++;
      j = Math.min(n, j + 2);
      if (excludeComments) mask.fill(1, i, j);
      i = j;
      continue;
    }
    if (isMarkup && content.startsWith('<!--', i)) {
      const end = content.indexOf('-->', i);
      const j = end === -1 ? n : end + 3;
      if (excludeComments) mask.fill(1, i, j);
      i = j;
      continue;
    }
    // String / template literals (consumed so `//` inside a string is not treated as a
    // comment, and a quote inside a comment is not treated as a string).
    if (ch === '"' || ch === "'" || (ch === '`' && cStyle)) {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        const cj = content[j];
        if (cj === '\\') { j += 2; continue; }
        if (cj === quote) { j++; break; }
        if (cj === '\n' && quote !== '`') break; // unterminated on this line
        j++;
      }
      if (excludeStrings) mask.fill(1, i, j);
      i = j;
      continue;
    }

    i++;
  }

  return mask;
}

// Main search function.
// Matches are computed against the ORIGINAL file content so returned snippets and line
// numbers are always truthful. When excludeComments/excludeStrings are set, a suppression
// mask DROPS matches inside comments/strings instead of deleting characters from the text
// (the old behaviour corrupted URLs/strings and shifted reported line numbers).
async function searchInFile(filePath: string, options: SearchOptions): Promise<SearchMatch[]> {
  try {
    const content = await fs.promises.readFile(filePath);
    
    // Check if binary and skip if not allowed
    if (!options.includeBinary && isBinaryContent(content)) {
      return [];
    }
    
    const textContent = content.toString('utf-8');
    const fileExtension = path.extname(filePath).toLowerCase();
    
    const mask = buildSuppressionMask(
      textContent,
      options.excludeComments || false,
      options.excludeStrings || false,
      fileExtension
    );
    
    const lines = textContent.split('\n');
    const matches: SearchMatch[] = [];
    
    // Create regex pattern
    let regexFlags = 'g';
    if (!options.caseSensitive) regexFlags += 'i';
    if (options.multiline) regexFlags += 'm';
    
    let pattern = options.pattern;
    if (!options.regexMode) {
      // Escape special regex characters if not in regex mode
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    if (options.wordBoundary) {
      pattern = `\\b${pattern}\\b`;
    }
    
    const regex = new RegExp(pattern, regexFlags);
    const snippetPad = options.snippetLength || 50;
    
    // Search through lines, tracking each line's absolute offset for mask lookups
    let lineStart = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      regex.lastIndex = 0;
      let match;
      
      while ((match = regex.exec(line)) !== null) {
        const absPos = lineStart + match.index;
        const suppressed = mask ? mask[absPos] === 1 : false;
        if (!suppressed) {
          const snippetStart = Math.max(0, match.index - snippetPad);
          const snippetEnd = Math.min(line.length, match.index + match[0].length + snippetPad);
          
          matches.push({
            lineNumber: i + 1,
            lineContent: line,
            matchStart: match.index,
            matchEnd: match.index + match[0].length,
            snippet: line.substring(snippetStart, snippetEnd)
          });
        }
        
        // Prevent infinite loop with zero-width matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
      
      lineStart += line.length + 1; // account for the stripped '\n'
    }
    
    return matches;
  } catch (error) {
    return [];
  }
}

// Recursive directory search
async function searchDirectory(
  dirPath: string, 
  options: SearchOptions, 
  allowedDirectories: string[],
  currentDepth: number = 0
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  
  if (options.maxDepth !== undefined && currentDepth > options.maxDepth) {
    return results;
  }
  
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      
      // Skip excluded paths
      if (shouldExcludePath(entryPath, options.excludePatterns || [])) {
        continue;
      }
      
      if (entry.isDirectory()) {
        // Recursively search subdirectories
        const subdirResults = await searchDirectory(entryPath, options, allowedDirectories, currentDepth + 1);
        results.push(...subdirResults);
      } else if (entry.isFile() || (entry.isSymbolicLink() && options.followSymlinks)) {
        try {
          const stat = await fs.promises.stat(entryPath);
          
          // Check size criteria
          if (!matchesSize(stat.size, options.minSize, options.maxSize)) {
            continue;
          }
          
          // Check date criteria
          if (!matchesDate(stat, options.modifiedAfter, options.modifiedBefore)) {
            continue;
          }
          
          // Check extension criteria
          if (!matchesExtension(entryPath, options.extensions, options.excludeExtensions)) {
            continue;
          }
          
          // Skip code-generated Dart part files when requested
          if (options.excludeGenerated && GENERATED_DART_RE.test(entry.name)) {
            continue;
          }
          
          // Search in file
          const matches = await searchInFile(entryPath, options);
          
          if (matches.length > 0) {
            const relativePath = options.searchPath ? path.relative(options.searchPath, entryPath) : entryPath;
            
            results.push({
              filePath: entryPath,
              relativePath: relativePath,
              matches: matches,
              fileSize: stat.size,
              fileSizeFormatted: formatFileSize(stat.size),
              lastModified: stat.mtime,
              fileExtension: path.extname(entryPath).toLowerCase()
            });
          }
        } catch (error) {
          // Error processing file, skip
        }
      }
    }
  } catch (error) {
    // Error searching directory, skip
  }
  
  return results;
}

// Sort results based on criteria
function sortResults(results: SearchResult[], sortBy: string): SearchResult[] {
  switch (sortBy) {
    case 'file':
      return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    case 'lineNumber':
      return results.sort((a, b) => a.matches[0]?.lineNumber - b.matches[0]?.lineNumber);
    case 'modified':
      return results.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    case 'size':
      return results.sort((a, b) => b.fileSize - a.fileSize);
    case 'relevance':
    default:
      return results.sort((a, b) => b.matches.length - a.matches.length);
  }
}

// Format results for output. `options.maxResults` is a GLOBAL match budget applied
// consistently across JSON, grouped-text and flat-text modes (previously grouped mode
// capped files, not matches, and printed up to 10 matches per file => ~10x overspend).
function formatResults(results: SearchResult[], options: SearchOptions): string {
  const budget = options.maxResults && options.maxResults > 0 ? options.maxResults : 100;

  if (options.outputFormat === 'json') {
    const trimmed: SearchResult[] = [];
    let remaining = budget;
    for (const result of results) {
      if (remaining <= 0) break;
      if (result.matches.length === 0) continue;
      const kept = result.matches.slice(0, remaining);
      remaining -= kept.length;
      trimmed.push({ ...result, matches: kept });
    }
    return JSON.stringify(trimmed, null, 2);
  }
  
  const lines: string[] = [];
  
  if (results.length === 0) {
    lines.push(`No matches found for pattern: ${options.pattern}`);
    return lines.join('\n');
  }
  
  lines.push(`# Search Results for: "${options.pattern}"`);
  lines.push(`Found ${results.length} file(s) with matches\n`);
  
  let emitted = 0;
  
  if (options.groupByFile) {
    // Group results by file
    let truncated = false;
    for (const result of results) {
      if (emitted >= budget) {
        truncated = true;
        break;
      }
      const remaining = budget - emitted;
      const shown = result.matches.slice(0, remaining);
      lines.push(`## ${result.relativePath}`);
      lines.push(`Size: ${result.fileSizeFormatted} | Modified: ${result.lastModified.toISOString()}`);
      lines.push(`Matches: ${result.matches.length}\n`);
      
      for (const match of shown) {
        lines.push(`Line ${match.lineNumber}: ${match.snippet}`);
      }
      emitted += shown.length;
      
      const hidden = result.matches.length - shown.length;
      if (hidden > 0) {
        lines.push(`... and ${hidden} more matches`);
      }
      
      lines.push('');
    }
    if (truncated || emitted >= budget) {
      lines.push(`\n... search truncated at ${budget} results`);
    }
  } else {
    // Flat list of all matches
    outer: for (const result of results) {
      for (const match of result.matches) {
        if (emitted >= budget) break outer;
        lines.push(`${result.relativePath}:${match.lineNumber}: ${match.snippet}`);
        emitted++;
      }
    }
    
    if (emitted >= budget) {
      lines.push(`\n... search truncated at ${budget} results`);
    }
  }
  
  return lines.join('\n');
}

// Tool definition
export const searchTool = {
  name: "search_files",
  description: "Advanced file and code search tool with comprehensive filtering and matching capabilities. Searches files within allowed directories for a required literal or regex pattern, with file type filtering, size constraints, date filtering, and comment/string-aware match suppression (search always runs against the original, unmodified file content). Results can be formatted as text or JSON with configurable sorting and grouping. maxResults caps the total number of returned matches.",
  inputSchema: {
    type: "object",
    properties: {
      pattern: {
        type: "string",
        description: "Search pattern - literal text or regex depending on regexMode. Required."
      },
      searchPath: {
        type: "string",
        description: "Directory path to search in. Must be within allowed directories. Defaults to first allowed directory if not specified"
      },
      path: {
        type: "string",
        description: "Alias for searchPath"
      },
      extensions: {
        type: "array",
        items: { type: "string" },
        description: "Array of file extensions to include (e.g., ['.js', '.ts', '.py']). Include the dot prefix"
      },
      excludeExtensions: {
        type: "array",
        items: { type: "string" },
        description: "Array of file extensions to exclude"
      },
      excludePatterns: {
        type: "array",
        items: { type: "string" },
        description: "Array of filename patterns to exclude (supports simple wildcards)"
      },
      regexMode: {
        type: "boolean",
        description: "Whether to treat pattern as a regular expression",
        default: false
      },
      caseSensitive: {
        type: "boolean",
        description: "Whether search should be case sensitive",
        default: false
      },
      wordBoundary: {
        type: "boolean",
        description: "Whether to match whole words only",
        default: false
      },
      multiline: {
        type: "boolean",
        description: "Whether to enable multiline regex matching",
        default: false
      },
      maxDepth: {
        type: "integer",
        description: "Maximum directory recursion depth. Unlimited if not specified"
      },
      followSymlinks: {
        type: "boolean",
        description: "Whether to follow symbolic links",
        default: false
      },
      includeBinary: {
        type: "boolean",
        description: "Whether to search in binary files",
        default: false
      },
      minSize: {
        type: "integer",
        description: "Minimum file size in bytes"
      },
      maxSize: {
        type: "integer",
        description: "Maximum file size in bytes"
      },
      modifiedAfter: {
        type: "string",
        description: "Only include files modified after this date (ISO 8601 format)"
      },
      modifiedBefore: {
        type: "string",
        description: "Only include files modified before this date (ISO 8601 format)"
      },
      snippetLength: {
        type: "integer",
        description: "Length of text snippet around matches",
        default: 50
      },
      maxResults: {
        type: "integer",
        description: "Maximum total number of matches to return (across all files)",
        default: 100
      },
      sortBy: {
        type: "string",
        enum: ["relevance", "file", "lineNumber", "modified", "size"],
        description: "How to sort the results",
        default: "relevance"
      },
      groupByFile: {
        type: "boolean",
        description: "Whether to group results by file",
        default: true
      },
      excludeComments: {
        type: "boolean",
        description: "Whether to exclude comments from search (language-aware)",
        default: false
      },
      excludeStrings: {
        type: "boolean",
        description: "Whether to exclude string literals from search",
        default: false
      },
      excludeGenerated: {
        type: "boolean",
        description: "Whether to skip code-generated Dart part files (*.g.dart, *.freezed.dart, *.mocks.dart, *.gr.dart, *.i18n.dart)",
        default: false
      },
      outputFormat: {
        type: "string",
        enum: ["text", "json"],
        description: "Output format for results",
        default: "text"
      }
    },
    required: ["pattern"]
  }
};

// Tool handler
export async function handleSearch(args: any, allowedDirectories: string[]) {
  // Search files handler

  // pattern is required: there is no implicit ".*" default (that previously either
  // matched nothing useful as a literal, or matched every line when regexMode was on).
  if (typeof args.pattern !== "string" || args.pattern.length === 0) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "The 'pattern' argument is required and must be a non-empty string."
    );
  }

  // Set up default options
  const options: SearchOptions = {
    pattern: args.pattern,
    searchPath: args.searchPath || args.path || (allowedDirectories.length > 0 ? allowedDirectories[0] : process.cwd()),
    extensions: args.extensions,
    excludeExtensions: args.excludeExtensions,
    excludePatterns: args.excludePatterns || [],
    regexMode: args.regexMode || false,
    caseSensitive: args.caseSensitive || false,
    wordBoundary: args.wordBoundary || false,
    multiline: args.multiline || false,
    maxDepth: args.maxDepth,
    followSymlinks: args.followSymlinks || false,
    includeBinary: args.includeBinary || false,
    minSize: args.minSize,
    maxSize: args.maxSize,
    modifiedAfter: args.modifiedAfter,
    modifiedBefore: args.modifiedBefore,
    snippetLength: args.snippetLength || 50,
    maxResults: args.maxResults || 100,
    sortBy: args.sortBy || 'relevance',
    groupByFile: args.groupByFile !== undefined ? args.groupByFile : true,
    excludeComments: args.excludeComments || false,
    excludeStrings: args.excludeStrings || false,
    excludeGenerated: args.excludeGenerated || false,
    outputFormat: args.outputFormat || 'text'
  };
  
  // Validate search path
  if (!options.searchPath) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "No search path specified and no allowed directories available"
    );
  }
  
  const baseDirectory = allowedDirectories[0] || process.cwd();
  options.searchPath = resolveUserPath(options.searchPath, baseDirectory);

  // Ensure searchPath is not empty string
  if (options.searchPath.trim() === "") {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Search path cannot be empty"
    );
  }
  
  // Normalize search path
  options.searchPath = path.normalize(options.searchPath);
  
  // Check if search path is allowed
  if (!isPathAllowed(options.searchPath, allowedDirectories)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Access denied: The path '${options.searchPath}' is not in the list of allowed directories: ${allowedDirectories.join(', ')}`
    );
  }
  
  // Validate that the search path exists and is a directory
  try {
    const stat = await fs.promises.stat(options.searchPath);
    if (!stat.isDirectory()) {
      const suggestions = suggestExistingPathsSync(options.searchPath, 5, true);
      const suffix = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
      throw new McpError(
        ErrorCode.InvalidRequest,
        `The path '${options.searchPath}' is not a directory.${suffix}`
      );
    }
  } catch (error) {
    const suggestions = suggestExistingPathsSync(options.searchPath, 5, true);
    const suffix = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
    throw new McpError(
      ErrorCode.InvalidRequest,
      `The path '${options.searchPath}' does not exist or cannot be accessed.${suffix}`
    );
  }
  
  try {
    // Perform the search
    const results = await searchDirectory(options.searchPath, options, allowedDirectories);
    
    // Sort results
    const sortedResults = sortResults(results, options.sortBy || 'relevance');
    
    // Format output (the maxResults match budget is applied inside formatResults)
    const formattedResults = formatResults(sortedResults, options);
    
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
      `Error during search: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
