import { CallToolRequestSchema, ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import * as fs from 'fs';
import * as path from 'path';

export interface RenameResult {
  success: boolean;
  oldPath: string;
  newPath: string;
  message: string;
}

export const renameFileTool = {
  name: "rename_file",
  description: "Rename or move a file or directory. Can move files between directories and rename them in a single operation. If the destination exists, the operation will fail. Works across different directories and can be used for simple renaming within the same directory. Both source and destination must be within allowed directories.",
  inputSchema: {
    type: "object",
    properties: {
      oldPath: {
        type: "string",
        description: "Current path of the file or directory to rename"
      },
      newPath: {
        type: "string", 
        description: "New path for the file or directory"
      }
    },
    required: ["oldPath", "newPath"],
    additionalProperties: false
  }
};

export async function handleRenameFile(args: any, allowedDirectories: string[]) {
  const { oldPath, newPath } = args;

  if (!oldPath || !newPath) {
    throw new McpError(ErrorCode.InvalidParams, "Both oldPath and newPath are required");
  }

  // Resolve to absolute paths
  const resolvedOldPath = path.resolve(oldPath);
  const resolvedNewPath = path.resolve(newPath);

  // Check if source is within allowed directories
  const isOldPathAllowed = allowedDirectories.some(dir => {
    const normalizedDir = path.resolve(dir).replace(/\\/g, '/');
    const normalizedOldPath = resolvedOldPath.replace(/\\/g, '/');
    return normalizedOldPath === normalizedDir || normalizedOldPath.startsWith(normalizedDir + '/');
  });

  // Check if destination is within allowed directories
  const isNewPathAllowed = allowedDirectories.some(dir => {
    const normalizedDir = path.resolve(dir).replace(/\\/g, '/');
    const normalizedNewPath = resolvedNewPath.replace(/\\/g, '/');
    return normalizedNewPath === normalizedDir || normalizedNewPath.startsWith(normalizedDir + '/');
  });

  if (!isOldPathAllowed) {
    throw new McpError(ErrorCode.InvalidParams, `Source path "${resolvedOldPath}" is not within allowed directories`);
  }

  if (!isNewPathAllowed) {
    throw new McpError(ErrorCode.InvalidParams, `Destination path "${resolvedNewPath}" is not within allowed directories`);
  }

  try {
    // Check if source exists
    if (!fs.existsSync(resolvedOldPath)) {
      throw new McpError(ErrorCode.InvalidParams, `Source path "${resolvedOldPath}" does not exist`);
    }

    // Check if destination already exists
    if (fs.existsSync(resolvedNewPath)) {
      throw new McpError(ErrorCode.InvalidParams, `Destination path "${resolvedNewPath}" already exists`);
    }

    // Ensure destination directory exists
    const destDir = path.dirname(resolvedNewPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // Perform the rename/move operation
    fs.renameSync(resolvedOldPath, resolvedNewPath);

    const message = `# File/Directory Rename/Move Successful\n\n✅ Successfully renamed/moved "${oldPath}" to "${newPath}"\n\n**Details:**\n- Source: ${resolvedOldPath}\n- Destination: ${resolvedNewPath}\n- Operation: ${path.dirname(resolvedOldPath) === path.dirname(resolvedNewPath) ? 'Rename' : 'Move'}`;
    
    return {
      content: [
        {
          type: "text",
          text: message
        }
      ]
    };

  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to rename file: ${error.message}`
    );
  }
}
