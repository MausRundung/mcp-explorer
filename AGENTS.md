# AGENTS.md

Guidance for AI coding agents working in this repository.

## Start of every chat

At the **start of every chat**, call `explore_project` on the project root
(registered in opencode as `project-explorer_explore_project`) to understand
the project structure, imports/exports/functions, and dependency graph before
doing anything else.

```jsonc
explore_project({ "directory": "." })
```

Use `project-explorer_list_allowed_directories` first if you are unsure of the
working directory scope. Follow up with `search_files` for anything you need to
inspect in detail.

## Tools

This MCP server (`project-explorer`) exposes 6 tools. In opencode every tool is
prefixed with the server name: `project-explorer_<tool>`.

### `list_allowed_directories`
- **Purpose:** Returns the sandboxed directories the server may access. Call it
  first to confirm scope before any operation.
- **Args:** none.
- **Note:** if the list is empty, the server has unrestricted filesystem access.

### `explore_project`
- **Purpose:** Full project scan. Lists every file with size, detects config
  files, parses imports/exports/functions for code files, and builds a local
  dependency graph (edges, most-imported/importing files) resolved via
  `tsconfig` `baseUrl`/`paths` for JS/TS.
- **Args:**
  - `directory` / `path` (string): target dir, relative to the first allowed
    dir or absolute. Defaults to `allowedDirectories[0]`.
  - `subDirectory` (string): optional subdir joined onto `directory`.
  - `includeHidden` (boolean): include dot-files, default `false`.
- **Always excluded:** `.next`, `node_modules`, `#export`, `.git`, `dist`,
  `build`, `.vscode`, `.gradle`, `.idea`.

### `search_files`
- **Purpose:** Advanced full-text/regex search across files in allowed dirs,
  with size/date/extension filters and comment/string exclusion.
- **Args:**
  - `pattern` (string, default `.*`): text or regex to match.
  - `searchPath` / `path` (string): directory to search, default first allowed dir.
  - `extensions` / `excludeExtensions` (string[]): include/exclude file types (dot-prefixed).
  - `excludePatterns` (string[]): filename patterns to skip (simple wildcards).
  - `regexMode` (boolean): treat `pattern` as regex.
  - `caseSensitive`, `wordBoundary`, `multiline` (boolean): matching behavior.
  - `minSize` / `maxSize` (integer): byte-size range for files.
  - `modifiedAfter` / `modifiedBefore` (string): ISO 8601 mtime window.
  - `maxDepth` (integer): recursion depth limit.
  - `followSymlinks` (boolean): traverse symlinks.
  - `includeBinary` (boolean): also search binary files.
  - `snippetLength` (integer, default 50): chars around each match.
  - `maxResults` (integer, default 100): result cap.
  - `sortBy` (string): `relevance` | `file` | `lineNumber` | `modified` | `size`.
  - `groupByFile` (boolean): group output per file.
  - `excludeComments` (boolean): skip language-aware comments.
  - `excludeStrings` (boolean): skip string literals.
  - `outputFormat` (string): `text` | `json` | `structured`.

### `check_outdated`
- **Purpose:** Reports outdated npm packages via `npm outdated --json`.
- **Args:**
  - `projectPath` / `path` (string): dir containing `package.json`, default first allowed dir.
  - `includeDevDependencies` (boolean, default true): include dev deps.
  - `outputFormat` (string): `detailed` (per-package), `summary` (counts by type), `raw`.

### `rename_file`
- **Purpose:** Rename or move a file/directory.
- **Args:**
  - `oldPath` (string, required): current path.
  - `newPath` (string, required): destination path.
- **Behavior:** fails if destination exists; creates missing destination dirs;
  both paths must be inside allowed dirs.

### `delete_file`
- **Purpose:** Delete a file or directory. **Irreversible — never call without
  explicit user intent.**
- **Args:**
  - `path` (string, required): file/dir to delete.
  - `recursive` (boolean, default false): required for non-empty directories.
  - `force` (boolean, default false): delete read-only files.
- **Behavior:** only operates inside allowed dirs.
