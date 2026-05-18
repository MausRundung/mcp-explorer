import { CallToolRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

// Tool definition
export const listAllowedTool = {
  name: "list_allowed_directories",
  description: "Returns the list of directories that this MCP server is allowed to access. This is useful for understanding which directories can be explored or searched before attempting to use other tools. The allowed directories are configured when the server starts and cannot be modified at runtime.",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
};

// Tool handler
export async function handleListAllowed(args: any, allowedDirectories: string[]) {
  let result = "# Allowed Directories\n\n";
  
  if (allowedDirectories.length === 0) {
    result += "No allow-list is configured. The server is running with unrestricted filesystem access.";
  } else {
    result += `This MCP server has access to ${allowedDirectories.length} director${allowedDirectories.length === 1 ? 'y' : 'ies'}:\n\n`;
    
    allowedDirectories.forEach((dir, index) => {
      result += `${index + 1}. ${dir}\n`;
    });
    
    result += "\nYou can use these directories with other tools like explore_project, search_files, etc.";
  }
  
  return {
    content: [
      {
        type: "text",
        text: result
      }
    ]
  };
}
