# project-explorer MCP Tool Reference

Server: `project-explorer` (npm package `@team-jd/mcp-project-explorer`,
transport: STDIO). Source repository:
<https://github.com/MausRundung362/mcp-explorer>.

Tool names may be surfaced with a server prefix depending on the client, e.g.
`project-explorer_explore_project` in opencode. Use the name your client shows.

## Startup configuration

Allowed directories come from either source; **positional args win** when both
are present:

```jsonc
// positional: every non-flag arg is an allowed directory
"args": ["-y", "@team-jd/mcp-project-explorer", "C:/repo/a", "C:/repo/b"]
```

```jsonc
// environment: PROJECT_EXPLORER_ALLOWED_DIRS (or MCP_ALLOWED_DIRS),
// separated by the platform path delimiter: ';' on Windows, ':' on POSIX
"env": { "PROJECT_EXPLORER_ALLOWED_DIRS": "C:/repo/a;C:/repo/b" }
```

With no allow-list configured, the server reports an empty directory list and
runs with unrestricted filesystem access, defaulting tool paths to its own
`process.cwd()`.

Disable any tool at startup so it never appears in the tool list:

```jsonc
"args": ["-y", "@team-jd/mcp-project-explorer", "--disable-tool=delete_file",
         "--disable-tool", "rename_file"]
```

Disablable names: `explore_project`, `list_allowed_directories`, `search_files`,
`rename_file`, `delete_file`, `check_outdated`.

## `list_allowed_directories`

No arguments. Returns the directories the server may touch; an empty result
means there is no allow-list.

## `explore_project`

| Arg | Type | Default | Notes |
|---|---|---|---|
| `directory` | string | first allowed dir, else cwd | Absolute, or relative to the first allowed dir |
| `path` | string | - | Alias for `directory` |
| `subDirectory` | string | `""` | Joined onto `directory` |
| `includeHidden` | boolean | `false` | `false` skips dot-prefixed files |

Output: file list with human-readable sizes, detected config files, and for code
files the parsed imports/exports/functions plus a local dependency graph (edges,
most-imported files, most-importing files).

Always excluded: `.next`, `node_modules`, `#export`, `.git`, `dist`, `build`,
`.vscode`, `.gradle`, `.idea`.

Language coverage: JS/TS/TSX/JSX get full import/export/function parsing with
edge resolution through `tsconfig` `baseUrl`/`paths`. Python (`.py`), Java
(`.java`), Kotlin (`.kt`, `.kts`), Go (`.go`), Rust (`.rs`), and C# (`.cs`) get
import/export-like declarations. Config parsing covers `.json`, `.yaml`,
`.yml`, `.toml`, `.xml`, `.gradle`, `.properties`.

## `search_files`

| Arg | Type | Default | Notes |
|---|---|---|---|
| `pattern` | string | `".*"` | Literal text, or regex when `regexMode` |
| `searchPath` / `path` | string | first allowed dir, else cwd | Must be inside the allow-list |
| `extensions` | string[] | all | Include the dot: `[".ts"]` |
| `excludeExtensions` | string[] | `[]` | |
| `excludePatterns` | string[] | `[]` | Filename wildcards such as `*test*` |
| `regexMode` | boolean | `false` | |
| `caseSensitive` | boolean | `false` | |
| `wordBoundary` | boolean | `false` | Whole-word matching |
| `multiline` | boolean | `false` | Regex across lines |
| `maxDepth` | integer | unlimited | Recursion depth |
| `followSymlinks` | boolean | `false` | |
| `includeBinary` | boolean | `false` | |
| `minSize` / `maxSize` | integer | none | Bytes |
| `modifiedAfter` / `modifiedBefore` | string | none | ISO 8601 mtime window |
| `snippetLength` | integer | `50` | Chars of context per match |
| `maxResults` | integer | `100` | Truncation cap |
| `sortBy` | string | `"relevance"` | `relevance`, `file`, `lineNumber`, `modified`, `size` |
| `groupByFile` | boolean | `true` | |
| `excludeComments` | boolean | `false` | Language-aware comment stripping |
| `excludeStrings` | boolean | `false` | String-literal stripping |
| `outputFormat` | string | `"text"` | `text`, `json`, `structured` |

Same default excluded directories as `explore_project`. Regex is JavaScript
syntax, so escape backslashes in JSON: `"console\\.log"`.

## `check_outdated`

| Arg | Type | Default | Notes |
|---|---|---|---|
| `projectPath` | string | first allowed dir | Directory holding `package.json` |
| `path` | string | - | Alias for `projectPath` |
| `includeDevDependencies` | boolean | `true` | |
| `outputFormat` | string | `"detailed"` | `detailed`, `summary`, `raw` |

Shells out to `npm outdated --json`, so npm must be installed and reachable, and
the registry must be reachable. It reports; it never installs or updates.

## `rename_file`

| Arg | Type | Notes |
|---|---|---|
| `oldPath` | string (required) | Current path |
| `newPath` | string (required) | Destination; must not already exist |

Renames and/or moves files and directories, creating missing destination
folders. Both paths must be inside the allow-list. Imports referencing the moved
file are not updated. No `additionalProperties`.

## `delete_file` (disabled by this plugin)

| Arg | Type | Default | Notes |
|---|---|---|---|
| `path` | string (required) | - | File or directory |
| `recursive` | boolean | `false` | Required for non-empty directories |
| `force` | boolean | `false` | Also deletes read-only files |

Irreversible - no trash, no undo. This plugin starts the server with
`--disable-tool=delete_file`; remove that flag from `mcp.json` only if the user
explicitly wants the tool, and reload the MCP server afterwards.

## Errors

- `Access denied: The path '...' is not in the list of allowed directories: ...`
  - path outside the allow-list; re-run `list_allowed_directories`.
- `The path '...' does not exist or is not a directory. Did you mean: ...?`
  - typo or wrong relative root; retry once with a suggested path.
- `Unknown tool: <name>. Did you mean: ...?` - prefixed or misspelled tool name.
- `Tool "<name>" is disabled` - suppressed by a `--disable-tool` flag at startup.

Audit logging is in-memory plus console output of the server process; the server
does not write log files.
