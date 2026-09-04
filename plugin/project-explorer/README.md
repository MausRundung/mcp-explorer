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
| `CONNECTORS.md` | setup notes | Node/npm requirements, version-pin rationale, Windows `npx` fallback, allow-list pinning, local-build alternative |
| `assets/avatar.svg` | logo | Locally generated icon |

Requires Node.js >= 18 and npm registry access on first launch; no credentials.
Read [CONNECTORS.md](CONNECTORS.md) before sharing the plugin with a team, since
the default config runs without an allow-list.

## Publish prerequisite (action required)

`mcp.json` pins `@team-jd/mcp-project-explorer`, which **is not on npm
yet** - the registry currently serves `latest = 0.1.1`, and `0.1.1` corrupts the
STDIO channel (see "Fixed upstream issue" below). Publishing this plugin before
`0.1.3` exists on npm ships a server that never starts.

1. Ensure `.github/workflows/auto-release.yml` has a `Publish to npm` step (added
   alongside this fix) and that the repo secret `NPM_TOKEN` is set to a Granular
   Access Token permitted to publish `@team-jd/mcp-project-explorer`.
2. Merge the server fix to `main`; the workflow bumps the version, publishes to
   npm, then pushes the tag.
3. Confirm it landed, and that it matches the pin:
   `npm view @team-jd/mcp-project-explorer versions dist-tags --json`
4. If the release number differs from, update the pin in `mcp.json`,
   `CONNECTORS.md`, and the skill's setup notes, then re-run the smoke test below.

Manual alternative: `npm login && npm version patch && npm publish --access public`.

## Source provenance

- **Source:** local workspace `c:\Jansky-Design\2026\MCP\mcp-explorer`
  (`main` at `7852635`), package `@team-jd/mcp-project-explorer`.
- **Upstream:** <https://github.com/MausRundung/mcp-explorer> - MIT licensed,
  author Noah Jansky. Metadata carried into `plugin.json`. An earlier revision of
  these files pointed at `github.com/MausRundung362/...`; that account was
  renamed, and the API confirms `MausRundung/mcp-explorer` is canonical, so the
  old links worked only through GitHub's deprecated redirect and are corrected
  here. `LICENSE` still carries the original `MausRundung362` copyright string,
  left unchanged as a legal attribution.
- **Runtime:** the plugin launches the **published npm package** rather than
  vendoring the server source, so the package stays small and self-updating.
  To run unreleased source instead, use the local-build config in
  [CONNECTORS.md](CONNECTORS.md).
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
- One server-side change **was** required to make this plugin publishable, since
  the runtime it ships is the npm package: `src/audit-logger.ts` now writes to
  `console.error` with `colors: false`, and `package.json` gained `engines.node
  >=18` plus `publishConfig.access = public`. `.github/workflows/auto-release.yml`
  gained the missing `Publish to npm` step. These live in the repository, not in
  the plugin directory.

Not declared in the manifest, because they were intentionally not created:
`rules`, `agents`, `commands`, `hooks`, `canvases`.

## Validation

Offline validator (bundled with the `create-plugin` skill), on the directory and
on the distribution zip:

```text
> python .../scripts/validate_qoder_plugin.py plugin\project-explorer
Validating Qoder plugin: C:\Jansky-Design\2026\MCP\mcp-explorer\plugin\project-explorer
OK: no issues found
```

### STDIO smoke test, published 0.1.1 vs fixed build

A real STDIO client was scripted against both servers, sending `initialize`,
`notifications/initialized`, `tools/list`, and one `tools/call`
(`list_allowed_directories`), then classifying every stdout line as JSON-RPC or
not. The `0.1.1` column ran against the actual npm tarball, unpacked.

| Metric | published `0.1.1` | fixed build (`0.1.3`) |
|---|---|---|
| stdout lines | 6 | 3 |
| non-JSON-RPC lines | **3** | **0** |
| ANSI escapes in stdout | **yes** | no |
| `tools/list` result | 5 tools, `delete_file` suppressed | same |
| `tools/call` result | ok | ok |

Pollution sample from `0.1.1`, interleaved with protocol traffic:

```text
[2026-09-04T15:00:29.997Z] [INFO] [request] [list_allowed_directories] [req-1788534029997-1] Received tool call request
{ args: \u001b[32m'no arguments provided'\u001b[39m }
```

After the fix the same lines arrive on **stderr**, so the JSON-RPC channel parses
cleanly while diagnostics stay available.

### Not covered

- `qodercli` is not installed here, so plugin install/discovery smoke tests were
  not run; only the offline validator was.
- The `npx` launcher was **not** proven to work under Qoder's actual spawn path.
  Two facts were measured locally: spawning `npx` without a shell gives `ENOENT`
  when only `npx.cmd` exists, and spawning `npx.cmd` directly gives `EINVAL`
  (Node refuses `.cmd` without a shell). `cmd /c npx` and direct `node` both
  start successfully. This is client-dependent, so `CONNECTORS.md` documents the
  fallbacks; a Qoder runtime check is still worth doing after install.
- `0.1.3` is not on npm yet, so `npx -y @team-jd/mcp-project-explorer@0.1.3`
  cannot resolve today. See "Publish prerequisite".

## Fixed upstream issue

The server's audit logger wrote human-readable log lines with `console.log`,
which shares **stdout** with the JSON-RPC channel, and dumped the full argument
object via `util.inspect(..., { colors: true })`, injecting ANSI escapes into the
protocol stream. It fired unconditionally on every `tools/call` - there was no
opt-out flag - so half of the stream from the pinned `0.1.1` was non-protocol
text. Strict transports can fail to parse this; lenient clients skip the junk
lines and survive.

Fixed in `src/audit-logger.ts` by routing all audit output to `console.error` and
disabling colors, then pinned via `mcp.json` so the plugin cannot fall back to a
broken release.
