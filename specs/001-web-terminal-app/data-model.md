# Data Model: Web Terminal Application

**Feature**: 001-web-terminal-app
**Date**: 2026-07-15

## Entities

### TerminalSession

Represents a single browser tab's connection to the backend. Each session has its own pseudo-terminal (PTY) process running a bash shell.

| Field | Type | Description |
|-------|------|-------------|
| id | string (UUID v4) | Unique session identifier, generated on WebSocket connect |
| ptyProcess | reference | Handle to the node-pty process (bash shell) |
| cwd | string | Current working directory (tracked from `cd` commands) |
| env | Record<string, string> | Environment variables for the session (inherited from server process) |
| commandHistory | string[] | Ordered list of previously executed commands in this session |
| historyIndex | number | Current position in command history navigation (-1 = not navigating) |
| createdAt | ISO 8601 timestamp | When the session was created |
| lastActivityAt | ISO 8601 timestamp | When the last command was executed or output was received |
| status | 'active' \| 'idle' \| 'terminated' | Current session state |

**Lifecycle**:
```
[WebSocket connected] → active → [WebSocket disconnected or timeout] → terminated
```

**Validation Rules**:
- id: Must be unique across all active sessions
- cwd: Must be a valid, accessible directory path; defaults to server's working directory on creation
- Sessions auto-terminate after 30 minutes of inactivity (idle) or immediately on WebSocket disconnect

---

### Command

Represents a single command execution within a terminal session. A command is spawned as a child process through the PTY.

| Field | Type | Description |
|-------|------|-------------|
| raw | string | The full command string as typed by the user (e.g., `ls -la /tmp`) |
| resolvedPath | string \| null | If the command resolves to a registered custom tool, the full executable path; otherwise null |
| startTime | ISO 8601 timestamp | When the command began execution |
| endTime | ISO 8601 timestamp \| null | When the command finished (null if still running) |
| exitCode | number \| null | Exit code of the process (null if still running or killed by signal) |
| signal | string \| null | Signal that terminated the process (e.g., `SIGINT`, `SIGTERM`), null if exited normally |
| sessionId | string | Foreign key to TerminalSession.id |

**Validation Rules**:
- raw: Must be non-empty string (trimmed)
- exitCode: Integer 0-255 when set
- endTime must be >= startTime when both are set

**State Machine**:
```
[started] → [running] → [completed] (exitCode set)
                      → [interrupted] (signal set)
                      → [timeout] (signal = SIGTERM, after configurable timeout)
```

---

### CustomCliTool

Represents a user-registered executable or script that can be invoked as a named command.

| Field | Type | Description |
|-------|------|-------------|
| name | string | Unique tool name used for invocation (e.g., `mybuild`, `deploy-staging`) |
| executablePath | string | Absolute path to the executable binary or script |
| description | string \| null | Optional human-readable description of what the tool does |
| version | string \| null | Optional version string |
| environment | Record<string, string> \| null | Optional additional environment variables to set when invoking this tool |
| registeredAt | ISO 8601 timestamp | When the tool was registered |

**Validation Rules**:
- name: Must match `/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/` (valid command name, 1-64 chars)
- name: Must be unique across all registered tools
- executablePath: Must be an existing file with execute permissions
- executablePath: Must be an absolute path
- name: Cannot shadow built-in commands (`node`, `bash`, `sh`, common Unix utilities) — registration rejected

**Storage**: JSON file at `~/.almosterm/tools.json`

```json
{
  "tools": {
    "mybuild": {
      "executablePath": "/home/user/scripts/build.sh",
      "description": "Build the project",
      "version": "1.0.0",
      "environment": { "NODE_ENV": "production" },
      "registeredAt": "2026-07-15T12:00:00Z"
    }
  }
}
```

---

### AlmostnodeRuntime

Represents the almostnode runtime capabilities and availability. Discovered at server startup.

| Field | Type | Description |
|-------|------|-------------|
| available | boolean | Whether almostnode is accessible and functional |
| version | string | almostnode version string (e.g., `v22.21.1`) |
| executablePath | string | Path to the `node` binary backed by almostnode |
| npxAvailable | boolean | Whether `npx` is available |
| checkedAt | ISO 8601 timestamp | When the runtime check was performed |

**Validation Rules**:
- available must be true for the server to accept Node.js commands
- version must be a valid semver string when available is true
- If available is false, Node.js commands return an error: "Almostnode runtime unavailable"

---

## Relationships

```
TerminalSession (1) ────< (many) Command
     │
     │ A session contains many commands executed over its lifetime.
     │ Commands are ephemeral (in-memory only, not persisted).
     │
CustomCliTool (standalone, registered independently)
     │
     │ Tools are resolved by name when a command is executed.
     │ If a command name matches a registered tool, the tool's executablePath is used.
     │
AlmostnodeRuntime (singleton, checked at server startup)
     │
     │ Used to determine availability for node command execution.
     │ Version displayed on server status endpoint.
```
