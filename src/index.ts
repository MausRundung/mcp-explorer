#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import * as path from "path";

// Import modular tools and handlers
import { exploreProjectTool, handleExploreProject } from './explore-project.js';
import { listAllowedTool, handleListAllowed } from './list-allowed.js';
import { searchTool, handleSearch } from './search.js';
import { renameFileTool, handleRenameFile } from './rename-file.js';
import { deleteFileTool, handleDeleteFile } from './delete-file.js';
import { checkOutdatedTool, handleCheckOutdated } from './check-outdated.js';

function normalizeDirectoryList(directories: string[]): string[] {
  const normalized = directories
    .filter(Boolean)
    .map((dir) => path.resolve(dir).replace(/\\/g, "/"));

  return Array.from(new Set(normalized));
}

function getAllowedDirectoriesFromEnv(): string[] {
  const envValue = process.env.PROJECT_EXPLORER_ALLOWED_DIRS || process.env.MCP_ALLOWED_DIRS;
  if (!envValue) return [];
  return envValue
    .split(path.delimiter)
    .map((dir) => dir.trim())
    .filter(Boolean);
}

const cliDirectories = process.argv.slice(2);
const envDirectories = getAllowedDirectoriesFromEnv();
const ALLOWED_DIRECTORIES = normalizeDirectoryList(
  cliDirectories.length > 0 ? cliDirectories : envDirectories
);

// Initialize the MCP server
const server = new Server({
  name: "project-explorer",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {}
  }
});

// Define available tools using imported tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      exploreProjectTool,
      listAllowedTool,
      searchTool,
      renameFileTool,
      deleteFileTool,
      checkOutdatedTool
    ]
  };
});

// Handle tool execution using imported handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Safely access arguments with null checking
  const args = request.params.arguments || {};
  
  // Route to appropriate handler based on tool name
  switch (request.params.name) {
    case "list_allowed_directories":
      return await handleListAllowed(args, ALLOWED_DIRECTORIES);
      
    case "explore_project":
      return await handleExploreProject(args, ALLOWED_DIRECTORIES);
      
    case "search_files":
      return await handleSearch(args, ALLOWED_DIRECTORIES);
      
    case "rename_file":
      return await handleRenameFile(args, ALLOWED_DIRECTORIES);
      
    case "delete_file":
      return await handleDeleteFile(args, ALLOWED_DIRECTORIES);
      
    case "check_outdated":
      return await handleCheckOutdated(args, ALLOWED_DIRECTORIES);
      
    default:
      throw new McpError(
        ErrorCode.InvalidRequest, 
        `Unknown tool: ${request.params.name}`
      );
  }
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
