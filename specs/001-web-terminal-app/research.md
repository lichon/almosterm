# Research: Web Terminal Application

**Feature**: 001-web-terminal-app
**Date**: 2026-07-15

## 1. Terminal Emulation in the Browser

**Decision**: Use xterm.js with the `node-pty` backend for pseudo-terminal allocation.

**Rationale**:
- xterm.js is the industry-standard, mature, well-maintained terminal emulator for the browser
- Supports full VT100/VT220/VT320/VT420/VT520 escape sequences
- Built-in support for WebSocket-based addons (attach addon)
- Handles color, cursor positioning, and interactive terminal features natively
- `node-pty` provides a real PTY on the server, enabling proper signal handling (Ctrl+C, Ctrl+Z) and full terminal behavior (including programs that check `isatty`)

**Alternatives considered**:
- `hterm` (Google's terminal): Less active community, Chrome-specific focus
- Custom terminal renderer: Would require reimplementing decades of escape sequence handling
- Server-side rendering only: Would defeat real-time interactivity requirement

## 2. Real-Time Communication Protocol

**Decision**: WebSocket (via `ws` library on server, native `WebSocket` API or xterm.js addon on client).

**Rationale**:
- Bidirectional, low-latency communication essential for terminal I/O
- xterm.js provides a built-in `AttachAddon` that directly connects to WebSocket endpoints
- WebSocket overhead is minimal (< 2 bytes per frame for small payloads after handshake)
- Well-supported across all major browsers (SC-007: Chromium + Firefox)

**Alternatives considered**:
- Server-Sent Events (SSE): Unidirectional only; cannot handle user input efficiently
- HTTP polling: Unacceptable latency for real-time terminal interaction
- Socket.io: Adds unnecessary abstraction layer; native WebSocket sufficient

## 3. Process Management & Session Isolation

**Decision**: One `node-pty` pseudo-terminal per WebSocket connection. Each browser tab gets its own PTY process with isolated working directory and environment.

**Rationale**:
- `node-pty` spawns a real shell process (bash) with a proper TTY
- PTY allows proper signal forwarding (SIGINT, SIGTERM, SIGKILL) for command cancellation (SC-006: Ctrl+C within 1 second)
- Each session gets its own PTY, preventing cross-session data leakage
- Process termination on WebSocket close ensures clean resource cleanup

**Alternatives considered**:
- `child_process.spawn` without PTY: Loses TTY features; programs like `git`, `vim`, or anything checking `isatty` would break
- Single shared shell: State contamination between sessions; concurrency issues
- Container-based isolation (Docker per session): Overkill for single-user v1; significant overhead

## 4. almostnode Integration

**Decision**: Use almostnode as the Node.js runtime that powers the server process. The server spawns `node` (backed by almostnode) for executing Node.js scripts and `node -e` commands.

**Rationale**:
- almostnode provides standard Node.js CLI compatibility (`node`, `npx`)
- The server itself runs on almostnode, proving the runtime works
- For inline `node -e` commands, the server can either spawn a child `node` process or use `vm` module — spawning is preferred for isolation and exit code fidelity
- Version detection: `node --version` or `process.version` on server start

**Alternatives considered**:
- `vm.Script` / `eval` for inline JavaScript: Faster but loses output isolation, exit codes, and real stderr separation; security concerns with shared context
- Separate Node.js installation: Defeats the purpose of "backed by almostnode"

## 5. Custom CLI Tool Registration

**Decision**: File-based registry at `~/.almosterm/tools.json` mapping tool names to executable paths. A REST endpoint `/api/tools` serves CRUD operations for registration. A CLI command `almosterm register <name> <path>` provides command-line registration.

**Rationale**:
- Simple, transparent storage that users can inspect and modify directly
- JSON format is human-readable and easy to edit
- Tool name collision prevention: register operation rejects duplicate names
- Executable validation at registration time: checks that path exists and is executable
- PATH-like resolution for tool names: if exact match not found in registry, fall back to system PATH

**Alternatives considered**:
- Database (SQLite): Adds dependency; overkill for a simple key-value mapping
- Environment variable based: Awkward to manage for multiple tools
- Directory of symlinks: Less portable; harder to validate and audit

## 6. Security Considerations

**Decision**: Commands run with the same user permissions as the server process. Input sanitization limited to preventing WebSocket injection (not shell injection, since the purpose is to run arbitrary commands).

**Rationale**:
- v1 is single-user / trusted environment (per spec assumptions)
- PTY allocation provides natural shell parsing boundaries
- No multi-user authentication or privilege separation in v1
- Long-running command timeout (configurable, default 5 minutes) prevents resource exhaustion

**Alternatives considered**:
- Sandbox/container per session: Adds significant operational complexity; planned for future multi-user version
- Command allowlisting: Defeats the core purpose of a general-purpose terminal
- User impersonation: Requires root privileges; security risk in v1

## 7. Frontend Architecture

**Decision**: Single-page application with xterm.js as the terminal component, minimal UI chrome (status bar), and direct WebSocket connection to the backend.

**Rationale**:
- Terminal is the primary interface; minimal additional UI needed
- xterm.js handles all rendering, input capture, and escape sequence processing
- No frontend framework needed (vanilla JS/TS + xterm.js is sufficient)
- Build tool: Vite for fast development and optimized production bundles
- TypeScript for type safety across the stack

**Alternatives considered**:
- React/Vue wrapper for xterm.js: Adds bundle size with no functional benefit for a terminal-focused app
- Server-rendered with HTMX: Cannot provide the rich real-time terminal experience

## 8. Testing Strategy

**Decision**: Vitest for unit/integration tests. Integration tests spawn real PTY processes and verify output. Contract tests validate WebSocket message format.

**Rationale**:
- Vitest is fast, TypeScript-native, and compatible with almostnode
- Integration tests with real PTY validate end-to-end behavior (critical for terminal correctness)
- Command execution tests verify: stdout, stderr, exit codes, signal handling
- Custom tool registration test validates the full registry workflow

**Alternatives considered**:
- Jest: Heavier; slower startup; less TypeScript-native
- Mocha + Chai: More configuration burden; less integrated
