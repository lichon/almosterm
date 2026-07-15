# Quickstart: Web Terminal Application

**Feature**: 001-web-terminal-app
**Date**: 2026-07-15

## Prerequisites

- almostnode installed and available on PATH (provides `node` and `npx`)
- Bash shell available on the host system
- A modern web browser (Chromium-based or Firefox)
- Git (for cloning the repository)

## Setup

```bash
# Clone the repository
git clone <repo-url> almosterm
cd almosterm

# Install dependencies
npm install

# Build the application
npm run build
```

## Run the Terminal Server

```bash
# Start the server (default: http://localhost:3000)
npm start

# Or with custom port
PORT=8080 npm start
```

Expected output:
```
Almosterm Web Terminal Server
├── Server:    http://localhost:3000
├── WebSocket: ws://localhost:3000/ws/terminal
├── Node.js:   v22.21.1 (almostnode)
└── Shell:     /bin/bash
```

## Open the Terminal

1. Open a web browser and navigate to `http://localhost:3000`
2. You should see a terminal prompt (e.g., `user@host:~$`)
3. Type commands and see output in real-time

## Validation Scenarios

### Scenario 1: Basic Bash Command (SC-001)

```bash
# In the web terminal, type:
echo "hello world"
```

**Expected**: Output `hello world` appears within 2 seconds.

---

### Scenario 2: Invalid Command

```bash
# In the web terminal, type:
nonexistent_command
```

**Expected**: Error message like `bash: nonexistent_command: command not found` appears.

---

### Scenario 3: Node.js via almostnode (SC-002)

```bash
# In the web terminal, type:
node -e "console.log('almostnode works')"
```

**Expected**: Output `almostnode works` appears within 2 seconds.

---

### Scenario 4: Node.js Inline Code

```bash
node -e "console.log(1 + 1)"
```

**Expected**: Output `2` appears.

---

### Scenario 5: Node.js Version

```bash
node --version
```

**Expected**: almostnode version string displayed (e.g., `v22.21.1`).

---

### Scenario 6: Custom CLI Tool Registration (SC-003)

First, create a test script:

```bash
# In the server host terminal (not the web terminal):
echo '#!/bin/bash
echo "Hello from custom tool! Args: $@"
exit 0' > /tmp/hello-tool.sh
chmod +x /tmp/hello-tool.sh
```

Then register it via the API:

```bash
curl -X POST http://localhost:3000/api/tools \
  -H "Content-Type: application/json" \
  -d '{
    "name": "hellotool",
    "executablePath": "/tmp/hello-tool.sh",
    "description": "A test tool that says hello"
  }'
```

**Expected**: HTTP 201 with the registered tool details.

Now use it in the web terminal:

```bash
hellotool --flag value
```

**Expected**: `Hello from custom tool! Args: --flag value` appears.

---

### Scenario 7: Custom Tool stderr Output

Create a tool that outputs to stderr:

```bash
echo '#!/bin/bash
echo "This goes to stdout"
echo "This goes to stderr" >&2
exit 0' > /tmp/stderr-tool.sh
chmod +x /tmp/stderr-tool.sh

curl -X POST http://localhost:3000/api/tools \
  -H "Content-Type: application/json" \
  -d '{"name": "errtool", "executablePath": "/tmp/stderr-tool.sh"}'
```

In the web terminal:
```bash
errtool
```

**Expected**: Both lines appear, with stderr output visually distinguished from stdout (different color, prefix, or style).

---

### Scenario 8: Command Cancellation (SC-006)

In the web terminal, start a long-running command:

```bash
sleep 60
```

Press `Ctrl+C` (or equivalent in the web terminal interface).

**Expected**: The `sleep` command terminates within 1 second and the prompt returns.

---

### Scenario 9: Large Output (SC-005)

```bash
# Generate 10,000 lines of output
for i in $(seq 1 10000); do echo "Line $i"; done
```

**Expected**: All 10,000 lines display without browser performance degradation (scrolling remains smooth, no lag).

---

### Scenario 10: Non-zero Exit Code (FR-012)

```bash
bash -c "exit 42"
```

**Expected**: The exit code `42` is indicated to the user (e.g., in the prompt or a status indicator).

---

### Scenario 11: List and Remove Tools

```bash
# List all registered tools
curl http://localhost:3000/api/tools

# Remove a tool
curl -X DELETE http://localhost:3000/api/tools/hellotool

# Verify removal
curl http://localhost:3000/api/tools/hellotool
# Expected: 404 Not Found
```

---

### Scenario 12: Cross-Browser Validation (SC-007)

Repeat Scenario 1 (`echo "hello world"`) in both:
- A Chromium-based browser (Chrome, Edge, Brave)
- Firefox

**Expected**: Terminal is usable and responsive in both browsers.

## Cleanup

```bash
# Stop the server (Ctrl+C in the server terminal)
# Remove test tools
rm /tmp/hello-tool.sh /tmp/stderr-tool.sh
# Delete registry (optional)
rm ~/.almosterm/tools.json
```
