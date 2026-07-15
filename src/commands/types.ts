export interface ParsedCommand {
  /** Command name (first word) */
  name: string;
  /** Arguments after the command name */
  args: string[];
  /** Redirect operator info if present */
  redirect?: RedirectInfo;
}

export interface RedirectInfo {
  /** Type of redirect: > (overwrite), >> (append), 2> (stderr redirect) */
  type: '>' | '>>' | '2>';
  /** Target file path */
  target: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Command handler function type.
 * Takes parsed args and current working directory, returns a result.
 */
export type CommandHandler = (args: string[], cwd: string) => Promise<CommandResult>;
