# Project Explorer (Qoder plugin)

Maps, searches, and analyzes codebases through the `project-explorer` MCP
server: a structure scan with import/export/function parsing and a local
dependency graph, a heavily filterable regex search, an npm outdated check, and
a guarded rename/move. Qoder gets one invocable skill plus the MCP registration.

## Package contents

| Path | Component | Purpose |
|---|---|---|
| `.qoder-plugin/plugin.json` | manifest | Declares the skill and the MCP server |
| `skills/project-explorer/SKILL.md` | skill | Workflow: scope → map → search → audit → gated mutations |
| `skills/project-explorer/references/tool-reference.md` | skill reference | Full argument tables, defaults, startup flags, error meanings |
| `mcp.json` | MCP server | STDIO launch of `@team-jd/mcp-project-explorer` with `delete_file` disabled |
| `CONNECTORS.md` | setup notes | Node/npm requirements, allow-list pinning, local-build alternative |
| `assets/avatar.svg` | logo | Locally generated icon |

Requires Node.js >= 16 and npm registry access on first launch; no credentials.
Read [CONNECTORS.md](CONNECTORS.md) before sharing the plugin with a team, since
the default config runs without an allow-list.

## Source provenance

- **Source:** local workspace `c:\Jansky-Design\2026\MCP\mcp-explorer`
  (`main` at `0c2daa3`), package `@team-jd/mcp-project-explorer` version `0.1.2`.
- **Upstream:** <https://github.com/MausRundung362/mcp-explorer> - MIT licensed,
  author Noah Jansky. Metadata carried into `plugin.json`.
- **Runtime:** the plugin launches the **published npm package** rather than
  vendoring the server source, so the package stays small and self-updating.
  npm currently serves `latest = 0.1.1`; the local `0.1.2` tag is not published
  yet, and its only delta is the `bin` path string and `repository.url` format,
  so tool behavior matches. To run unreleased source, use the local-build config
  in [CONNECTORS.md](CONNECTORS.md).
- **Logo:** generated locally for this plugin; the upstream repository ships no
  logo or icon asset.

## What was adapted

- `opencode.json` was **not** copied. It hard-codes
  `C:/Jansky-Design/2026/MCP/mcp-explorer/build/index.js` plus a machine-specific
  allowed directory, which is not distributable. `mcp.json` is the portable
  equivalent via npx.
- `AGENTS.md` guidance was folded into the skill and its reference (call order,
  exclusion list, argument semantics, delete safety). It stayed the source of
  truth in the repository and was **not** duplicated into a plugin `rules/`
  directory, because "explore at the start of every chat" is task-dependent
  behavior that belongs in a triggerable skill, not globally injected rules.
- `src/`, `build/`, `.github/workflows`, and npm development scripts are server
  implementation and repository tooling, not plugin components, so they are
  omitted from the package.
- Nothing referenced by the skill is missing: the only links are to the bundled
  tool reference and `CONNECTORS.md`.

Not declared in the manifest, because they were intentionally not created:
`rules`, `agents`, `commands`, `hooks`, `canvases`.

## Validation

Offline validator (bundled with the `create-plugin` skill):

```text
> python .../scripts/validate_qoder_plugin.py plugin\project-explorer
Validating Qoder plugin: C:\Jansky-Design\2026\MCP\mcp-explorer\plugin\project-explorer
OK: no issues found
```

Live STDIO smoke test against the built server with the same startup flags the
plugin uses (`node build/index.js . --disable-tool=delete_file`):

- `initialize` responded with `serverInfo.name = "project-explorer"`.
- `tools/list` returned `explore_project`, `list_allowed_directories`,
  `search_files`, `rename_file`, `check_outdated` - `delete_file` correctly
  suppressed by the shipped flag.
- `list_allowed_directories` returned exactly the one sandboxed root passed as a
  positional argument.

`qodercli` is not installed on this machine, so no install/discovery smoke test
was run; `npx` package resolution was verified against the registry
(`@team-jd/mcp-project-explorer` versions `0.1.0`, `0.1.1`) but not downloaded
and executed through npx.

## Known upstream issue

The server's audit logger writes human-readable log lines with `console.log`,
which shares **stdout** with the JSON-RPC channel. Observed during the smoke
test:

```text
[2026-09-04T14:37:40.851Z] [INFO] [request] [list_allowed_directories] [req-...] Received tool call request
```

Most MCP clients skip unparseable lines, and the responses above still parsed
fine, but strict transports can choke. The upstream fix is `console.error` in
`src/audit-logger.ts`; it is reported here rather than patched, since this task
was packaging, not modifying the server.
