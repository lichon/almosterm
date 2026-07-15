# WebSocket Protocol: almostnode Execution Bridge

**Feature**: 002-local-virtual-fs
**Version**: 1.0.0

## Overview

The browser-based terminal communicates with a local almostnode server via WebSocket to execute Node.js scripts. The server runs on `localhost` only — no remote host. The WebSocket carries script content, VFS context, and execution results.

## Connection

| Property | Value |
|----------|-------|
| Endpoint | `ws://localhost:<port>/node` |
| Protocol | WebSocket (RFC 6455) |
| Authentication | None (localhost-only, trusted) |

The server starts as a Vite plugin child process. The port is discovered via a well-known file or environment variable.

## Message Format

All messages are JSON:

```json
{
  "type": "<message_type>",
  "id": "<request_id>",
  "payload": { ... }
}
```

| Field | Type | Description |
|-------|------|-------------|
| type | string | Message type discriminator |
| id | string | Correlation ID matching request to response |
| payload | object | Type-specific data |

### Client → Server Messages

#### exec:script

Execute a Node.js script with VFS context.

```json
{
  "type": "exec:script",
  "id": "req-001",
  "payload": {
    "script": "console.log('hello from almostnode')",
    "cwd": "/home/user/project",
    "vfsFiles": {
      "/home/user/project/package.json": "{ \"name\": \"test\" }",
      "/home/user/project/index.js": "require('./package.json')"
    },
    "args": ["--verbose"],
    "env": { "NODE_ENV": "development" },
    "timeout": 30000
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| script | string | Yes | JavaScript source or path to script in VFS |
| cwd | string | Yes | Working directory (VFS path) |
| vfsFiles | Record\<string, string\> | No | Files from VFS to materialize before execution (path → content) |
| args | string[] | No | Command-line arguments |
| env | Record\<string, string\> | No | Environment variables |
| timeout | number | No | Execution timeout in ms (default: 30000) |

#### exec:cancel

Cancel a running execution.

```json
{
  "type": "exec:cancel",
  "id": "req-001",
  "payload": {}
}
```

#### exec:check

Check almostnode availability and version.

```json
{
  "type": "exec:check",
  "id": "req-000",
  "payload": {}
}
```

### Server → Client Messages

#### exec:result

Successful execution result.

```json
{
  "type": "exec:result",
  "id": "req-001",
  "payload": {
    "stdout": "hello from almostnode\n",
    "stderr": "",
    "exitCode": 0,
    "duration": 142
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| stdout | string | Standard output |
| stderr | string | Standard error |
| exitCode | number | Process exit code |
| duration | number | Execution time in ms |

#### exec:output

Streamed output chunk (for long-running scripts).

```json
{
  "type": "exec:output",
  "id": "req-001",
  "payload": {
    "stream": "stdout",
    "data": "processing file 1/10...\n"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| stream | 'stdout' \| 'stderr' | Which stream produced the data |
| data | string | Chunk of output |

#### exec:error

Execution error (server-side, not script error).

```json
{
  "type": "exec:error",
  "id": "req-001",
  "payload": {
    "code": "TIMEOUT",
    "message": "Execution timed out after 30000ms"
  }
}
```

**Error codes**: `TIMEOUT`, `SCRIPT_SYNTAX_ERROR`, `RUNTIME_UNAVAILABLE`, `KILLED`, `UNKNOWN`

#### exec:info

Server info (response to `exec:check`).

```json
{
  "type": "exec:info",
  "id": "req-000",
  "payload": {
    "version": "v22.21.1",
    "runtime": "almostnode",
    "available": true,
    "uptime": 3600
  }
}
```

## Sequence: Typical Script Execution

```
Browser                                    Local Server
  |                                             |
  |--- exec:script {script, vfsFiles} --------> |
  |                                             | -- materialize VFS files to temp dir
  |                                             | -- spawn: almostnode temp/script.js
  |<-- exec:output {stdout chunk} ------------  |
  |<-- exec:output {stdout chunk} ------------  |  (streaming)
  |                                             | -- process exits
  |<-- exec:result {stdout, stderr, exitCode} - |
  |                                             | -- cleanup temp dir
```

## Sequence: Cancellation

```
Browser                                    Local Server
  |                                             |
  |--- exec:script {script} ------------------> |
  |                                             | -- starts execution
  |--- exec:cancel {id: req-001} -------------> |
  |                                             | -- sends SIGTERM to process
  |<-- exec:result {exitCode: null, ...} ------ |
```

## Error Handling

- **Server unavailable**: Browser shows "almostnode runtime not available" in terminal; `node` commands fail gracefully.
- **Malformed message**: Server sends `exec:error` with code `INVALID_MESSAGE`.
- **Timeout**: Server kills process after timeout ms, sends `exec:error` with code `TIMEOUT`.
- **VFS file materialization failure**: Server sends `exec:error` with code `VFS_ERROR` and aborts execution.
