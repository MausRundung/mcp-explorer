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
import { suggestStrings } from "./suggest.js";
import { auditLogger, generateRequestId } from './audit-logger.js';
import { concurrencyManager } from './concurrency-manager.js';

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
  const requestId = generateRequestId();
  const toolName = request.params.name;
  const args = request.params.arguments || {};
  
  auditLogger.log({
    level: 'info',
    type: 'request',
    toolName,
    requestId,
    data: { args: Object.keys(args).length > 0 ? args : 'no arguments provided' },
    message: 'Received tool call request'
  });
  
  try {
    const result = await concurrencyManager.execute(requestId, async () => {
      switch (toolName) {
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
          {
            const toolNames = [
              "list_allowed_directories",
              "explore_project",
              "search_files",
              "rename_file",
              "delete_file",
              "check_outdated",
            ];
            const suggestions = suggestStrings(toolName, toolNames, 3);
            const suffix = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
            throw new McpError(
              ErrorCode.InvalidRequest, 
              `Unknown tool: ${toolName}.${suffix}`
            );
          }
      }
    });
    
    auditLogger.log({
      level: 'info',
      type: 'response',
      toolName,
      requestId,
      message: 'Tool call completed successfully'
    });
    
    return result;
    
  } catch (error) {
    auditLogger.log({
      level: 'error',
      type: 'error',
      toolName,
      requestId,
      data: { error: error instanceof Error ? error.message : String(error) },
      message: 'Tool call failed'
    });
    
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `Internal error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
