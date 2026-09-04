import * as util from 'util';

export interface AuditLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  type: 'request' | 'response' | 'error' | 'tool-call';
  toolName?: string;
  requestId: string;
  data?: Record<string, any>;
  message: string;
}

let requestCounter = 0;
const generateRequestId = (): string => {
  requestCounter++;
  return `req-${Date.now()}-${requestCounter}`;
};

class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private maxLogs: number = 1000;

  log(entry: Omit<AuditLogEntry, 'timestamp'>): void {
    const fullEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };
    
    this.logs.push(fullEntry);
    
    // Keep logs within max limit
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    // Diagnostics go to stderr: stdout is reserved for the JSON-RPC channel.
    this.logToConsole(fullEntry);
  }

  private logToConsole(entry: AuditLogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.type}]`;
    if (entry.toolName) {
      console.error(`${prefix} [${entry.toolName}] [${entry.requestId}] ${entry.message}`);
    } else {
      console.error(`${prefix} [${entry.requestId}] ${entry.message}`);
    }
    if (entry.data && Object.keys(entry.data).length > 0) {
      console.error(util.inspect(entry.data, { depth: null, colors: false }));
    }
  }

  getLogs(): AuditLogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }
}

export const auditLogger = new AuditLogger();
export { generateRequestId };
