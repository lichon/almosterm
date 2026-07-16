import type { CommandHandler } from './types';

/**
 * Reserved command names that cannot be shadowed by custom tools.
 */
const RESERVED_NAMES = new Set([
  'node', 'npx', 'npm', 'bash', 'sh', 'zsh', 'fish',
  'cd', 'ls', 'pwd', 'cat', 'echo', 'mkdir', 'touch',
  'rm', 'cp', 'mv', 'clear', 'help', 'paste', 'reload',
  'vfs-export', 'vfs-import',
  'test',
  'tool-register', 'tool-unregister', 'tool-list',
]);

export class CommandRegistry {
  private builtins: Map<string, CommandHandler> = new Map();
  private customResolvers: Array<(name: string) => CommandHandler | undefined> = [];

  register(name: string, handler: CommandHandler): void {
    this.builtins.set(name, handler);
  }

  unregister(name: string): void {
    this.builtins.delete(name);
  }

  /**
   * Add a custom resolver for non-builtin commands (e.g., custom CLI tools).
   */
  addCustomResolver(resolver: (name: string) => CommandHandler | undefined): void {
    this.customResolvers.push(resolver);
  }

  resolve(name: string): CommandHandler | undefined {
    // Check builtins first
    const builtin = this.builtins.get(name);
    if (builtin) return builtin;

    // Then try custom resolvers
    for (const resolver of this.customResolvers) {
      const handler = resolver(name);
      if (handler) return handler;
    }

    return undefined;
  }

  /**
   * Check if a name is reserved (cannot be used as custom tool name).
   */
  isReserved(name: string): boolean {
    return RESERVED_NAMES.has(name) || this.builtins.has(name);
  }

  list(): string[] {
    return Array.from(this.builtins.keys());
  }
}

/** Singleton registry instance */
export const registry = new CommandRegistry();
