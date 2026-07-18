# almosterm

Browser-based terminal emulator with a virtual file system and Node.js runtime — powered by [almostnode](https://github.com/lichon/almostnode).

![version](https://img.shields.io/badge/version-0.1.0-blue)

## Features

- **Full terminal UI** — built on [xterm.js](https://xtermjs.org/) with cyberpunk theme, cursor blinking, and scrollback
- **Virtual File System** — persistent in-browser filesystem with read/write/mkdir/rm support
- **Node.js runtime** — execute JavaScript and npm packages in the browser via almostnode
- **npm support** — install packages from the npm registry directly into the VFS
- **Cloudflare Worker** — SPA serving, npm registry proxy (CORS-safe), HTTP proxy, SSH tunnel
- **Built-in commands** — `ls`, `cd`, `pwd`, `cat`, `mkdir`, `touch`, `echo`, `rm`, `cp`, `mv`, `node`, `clear`, `help`, `test`, `curl`, `ssh`
- **Custom tools** — register your own CLI tools pointing to scripts in the VFS
- **VFS import/export** — save and restore filesystem snapshots (`.vfs.tar`, `.vfs.zip`, `.vfs.json`)
- **Command history** — persistent history with up/down arrow navigation
- **Tab completion** — smart path and command completion
- **Redirects** — support for `>`, `>>`, and `2>` redirect operators

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server (Vite only — no Worker proxy)
npm run dev

# Start dev server with Cloudflare Worker (recommended)
npm run cf-dev

# Build for production
npm run build

# Deploy to Cloudflare
npm run cf-deploy

# Preview production build
npm start
```

## Built-in Commands

| Command | Description |
|---------|-------------|
| `ls [-a] [-l] [path]` | List directory contents |
| `cd [dir]` | Change directory (default: `/home/user`) |
| `pwd` | Print working directory |
| `cat <file...>` | Display file contents |
| `mkdir [-p] <dir>` | Create directory |
| `touch <file...>` | Create empty file |
| `echo <text>` | Print text (supports redirects) |
| `rm [-r] [-f] <path>` | Remove file or directory |
| `cp [-r] <src> <dst>` | Copy file or directory |
| `mv <src> <dst>` | Move/rename file or directory |
| `node [-e <code>] [script]` | Execute JavaScript via almostnode |
| `clear` | Clear terminal screen |
| `help [command]` | Show help |
| `test [npm\|node\|all]` | Run self-tests |

### Node.js Runtime

Run JavaScript directly in the terminal:

```bash
# Evaluate inline code
node -e "console.log('hello from almostnode')"

# Run a script from the VFS
node /home/user/script.js

# Check version
node --version
```

### npm & Package Management

```bash
# Test npm functionality
test npm

# Test with a specific package
test npm chalk

# Run full self-test (VFS + node + npm)
test all
```

### Custom Tools

Register scripts in the VFS as CLI commands:

```bash
tool-register mytool /usr/local/bin/mytool --description "My custom tool" --version 1.0.0
tool-list
tool-unregister mytool
```

### VFS Import/Export

```bash
# Export entire VFS
vfs-export

# Export a specific directory
vfs-export /home/user/projects

# Import a snapshot (drag & drop also supported)
vfs-import my-snapshot.vfs.tar
```

## Architecture

```
almosterm/
├── worker/
│   └── index.ts              # Cloudflare Worker (Hono): SPA serve + API proxy
├── src/
│   ├── main.tsx              # React entry point
│   ├── App.tsx               # Root component
│   ├── bash.tsx              # Shell component (wires terminal ↔ commands)
│   ├── components/
│   │   ├── Terminal.tsx      # xterm.js wrapper
│   │   ├── StatusBar.tsx     # Status bar UI
│   │   ├── ImportDialog.tsx  # VFS import dialog
│   │   └── ToolDialog.tsx    # Tool registration dialog
│   ├── tools/
│   │   ├── cmdv.ts           # Paste clipboard to file
│   │   ├── node.ts           # Run JS via almostnode container
│   │   ├── npm.ts            # Package manager (install, list, run)
│   │   ├── npx.ts            # Execute npm package binaries
│   │   ├── curl.ts           # HTTP client via Worker proxy
│   │   ├── ssh.ts            # SSH connect via Worker WebSocket proxy
│   │   ├── reload.ts         # Reload the page
│   │   └── npm-test.ts       # Self-test for npm functionality
│   ├── hooks/
│   │   ├── useCommandExecution.ts  # Command execution hook
│   │   ├── useJustBash.ts          # just-bash + VFS adapter singleton
│   │   └── useTabCompletion.ts     # Tab completion hook
│   ├── fs/
│   │   ├── configure.ts      # VFS setup & persistence
│   │   └── export-import.ts  # VFS snapshot import/export
│   ├── store/
│   │   ├── vfsStore.ts       # VFS state + Worker capabilities (Zustand)
│   │   ├── sessionStore.ts   # Session/history state
│   │   └── toolStore.ts      # Custom tools state
│   └── styles/
│       └── terminal.css      # Terminal & UI styles
```

### Worker API Endpoints

| Route | Description |
|---|---|
| `GET /api/status` | Capability detection (`npm-proxy`, `curl-proxy`, `ssh-proxy`) |
| `ALL /api/npm/*` | npm registry proxy with tarball URL rewriting |
| `ALL /api/curl?url=` | Same-origin HTTP proxy |
| `GET /api/connect?host=&port=` | WebSocket→TCP SSH pipe (dev only; 501 on free-tier) |
| `/*` | SPA static assets fallback |

## Tech Stack

- **[React 19](https://react.dev/)** — UI framework
- **[xterm.js](https://xtermjs.org/)** — Terminal emulator
- **[almostnode](https://github.com/lichon/almostnode)** — Browser-based Node.js runtime with VFS, CommonJS, and npm
- **[Zustand](https://zustand.docs.pmnd.rs/)** — State management
- **[Vite](https://vitejs.dev/)** — Build tool
- **[TypeScript](https://www.typescriptlang.org/)** — Type safety

## License

MIT
