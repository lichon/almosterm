# WebSocket Protocol Contract

**Feature**: 001-web-terminal-app
**Version**: 1.0.0

## Overview

The terminal server exposes a WebSocket endpoint for bidirectional communication between the browser-based terminal client and the server-side PTY process.

## Connection

| Property | Value |
|----------|-------|
| Endpoint | `ws://<host>:<port>/ws/terminal` |
| Protocol | WebSocket (RFC 6455) |
| Authentication | None (v1: trusted local environment) |

On connection, the server creates a new `TerminalSession` with a fresh PTY (bash shell). The session ID is assigned server-side and sent as the first message.

## Message Format

All messages are JSON with the following envelope:

```json
{
  "type": "<message_type>",
  "payload": { ... }
}
```

### Client → Server Messages

#### terminal:input
Send user keystrokes to the PTY process.

```json
{
  "type": "terminal:input",
  "payload": {
    "data": "ls -la\n"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| data | string | Yes | Raw bytes to write to PTY stdin. Typically a single keystroke or a full command line with newline. |

#### terminal:resize
Notify the server of terminal dimension changes.

```json
{
  "type": "terminal:resize",
  "payload": {
    "cols": 120,
    "rows": 40
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| cols | number | Yes | Number of columns (width in characters) |
| rows | number | Yes | Number of rows (height in characters) |

#### terminal:signal
Send a signal to the running foreground process.

```json
{
  "type": "terminal:signal",
  "payload": {
    "signal": "SIGINT"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| signal | string | Yes | Signal name: `SIGINT` (Ctrl+C), `SIGTERM` (terminate), `SIGKILL` (force kill) |

#### terminal:set-env
Set an environment variable for the session.

```json
{
  "type": "terminal:set-env",
  "payload": {
    "name": "NODE_ENV",
    "value": "development"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Environment variable name |
| value | string | Yes | Environment variable value |

### Server → Client Messages

#### terminal:init
Sent immediately after connection, before any output.

```json
{
  "type": "terminal:init",
  "payload": {
    "sessionId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "cwd": "/home/user",
    "nodeVersion": "v22.21.1",
    "cols": 80,
    "rows": 24
  }
}
```

#### terminal:output
PTY stdout data (relayed in real-time).

```json
{
  "type": "terminal:output",
  "payload": {
    "data": "file1.txt  file2.txt\n"
  }
}
```

#### terminal:error
PTY stderr data (relayed in real-time).

```json
{
  "type": "terminal:error",
  "payload": {
    "data": "ls: cannot access 'nonexistent': No such file or directory\n"
  }
}
```

**Note**: The client renders `terminal:output` and `terminal:error` in different colors/styles to satisfy FR-007 (stdout/stderr distinction).

#### terminal:exit
Sent when the current foreground process exits.

```json
{
  "type": "terminal:exit",
  "payload": {
    "exitCode": 0,
    "signal": null
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| exitCode | number \| null | Process exit code (0-255), null if killed by signal |
| signal | string \| null | Signal name if killed by signal, null if exited normally |

#### terminal:cwd
Sent when the current working directory changes (tracked server-side).

```json
{
  "type": "terminal:cwd",
  "payload": {
    "cwd": "/home/user/projects"
  }
}
```

#### terminal:error-msg
Server-side error (not from the PTY process).

```json
{
  "type": "terminal:error-msg",
  "payload": {
    "message": "Failed to spawn PTY process",
    "code": "PTY_SPAWN_ERROR"
  }
}
```

## Sequence: Typical Command Execution

```
Client                          Server
  |                                |
  |--- terminal:input {"ls\n"} --> |
  |                                | -- writes "ls\n" to PTY stdin
  |                                | -- PTY runs 'ls', writes output to stdout
  |<-- terminal:output {data} ---  |
  |<-- terminal:output {data} ---  |  (streaming, potentially multiple messages)
  |                                | -- PTY process exits with code 0
  |<-- terminal:exit {code: 0} --  |
  |                                | -- Shell prompt appears via PTY stdout
  |<-- terminal:output {data} ---  |
```

## Sequence: Signal Handling (Ctrl+C)

```
Client                          Server
  |                                |
  |--- terminal:signal {SIGINT} -> |
  |                                | -- sends SIGINT to PTY foreground process
  |                                | -- process terminates
  |<-- terminal:output {data} ---  |  (any remaining buffered output)
  |<-- terminal:exit {signal}  --  |
```

## Error Handling

- **Malformed JSON**: Server sends `terminal:error-msg` with code `INVALID_MESSAGE` and ignores the message
- **Unknown message type**: Server sends `terminal:error-msg` with code `UNKNOWN_TYPE` and ignores
- **PTY spawn failure**: Connection is accepted but immediately sends `terminal:error-msg` with code `PTY_SPAWN_ERROR` and closes

## Connection Lifecycle

1. Client opens WebSocket to `/ws/terminal`
2. Server creates TerminalSession, spawns PTY (bash), sends `terminal:init`
3. Client and server exchange messages as described above
4. When WebSocket closes (client disconnect or server close):
   - Server terminates the PTY process (SIGTERM, then SIGKILL after 2s)
   - Server cleans up TerminalSession resources
   - No reconnection support in v1 (ephemeral sessions per spec)
