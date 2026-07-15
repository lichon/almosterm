# Data Model: Local Virtual File System Terminal

**Feature**: 002-local-virtual-fs
**Date**: 2026-07-15

**Note**: The virtual filesystem is provided by **ZenFS** (`@zenfs/core`), which implements the full Node.js `fs` API. Custom VFS tree entities are replaced by ZenFS's built-in abstractions.

## Entities

### FsConfiguration

Configuration for the ZenFS filesystem instance. Determines which backends are mounted and how persistence works.

| Field | Type | Description |
|-------|------|-------------|
| primaryBackend | 'InMemory' \| 'IndexedDB' \| 'Overlay' | The primary storage backend |
| indexDBName | string | IndexedDB database name when using IndexedDB backend (default: `'almosterm-vfs'`) |
| overlayConfig | OverlayConfig \| null | When using Overlay backend: read-only base + writable layer |
| maxSize | number | Maximum total filesystem size in bytes (default: 100MB, enforced at write time) |
| defaultPermissions | number | Default Unix permission mode for new files/directories (default: `0o644` for files, `0o755` for dirs) |

**Backend Strategies**:

| Strategy | Primary Backend | Persistence | Use Case |
|----------|----------------|-------------|----------|
| Ephemeral | InMemory | None (lost on reload) | Quick sessions, testing |
| Persistent | IndexedDB | Auto-saved on every mutation | Normal usage |
| Overlay | Overlay(InMemory + IndexedDB) | Writes go to IndexedDB via writable layer | Fast reads + persistent writes |

**Default**: `Persistent` (IndexedDB backend) for auto-save. Users can switch to `Ephemeral` via a command flag.

**Validation Rules**:
- maxSize: Must be between 1MB and 500MB
- indexDBName: Must be a valid IndexedDB database name

---

### TerminalSession

Represents a single browser tab's terminal state. Not persisted across tabs.

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID v4) | Unique session identifier |
| cwd | string | Current working directory path within the VFS (e.g., `/home/user`) |
| commandHistory | string[] | Ordered list of previously executed commands |
| historyIndex | number | Position in history navigation (-1 = not navigating) |
| fsConfig | FsConfiguration | Reference to ZenFS configuration (shared across sessions) |
| createdAt | number (Unix ms) | Session creation timestamp |

**Validation Rules**:
- cwd: Must be a valid, existing directory path in the VFS (checked via `fs.existsSync`)
- historyIndex: Must be between -1 and commandHistory.length - 1

---

### CommandResult

Return value from every command handler execution.

| Field | Type | Description |
|-------|------|-------------|
| stdout | string | Standard output text |
| stderr | string | Standard error text |
| exitCode | number | Exit code (0 = success, non-zero = error) |

---

### CustomCliTool

A user-registered command that extends the terminal.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Unique command name for invocation |
| type | 'script' \| 'binary' | Whether the tool is an inline script or external binary |
| scriptContent | string \| null | Inline script source (for type='script') |
| executablePath | string \| null | Path to binary (for type='binary') |
| description | string \| null | Human-readable description |
| version | string \| null | Version string |
| registeredAt | number (Unix ms) | Registration timestamp |

**Validation Rules**:
- name: Must match `/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/`
- name: Must not shadow a built-in command
- name: Must be unique among registered tools
- For type='script': scriptContent must be non-empty
- For type='binary': executablePath must exist and be executable

---

## ZenFS Integration

### How Command Handlers Use ZenFS

ZenFS provides a standard `fs` module. Command handlers use it directly:

```typescript
// Built-in command handlers use ZenFS's fs API
import { fs } from '@zenfs/core';

// ls handler
async function lsHandler(args: string[], cwd: string): Promise<CommandResult> {
  const targetDir = args[0] ? resolvePath(args[0], cwd) : cwd;
  const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
  const output = entries.map(e => formatEntry(e)).join('\n');
  return { stdout: output, stderr: '', exitCode: 0 };
}

// cat handler
async function catHandler(args: string[], cwd: string): Promise<CommandResult> {
  const filePath = resolvePath(args[0], cwd);
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return { stdout: content, stderr: '', exitCode: 0 };
}
```

### Session cwd Tracking

The `cwd` is maintained as a plain string in `TerminalSession`. Path resolution uses ZenFS's `path` module or the standard `path` package:

```typescript
import { resolve, join } from 'path';

function resolvePath(input: string, cwd: string): string {
  return input.startsWith('/') ? resolve(input) : resolve(join(cwd, input));
}
```

### Persistence via IndexedDB Backend

When the IndexedDB backend is configured, ZenFS handles persistence transparently. The store detects the backend type at startup and configures accordingly:

```
Startup flow:
  1. Check if IndexedDB backend has data → mount IndexedDB backend
  2. If no data → mount InMemory backend with default VFS structure
  3. Optionally switch to Overlay(InMemory + IndexedDB) for fast-read + persistent-write
```

### Export / Import

- **Export**: Use ZenFS streams to traverse the filesystem and produce a downloadable archive (`.vfs.tar` or `.vfs.zip`).
- **Import**: Read an uploaded archive file, extract entries, and write them into the active ZenFS backend.
- The export/import format is standard TAR or ZIP, not a custom JSON format.

---

## Relationships

```
FsConfiguration (1)
    └── ZenFS instance (1, singleton)
            ├── InMemory or IndexedDB backend
            └── Used by all command handlers via `fs` API

TerminalSession (many) ─── references ─── FsConfiguration (1, shared)

CommandRegistry (1)
    ├── builtins: Map<string, CommandHandler>  (use ZenFS fs API)
    └── custom: Map<string, CustomCliTool>
```

---

## State Transitions

### TerminalSession
```
[created on tab open] ──(command executed)──> [active]
                                                  │
                          (tab closed / timeout)──┘
                                                  │
                                          [terminated / garbage collected]
```

### FsConfiguration Backend Switch
```
[InMemory (ephemeral)]
        │
        ├──(user enables persistence)──> [IndexedDB (persistent)]
        │                                       │
        └──(user disables persistence)──────────┘
```
