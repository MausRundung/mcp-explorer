# 🔍 Project Explorer MCP Server

> **A powerful Model Context Protocol server for exploring, analyzing, and managing project files with advanced search capabilities**
>
> **📦 Available on npm:** [`@team-jd/mcp-project-explorer`](https://www.npmjs.com/package/@team-jd/mcp-project-explorer)

## ⚡ Quick Start

```json
{
  "mcpServers": {
    "project-explorer": {
      "command": "npx",
      "args": ["-y", "@team-jd/mcp-project-explorer", "/your/project/path"]
    }
  }
}
```

[![npm version](https://img.shields.io/npm/v/@team-jd/mcp-project-explorer.svg)](https://www.npmjs.com/package/@team-jd/mcp-project-explorer)
[![npm downloads](https://img.shields.io/npm/dm/@team-jd/mcp-project-explorer.svg)](https://www.npmjs.com/package/@team-jd/mcp-project-explorer)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org)
[![GitHub](https://img.shields.io/badge/GitHub-MCP--Explorer-blue.svg)](https://github.com/MausRundung362/mcp-explorer)

---

## 🚀 Overview

The Project Explorer MCP Server provides comprehensive tools for analyzing project structures, searching through codebases, managing dependencies, and performing file operations. Perfect for developers who need intelligent project navigation and analysis capabilities.

## 📦 Installation & Setup

### 🚀 For MCP Users (Recommended)

Add this server to your MCP settings configuration:

```json
{
  "mcpServers": {
    "project-explorer": {
      "command": "npx",
      "args": [
        "-y",
        "@team-jd/mcp-project-explorer",
        "/path/to/your/project"
      ]
    }
  }
}
```

**📁 Multiple Directory Access:**
```json
{
  "mcpServers": {
    "project-explorer": {
      "command": "npx",
      "args": [
        "-y",
        "@team-jd/mcp-project-explorer",
        "/path/to/project1",
        "/path/to/project2",
        "/path/to/project3"
      ]
    }
  }
}
```

### 🛠️ For Developers

```bash
# Clone and setup for development
git clone https://github.com/MausRundung362/mcp-explorer.git
cd mcp-explorer

# Install dependencies
npm install

# Build the project
npm run build

# Run the MCP inspector for testing
npm run inspector
```

---

## 🛠️ Available Commands

### 📂 `explore_project`
**Analyzes project structure with detailed file information and import/export analysis**

```typescript
// Basic usage
explore_project({
  directory: "/path/to/project"
})

// Advanced usage
explore_project({
  directory: "/path/to/project",
  subDirectory: "src",           // Optional: focus on specific subdirectory
  includeHidden: false          // Optional: include hidden files (default: false)
})
```

**✨ Features:**
- 📊 File size analysis with human-readable formatting
- 🔍 Import/export statement detection for JS/TS files
- 🚫 Automatically excludes build directories (`node_modules`, `.git`, `dist`, `.vscode`, `.gradle`, `.idea`, etc.)
- 📁 Recursive directory traversal
- 🎯 Support for subdirectory analysis

---

### 🔎 `search_files`
**Advanced file and code search with comprehensive filtering capabilities**

```typescript
// Simple text search
search_files({
  pattern: "your search term",
  searchPath: "/path/to/search"
})

// Advanced search with filters
search_files({
  pattern: "function.*async",     // Regex pattern
  searchPath: "/path/to/search",
  regexMode: true,               // Enable regex
  caseSensitive: false,          // Case sensitivity
  extensions: [".js", ".ts"],    // File types to include
  excludeExtensions: [".min.js"], // File types to exclude
  excludeComments: true,         // Skip comments
  excludeStrings: true,          // Skip string literals
  maxResults: 50,                // Limit results
  sortBy: "relevance"            // Sort method
})
```

**🎛️ Search Options:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `pattern` | string | `".*"` | Search pattern (text or regex) |
| `searchPath` | string | *first allowed dir* | Directory to search in |
| `extensions` | string[] | *all* | Include only these file types |
| `excludeExtensions` | string[] | `[]` | Exclude these file types |
| `excludePatterns` | string[] | `[]` | Exclude filename patterns |
| `regexMode` | boolean | `false` | Treat pattern as regex |
| `caseSensitive` | boolean | `false` | Case-sensitive search |
| `wordBoundary` | boolean | `false` | Match whole words only |
| `multiline` | boolean | `false` | Multiline regex matching |
| `maxDepth` | number | *unlimited* | Directory recursion depth |
| `followSymlinks` | boolean | `false` | Follow symbolic links |
| `includeBinary` | boolean | `false` | Search in binary files |
| `minSize` | number | *none* | Minimum file size (bytes) |
| `maxSize` | number | *none* | Maximum file size (bytes) |
| `modifiedAfter` | string | *none* | Files modified after date (ISO 8601) |
| `modifiedBefore` | string | *none* | Files modified before date (ISO 8601) |
| `snippetLength` | number | `50` | Text snippet length around matches |
| `maxResults` | number | `100` | Maximum number of results |
| `sortBy` | string | `"relevance"` | Sort by: relevance, file, lineNumber, modified, size |
| `groupByFile` | boolean | `true` | Group results by file |
| `excludeComments` | boolean | `false` | Skip comments (language-aware) |
| `excludeStrings` | boolean | `false` | Skip string literals |
| `outputFormat` | string | `"text"` | Output format: text, json, structured |

**🎯 Use Cases:**
- 🔍 Find all TODO comments: `pattern: "TODO.*", excludeStrings: true`
- 🐛 Search for potential bugs: `pattern: "console\\.log", regexMode: true`
- 📦 Find import statements: `pattern: "import.*from", regexMode: true`
- 🔧 Recent changes: `modifiedAfter: "2024-01-01", extensions: [".js", ".ts"]`

---

### 📊 `check_outdated`
**Checks for outdated npm packages with detailed analysis**

```typescript
// Basic check
check_outdated({
  projectPath: "/path/to/project"
})

// Detailed analysis
check_outdated({
  projectPath: "/path/to/project",
  includeDevDependencies: true,  // Include dev dependencies
  outputFormat: "detailed"       // detailed, summary, or raw
})
```

**📋 Output Formats:**
- **`detailed`** - Full package info with versions and update commands
- **`summary`** - Count of outdated packages by type
- **`raw`** - Raw npm outdated JSON output

**🔧 Requirements:**
- Node.js and npm must be installed
- Valid `package.json` in the specified directory

---

### 🗑️ `delete_file`
**Safely delete files or directories with protection mechanisms**

```typescript
// Delete a file
delete_file({
  path: "/path/to/file.txt"
})

// Delete a directory (requires recursive flag)
delete_file({
  path: "/path/to/directory",
  recursive: true,              // Required for directories
  force: false                  // Force deletion of read-only files
})
```

**⚠️ Safety Features:**
- 🔒 Only works within allowed directories
- 📁 Requires `recursive: true` for non-empty directories
- 🛡️ Protection against accidental deletions
- ⚡ Optional force deletion for read-only files

---

### ✏️ `rename_file`
**Rename or move files and directories**

```typescript
// Simple rename
rename_file({
  oldPath: "/path/to/old-name.txt",
  newPath: "/path/to/new-name.txt"
})

// Move to different directory
rename_file({
  oldPath: "/path/to/file.txt",
  newPath: "/different/path/file.txt"
})
```

**✨ Features:**
- 📁 Works with both files and directories
- 🔄 Can move between directories
- 🚫 Fails if destination already exists
- 🔒 Both paths must be within allowed directories

---

### 📋 `list_allowed_directories`
**Shows which directories the server can access**

```typescript
list_allowed_directories()
```

**🔧 Use Cases:**
- 🔍 Check access permissions before operations
- 🛡️ Security validation
- 📂 Directory discovery

---

## 🎨 Usage Examples

### 📊 Project Analysis Workflow

```typescript
// 1. Check what directories you can access
list_allowed_directories()

// 2. Explore the project structure
explore_project({
  directory: "/your/project/path",
  includeHidden: false
})

// 3. Search for specific patterns
search_files({
  pattern: "useState",
  searchPath: "/your/project/path",
  extensions: [".jsx", ".tsx"],
  excludeComments: true
})

// 4. Check for outdated dependencies
check_outdated({
  projectPath: "/your/project/path",
  outputFormat: "detailed"
})
```

### 🔍 Advanced Search Scenarios

```typescript
// Find all async functions
search_files({
  pattern: "async\\s+function",
  regexMode: true,
  extensions: [".js", ".ts"]
})

// Find large files modified recently
search_files({
  pattern: ".*",
  minSize: 1000000,  // 1MB+
  modifiedAfter: "2024-01-01",
  sortBy: "size"
})

// Find TODO comments excluding test files
search_files({
  pattern: "TODO|FIXME|BUG",
  regexMode: true,
  excludePatterns: ["*test*", "*spec*"],
  excludeStrings: true
})
```

---

## 🛡️ Security & Permissions

The server operates within **allowed directories** only, providing:

- 🔒 **Sandboxed access** - Cannot access files outside allowed paths
- 🛡️ **Safe operations** - Built-in protections against dangerous operations
- 📂 **Path validation** - All paths are normalized and validated
- ⚠️ **Error handling** - Clear error messages for permission issues

---

## 🔧 Development

### 📁 Project Structure

```
src/
├── index.ts              # Main server entry point
├── explore-project.ts    # Project analysis tool
├── search.ts            # Advanced search functionality
├── check-outdated.ts   # NPM dependency checker
├── delete-file.ts       # File deletion tool
├── rename-file.ts       # File rename/move tool
└── list-allowed.ts      # Directory permission checker
```

### 🏗️ Build Commands

```bash
npm run build     # Compile TypeScript
npm run watch     # Watch mode for development
npm run inspector # Test with MCP inspector
```

---

## 🤝 Contributing

1. 🍴 Fork the repository
2. 🌟 Create a feature branch
3. 💻 Make your changes
4. ✅ Test thoroughly
5. 🚀 Submit a pull request

---

## 📄 License

See [LICENSE](LICENSE) file for details.

---

<div align="center">

**Happy coding!** 🎉

*Built with ❤️ using TypeScript and the Model Context Protocol*

</div>
