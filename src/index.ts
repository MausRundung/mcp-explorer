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

// Parse command-line arguments
interface ParsedArgs {
  allowedDirectories: string[];
  disabledTools: string[];
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const allowedDirectories: string[] = [];
  const disabledTools: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--disable-tool=')) {
      const toolName = arg.slice('--disable-tool='.length);
      disabledTools.push(toolName);
    } else if (arg === '--disable-tool' && i + 1 < args.length) {
      disabledTools.push(args[++i]);
    } else {
      allowedDirectories.push(arg);
    }
  }

  return { allowedDirectories, disabledTools };
}

const parsedArgs = parseArgs();
const envDirectories = getAllowedDirectoriesFromEnv();
const ALLOWED_DIRECTORIES = normalizeDirectoryList(
  parsedArgs.allowedDirectories.length > 0 ? parsedArgs.allowedDirectories : envDirectories
);

// Define all available tools with their handlers
interface ToolDefinition {
  name: string;
  tool: any;
  handler: (args: any, allowedDirs: string[]) => Promise<any>;
}

const TOOLS: ToolDefinition[] = [
  {
    name: 'explore_project',
    tool: exploreProjectTool,
    handler: handleExploreProject
  },
  {
    name: 'list_allowed_directories',
    tool: listAllowedTool,
    handler: handleListAllowed
  },
  {
    name: 'search_files',
    tool: searchTool,
    handler: handleSearch
  },
  {
    name: 'rename_file',
    tool: renameFileTool,
    handler: handleRenameFile
  },
  {
    name: 'delete_file',
    tool: deleteFileTool,
    handler: handleDeleteFile
  },
  {
    name: 'check_outdated',
    tool: checkOutdatedTool,
    handler: handleCheckOutdated
  }
];

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
    tools: TOOLS.filter(
      (toolDef) => !parsedArgs.disabledTools.includes(toolDef.name)
    ).map((toolDef) => toolDef.tool)
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
      // Check if tool is disabled
      if (parsedArgs.disabledTools.includes(toolName)) {
        throw new McpError(
          ErrorCode.InvalidRequest, 
          `Tool "${toolName}" is disabled`
        );
      }
      
      const toolDef = TOOLS.find(t => t.name === toolName);
      if (!toolDef) {
        const toolNames = TOOLS.map(t => t.name);
        const suggestions = suggestStrings(toolName, toolNames, 3);
        const suffix = suggestions.length > 0 ? ` Did you mean: ${suggestions.join(", ")}?` : "";
        throw new McpError(
          ErrorCode.InvalidRequest, 
          `Unknown tool: ${toolName}.${suffix}`
        );
      }
      
      return await toolDef.handler(args, ALLOWED_DIRECTORIES);
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
