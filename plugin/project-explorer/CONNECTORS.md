# Connectors and Setup

No credentials, tokens, or accounts are required. The MCP server runs locally
from npm and reads the filesystem, so the setup notes are about the runtime and
the access scope rather than secrets.

## Requirements

- **Node.js >= 16** with `npx` on the `PATH` (the plugin launches
  `npx -y @team-jd/mcp-project-explorer`).
- **Network access to the npm registry** on first launch, because `-y` lets npx
  install `@team-jd/mcp-project-explorer` into its cache. Subsequent launches
  reuse the cache.
- `check_outdated` additionally shells out to `npm outdated`, so npm must be
  installed and the registry reachable when that tool is called.

If the npm package is unavailable in your environment, switch `mcp.json` to a
local build (see below) to remove the network dependency.

## Pinning the accessible directories (recommended)

The shipped `mcp.json` passes no directory, which leaves the server with **no
allow-list** - it can read anywhere and tool paths default to its own working
directory. Add the project roots the agent should be limited to:

```jsonc
{
  "mcpServers": {
    "project-explorer": {
      "command": "npx",
      "args": [
        "-y",
        "@team-jd/mcp-project-explorer",
        "C:/path/to/your/project",
        "--disable-tool=delete_file"
      ]
    }
  }
}
```

Multiple roots are supported as repeated positional args. Alternatively use the
environment variable, separated by the platform path delimiter (`;` on Windows,
`:` on POSIX); positional args take precedence if both are set:

```jsonc
"env": { "PROJECT_EXPLORER_ALLOWED_DIRS": "C:/path/to/project;D:/repos/other" }
```

After editing `mcp.json`, reload the MCP server (or restart Qoder) so the new
startup arguments take effect.

## Enabling or disabling tools

All six tools exist server-side; control exposure with `--disable-tool=<name>`
or `--disable-tool <name>`:

```jsonc
"args": ["-y", "@team-jd/mcp-project-explorer",
         "--disable-tool=delete_file", "--disable-tool", "rename_file"]
```

This package deliberately ships `--disable-tool=delete_file` because deletion is
irreversible. Remove the flag to expose it. Valid names: `explore_project`,
`list_allowed_directories`, `search_files`, `rename_file`, `delete_file`,
`check_outdated`.

## Using a local build instead of npm

Useful offline, for debugging the server, or to run unreleased changes:

```bash
git clone https://github.com/MausRundung362/mcp-explorer.git
cd mcp-explorer
npm install
npm run build
```

Then point the server at the compiled entry and your allowed roots:

```jsonc
{
  "mcpServers": {
    "project-explorer": {
      "command": "node",
      "args": [
        "C:/absolute/path/to/mcp-explorer/build/index.js",
        "C:/path/to/your/project",
        "--disable-tool=delete_file"
      ]
    }
  }
}
```

Replace both paths with your own; do not copy a maintainer's machine-specific
path into a shared plugin.
