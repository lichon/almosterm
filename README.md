# almosterm

Browser-based terminal emulator with a virtual file system, Node.js runtime, and SSH client — inspired by almostnode.

![version](https://img.shields.io/badge/version-0.2.0-blue)

## Features

- **Full terminal UI** — built on [xterm.js](https://xtermjs.org/) with cyberpunk theme, cursor blinking, and scrollback
- **Virtual File System** — persistent in-browser filesystem with read/write/mkdir/rm support, auto-saved to localStorage
- **Node.js runtime** — execute JavaScript and npm packages in the browser via almostnode
- **npm support** — `npm install`, `npm run`, `npm init`, `npm ls` from the npm registry directly into the VFS
- **npx** — execute npm package binaries on-the-fly with local → cache → download resolution
- **SSH client** — in-browser SSH via `ssh2` with full **end-to-end encryption** (ECDH key exchange, AES-128/256 cipher, RSA/ECDSA host verification) — all crypto runs in pure JavaScript in the browser; the Worker is a transparent TCP proxy and never sees plaintext
- **Built-in file editor** — `edit` command opens a modal editor (Ctrl+S to save, line/byte counters)
- **Cloudflare Worker** — SPA serving, CORS-safe HTTP proxy, WebSocket→TCP SSH tunnel
- **Built-in commands** — `ls`, `cd`, `pwd`, `cat`, `mkdir`, `touch`, `echo`, `rm`, `cp`, `mv`, `node`, `clear`, `help`, `curl`, `ssh`, `edit`, `npx`, `cmdv`, `reload`
- **Custom tools** — register your own CLI tools pointing to scripts in the VFS
- **VFS import/export** — save and restore filesystem snapshots (`.vfs.tar`, `.vfs.zip`, `.vfs.json`)
- **Drag & drop** — drop files onto the terminal to import them into the VFS
- **Clipboard paste** — `cmdv` writes clipboard content to a file
- **Command history** — persistent history with up/down arrow navigation
- **Tab completion** — smart path and command completion
- **Redirects** — support for `>`, `>>`, and `2>` redirect operators
- **In-browser cryptography** — SHA-256, MD5, ECDH (P-256/384/521), RSA PKCS#1 v1.5, ECDSA, AES-128/256-CTR/CBC/GCM all implemented in pure JS via crypto-js

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

### File System

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
| `clear` | Clear terminal screen |
| `help [command]` | Show help |

### JavaScript Runtime

| Command | Description |
|---------|-------------|
| `node [-e <code>] [script]` | Execute JavaScript via almostnode |
| `node --version` | Print almostnode version |

### Package Management

| Command | Description |
|---------|-------------|
| `npm install [pkg]` | Install a package or all deps from package.json |
| `npm install <https://...tgz>` | Install from a tarball URL |
| `npm ls` | List installed packages |
| `npm run <script>` | Run an npm script via node |
| `npm init` | Create a new package.json |
| `npx <package> [args...]` | Execute an npm package binary (local→cache→download) |

### Networking

| Command | Description |
|---------|-------------|
| `curl <url>` | Fetch a URL via Worker HTTP proxy (CORS-safe) |
| `ssh <user@host> [-p <port>] [-pw <password>] [-i <keyfile>] [-v]` | Connect to a remote host via SSH (in-browser ssh2) |

### Tools

| Command | Description |
|---------|-------------|
| `edit [filepath]` | Open the built-in file editor (Ctrl+S to save) |
| `cmdv [filepath]` | Paste clipboard content to a file |
| `reload` | Reload the page |

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
# Install a package
npm install chalk

# Install from package.json
npm install

# Install from a tarball URL
npm install https://registry.npmjs.org/chalk/-/chalk-5.3.0.tgz

# List installed packages
npm ls

# Run an npm script
npm run build

# Execute a package binary on-the-fly
npx cowsay hello world

# npx with version pinning
npx cowsay@1.5.0 moo
```

### SSH Client

The SSH client runs entirely in the browser. The Cloudflare Worker acts as a transparent WebSocket→TCP proxy.

```bash
# Password authentication
ssh user@example.com -pw mypassword

# Custom port
ssh admin@myserver.com -p 2222

# Verbose mode
ssh user@host -v

# Identity file from VFS
ssh user@host -i /home/user/.ssh/id_rsa
```

**Supported crypto in-browser:**
- **KEX:** ecdh-sha2-nistp256
- **Host key:** rsa-sha2-256
- **Ciphers:** AES-128/256-CTR, AES-128/256-CBC, AES-128/256-GCM
- **Hashes:** SHA-256, MD5 (via crypto-js)
- **Key verification:** RSA PKCS#1 v1.5, ECDSA (P-256/384/521)

### Built-in File Editor

```bash
# Open a file for editing
edit /home/user/config.json

# Create a new file
edit /home/user/newfile.txt

# Open blank editor
edit
```

Keyboard shortcuts inside the editor:
- **Ctrl+S** — Save and close
- **Esc** or click outside — Cancel

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

Drag and drop any file onto the terminal to import it into the current working directory.

## Architecture

```
almosterm/
├── worker/
│   └── index.ts              # Cloudflare Worker (Hono): SPA serve + API proxy
├── src/
│   ├── main.tsx              # React entry point
│   ├── App.tsx               # Root component
│   ├── bash.tsx              # Shell component (wires terminal ↔ commands)
│   ├── utils.ts              # Terminal helpers (writeTerm, normalizeEol)
│   ├── components/
│   │   ├── Terminal.tsx      # xterm.js wrapper (handles input, SSH stream forwarding)
│   │   ├── StatusBar.tsx     # Status bar UI
│   │   ├── ImportDialog.tsx  # VFS import dialog
│   │   ├── ToolDialog.tsx    # Tool registration dialog
│   │   └── EditDialog.tsx    # Built-in file editor modal
│   ├── tools/
│   │   ├── cmdv.ts           # Paste clipboard to file
│   │   ├── curl.ts           # HTTP client via Worker proxy
│   │   ├── edit.ts           # Open built-in file editor
│   │   ├── node.ts           # Run JS via almostnode container
│   │   ├── npm.ts            # Package manager (install, ls, run, init, tarball URLs)
│   │   ├── npm-test.ts       # Self-test for npm functionality
│   │   ├── npx.ts            # Execute npm package binaries (local→cache→download)
│   │   ├── reload.ts         # Reload the page
│   │   └── ssh.ts            # SSH client (ssh2 in-browser, WebSocket→TCP tunnel)
│   ├── hooks/
│   │   ├── useCommandExecution.ts  # Command execution hook
│   │   ├── useJustBash.ts          # just-bash + VFS adapter singleton
│   │   ├── useNodePolyfill.ts      # Crypto polyfills for ssh2 (ECDH, RSA, AES, SHA-256)
│   │   └── useTabCompletion.ts     # Tab completion hook
│   ├── fs/
│   │   ├── configure.ts      # VFS setup, persistence, almostnode container
│   │   └── export-import.ts  # VFS snapshot import/export
│   ├── store/
│   │   ├── vfsStore.ts       # VFS state + Worker capabilities (Zustand)
│   │   ├── sessionStore.ts   # Session/history state
│   │   ├── toolStore.ts      # Custom tools state
│   │   └── editorStore.ts    # File editor state
│   └── styles/
│       └── terminal.css      # Terminal & UI styles
├── test/                     # Crypto test scripts (ECDH, GCM, hashing, verify)
├── index.html                # Single-page entry point
├── vite.config.ts            # Vite + @cloudflare/vite-plugin
├── wrangler.jsonc            # Cloudflare Workers config
└── package.json
```

### Worker API Endpoints

| Route | Description |
|---|---|
| `GET /api/status` | Capability detection (`curl-proxy`, `ssh-proxy`) |
| `ALL /api/curl?url=` | Same-origin HTTP proxy (bypasses browser CORS) |
| `GET /api/connect?host=&port=` | WebSocket→TCP tunnel for SSH |
| `/*` | SPA static assets fallback |

## Tech Stack

- **React 19** — UI framework
- **xterm.js** — Terminal emulator
- **almostnode** — Browser-based Node.js runtime with VFS, CommonJS, and npm
- **just-bash** — Bash-like shell parser and command registry
- **Hono** — Lightweight Workers web framework
- **Zustand** — State management
- **crypto-js** — Pure-JS crypto (SHA, AES, ECDH for SSH)
- **ssh2** — SSH client (runs in almostnode container)
- **Vite** — Build tool with @cloudflare/vite-plugin
- **TypeScript** — Type safety

## How SSH Works In-Browser (End-to-End Encrypted)

The SSH client runs entirely in the browser using the `ssh2` npm package loaded into the almostnode container. **Encryption is end-to-end** — the Cloudflare Worker acts only as a transparent TCP proxy and never has access to plaintext credentials, commands, or data.

1. **WebSocket TCP tunnel** — The Worker opens a raw TCP connection to the target host and bridges it to a browser WebSocket (`/api/connect?host=&port=`). The Worker sees only encrypted SSH protocol bytes.
2. **ssh2 in almostnode** — The `ssh2` package is installed on-demand into the almostnode container and runs client-side. Key exchange, authentication, and session encryption all happen in the browser.
3. **Pure-JS crypto** — `crypto-js` provides AES, SHA-256, and MD5; ECDH (P-256/384/521), RSA PKCS#1 v1.5 signature verification, and ECDSA verification are implemented in pure JavaScript (see `src/hooks/useNodePolyfill.ts`)
4. **Stream forwarding** — Keystrokes route directly from xterm.js → SSH stream; SSH output renders in the terminal
5. **No plaintext on the wire** — The Worker never decrypts or inspects SSH traffic. Encryption keys are negotiated directly between the browser and the remote host.

## License

MIT
