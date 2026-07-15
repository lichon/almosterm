# Implementation Plan: Web Terminal Application

**Branch**: `001-web-terminal-app` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-web-terminal-app/spec.md`

## Summary

Build a web-based terminal application that provides a real-time terminal experience in the browser. The system executes bash commands via a pseudo-terminal (PTY), runs Node.js code backed by the almostnode runtime, and supports user-registered custom CLI tools. The backend is a Node.js (almostnode) server with WebSocket-based terminal streaming; the frontend uses xterm.js for terminal emulation.

## Technical Context

**Language/Version**: TypeScript 5.x on almostnode (Node.js 22.x compatible)

**Primary Dependencies**:
- Backend: `ws` (WebSocket server), `node-pty` (pseudo-terminal), Express (HTTP API)
- Frontend: `xterm.js` (terminal emulator), `@xterm/addon-fit` (auto-resize), `@xterm/addon-web-links` (URL detection)
- Build: Vite (frontend bundling), tsc (TypeScript compilation)
- almostnode as the Node.js runtime for the server and for `node -e`/script execution

**Storage**: JSON file at `~/.almosterm/tools.json` for custom CLI tool registry. Ephemeral, in-memory data for all other state (sessions, commands, history).

**Testing**: Vitest for unit and integration tests. Integration tests spawn real PTY processes and verify output via WebSocket assertions.

**Target Platform**: Linux server (hosting almostnode and bash), browser clients (Chromium-based and Firefox).

**Project Type**: Web application (frontend + backend monorepo).

**Performance Goals**:
- Command output visible within 2 seconds of Enter (SC-001, SC-002)
- Ctrl+C terminates command within 1 second (SC-006)
- Handle 10,000+ lines of output without browser degradation (SC-005)

**Constraints**:
- Single-user / local trusted environment (no multi-tenant auth)
- Ephemeral sessions (no persistence across browser restarts)
- Unix-like host required (Linux/macOS for PTY and bash)
- almostnode must be available as the node runtime

**Scale/Scope**:
- 1-5 concurrent terminal sessions (browser tabs)
- 100+ registered custom CLI tools
- Commands running up to 5 minutes before automatic timeout

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: ✅ PASS (No gates defined)

The project constitution template has not been filled in — no specific principles, constraints, or governance rules are enforced. This section will be re-evaluated once the constitution is populated.

**Post-Design Re-check**: ✅ PASS (No changes to report)

## Project Structure

### Documentation (this feature)

```text
specs/001-web-terminal-app/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: technical research & decisions
├── data-model.md        # Phase 1: entity definitions & relationships
├── quickstart.md        # Phase 1: validation & run guide
├── contracts/           # Phase 1: interface contracts
│   ├── websocket-protocol.md    # WebSocket message protocol
│   └── tool-registry-api.md     # HTTP API for custom CLI tools
└── tasks.md             # Phase 2: /speckit.tasks output (not yet created)
```

### Source Code (repository root)

```text
server/
├── src/
│   ├── index.ts              # Server entry point (Express + WebSocket)
│   ├── terminal/
│   │   ├── session.ts        # TerminalSession class (PTY management)
│   │   ├── session-store.ts  # Active session registry (Map<id, session>)
│   │   └── websocket.ts      # WebSocket handler (upgrade, message routing)
│   ├── tools/
│   │   ├── registry.ts       # CustomCliTool registry (CRUD on tools.json)
│   │   └── routes.ts         # Express routes for /api/tools/*
│   ├── runtime/
│   │   └── almostnode.ts     # almostnode availability check & version
│   └── config.ts             # Server configuration (port, timeouts, paths)
└── tests/
    ├── unit/
    │   └── registry.test.ts  # Tool registry unit tests
    └── integration/
        ├── terminal.test.ts  # PTY spawning, command execution
        └── websocket.test.ts # WebSocket message roundtrip

client/
├── src/
│   ├── index.ts              # Client entry point
│   ├── app.ts                # App bootstrap (terminal init, WebSocket connect)
│   ├── terminal.ts           # xterm.js Terminal wrapper (create, configure, attach)
│   ├── websocket.ts          # WebSocket client (connect, send, receive, reconnect)
│   └── style.css             # Terminal styling (stdout/stderr colors, layout)
├── index.html                # Entry HTML (minimal chrome)
└── tests/
    └── [client tests]

shared/
└── src/
    └── protocol.ts           # WebSocket message type definitions (shared between client/server)

# Tooling
├── package.json              # Root package (workspaces)
├── tsconfig.json             # TypeScript config
├── vite.config.ts            # Vite config for client bundling
└── vitest.config.ts          # Vitest config
```

**Structure Decision**: Web application structure (Option 2) with separate `server/` and `client/` directories, plus a `shared/` package for protocol types. This separation enables independent development and testing of the backend (PTY, process management, tool registry) and frontend (terminal UI, WebSocket client).

## Complexity Tracking

> No constitution violations to justify. The architecture is intentionally minimal (single process, no database, no authentication, no microservices). Complexity will be revisited if multi-user support or persistence is added in future versions.
