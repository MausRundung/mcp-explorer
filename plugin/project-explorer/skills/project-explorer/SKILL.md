---
name: project-explorer
version: 1.0.0
description: Map and analyze a codebase with the project-explorer MCP server - structure scan, import/export dependency graph, filtered regex search, npm dependency audit, and gated rename operations.
description_zh: 使用 project-explorer MCP 服务器扫描项目结构、解析导入导出依赖图、执行带过滤的正则搜索、审计 npm 依赖并受控重命名文件。
user-invocable: true
argument-hint: <directory to explore, or what you want to find out about the codebase>
---

# Project Explorer

Use the `project-explorer` MCP server to answer structural questions about a
codebase without reading files one by one: what is in the project, what imports
what, where a symbol or pattern occurs, and which npm packages are stale.

The server exposes five usable tools through one STDIO process:
`list_allowed_directories`, `explore_project`, `search_files`, `check_outdated`,
`rename_file`. `delete_file` exists but ships **disabled** in this plugin's
`mcp.json`.

Full argument tables: [references/tool-reference.md](references/tool-reference.md).

## When to use

- "What is the structure of this project?", "which files import X?", "how
  entangled is this module?"
- Broad code search across many files: TODO/FIXME inventories, API usage sites,
  config keys, dead exports, large recently-changed files.
- Dependency hygiene before a release or upgrade.
- Any task where reading files individually would cost many round trips.

Do not use it as a substitute for opening one known file, and never use it as a
mass-edit tool - it only reads, reports, and renames.

## Workflow

### 1. Confirm scope first

Call `list_allowed_directories` once at the start. Every other tool is
path-restricted to those directories.

- A non-empty list means paths outside it fail with `Access denied`.
- An empty list means the server has **no** allow-list and can read anywhere.
  Treat that as a signal to pass explicit project-root paths in `mcp.json`
  rather than as license to scan the whole disk.

Relative `directory` / `searchPath` values resolve against the **first** allowed
directory, not the editor's cwd - so an unrooted `"src"` can silently point at
the wrong project. Prefer absolute paths, or verify the first allowed directory
before using a relative one.

### 2. Map the project

```jsonc
explore_project({ "directory": "/absolute/path/to/project" })
```

Returns per-file sizes, detected config files, parsed imports/exports/functions,
and a local dependency graph (edge list, most-imported and most-importing
files). JS/TS import edges are resolved through `tsconfig` `baseUrl`/`paths`;
Python, Java, Kotlin, Go, Rust, and C# produce import/export-like declarations
without resolved edges.

Narrow with `subDirectory` (e.g. `"src"`) and widen with `includeHidden: true`.
These directories are always skipped: `.next`, `node_modules`, `#export`,
`.git`, `dist`, `build`, `.vscode`, `.gradle`, `.idea`. A "no files found"
result usually means everything was excluded or hidden - state that instead of
concluding the folder is empty.

For large repos, scan the root first, then re-scan only the subdirectories that
matter. A full recursive scan of a monorepo is slow and drowns the signal.

### 3. Drill in with search

```jsonc
search_files({
  "pattern": "console\\.log",
  "regexMode": true,
  "extensions": [".ts", ".tsx"],
  "excludeComments": true,
  "maxResults": 50
})
```

Recipes that work well:

| Goal | Arguments |
|---|---|
| Work-item inventory | `pattern: "TODO\|FIXME\|BUG"`, `regexMode: true`, `excludeStrings: true`, `excludePatterns: ["*test*", "*spec*"]` |
| Usage sites of a symbol | `pattern: "useAuth"`, `wordBoundary: true`, `extensions` limited to the source types |
| Structure discovery | `pattern: "export\\s+(async\\s+)?function"`, `regexMode: true`, `outputFormat: "structured"` |
| Hot large files | `pattern: ".*"`, `minSize: 1000000`, `sortBy: "size"` |
| Recent churn | `modifiedAfter: "2026-06-01"`, `sortBy: "modified"` |

Start with `maxResults: 50` and filters on. Widen only if the narrowed search
returns nothing: `extensions` is the cheapest way to cut noise, and
`excludeComments` / `excludeStrings` clean up code searches.

### 4. Dependency audit

```jsonc
check_outdated({ "projectPath": "/absolute/path/to/project", "outputFormat": "summary" })
```

`summary` gives counts by type, `detailed` gives per-package versions and
update commands, `raw` returns `npm outdated --json` verbatim. It shells out to
`npm`, so it needs Node/npm on the host and a `package.json` in that directory.
Report major-vs-minor gaps and never run the suggested update commands without
the user asking for them.

### 5. Renames and deletions

`rename_file` fails if the destination exists and creates missing destination
directories. Both paths must be inside the allow-list. Confirm the new path with
the user before executing, because import statements are **not** rewritten.

`delete_file` is disabled by default. If the user re-enabled it, still require
an explicit, current-turn instruction naming the exact path; never infer delete
intent from "clean up" or "remove the old code", and never pass `recursive: true`
without the user confirming that the directory contents go too.

## Reading failures correctly

The server appends `Did you mean: ...` suggestions to bad tool names and missing
paths. When that happens, re-check the path against `list_allowed_directories`
and retry once; do not loop through guessed paths. Report tool errors verbatim
in short form rather than paraphrasing them as "no results".

## Reporting

Summarize rather than dump: file/module counts, the dependency-graph outliers,
the specific paths that answer the question, and what was excluded from the scan
(build dirs, hidden files, `maxResults` truncation). If a scan hit `maxResults`,
say the count is a lower bound.

## Setup notes

The server runs from npm via `npx -y @team-jd/mcp-project-explorer`. See
[../../CONNECTORS.md](../../CONNECTORS.md) for the Node.js requirement, how to
pin the allowed directories, and how to switch to a local build.
