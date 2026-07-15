# Custom CLI Tool Registry API Contract

**Feature**: 001-web-terminal-app
**Version**: 1.0.0

## Overview

REST API for registering, listing, and removing custom CLI tools. Tools are stored in `~/.almosterm/tools.json`.

## Base URL

`http://<host>:<port>/api/tools`

## Authentication

None (v1: trusted local environment).

## Endpoints

### List Registered Tools

```
GET /api/tools
```

**Response** `200 OK`:
```json
{
  "tools": {
    "mybuild": {
      "executablePath": "/home/user/scripts/build.sh",
      "description": "Build the project",
      "version": "1.0.0",
      "environment": { "NODE_ENV": "production" },
      "registeredAt": "2026-07-15T12:00:00Z"
    },
    "deploy-staging": {
      "executablePath": "/home/user/scripts/deploy.sh",
      "description": "Deploy to staging",
      "version": null,
      "environment": null,
      "registeredAt": "2026-07-15T13:00:00Z"
    }
  }
}
```

---

### Get a Single Tool

```
GET /api/tools/:name
```

**Response** `200 OK`:
```json
{
  "executablePath": "/home/user/scripts/build.sh",
  "description": "Build the project",
  "version": "1.0.0",
  "environment": { "NODE_ENV": "production" },
  "registeredAt": "2026-07-15T12:00:00Z"
}
```

**Response** `404 Not Found`:
```json
{
  "error": "Tool 'unknown-tool' not found"
}
```

---

### Register a New Tool

```
POST /api/tools
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "mybuild",
  "executablePath": "/home/user/scripts/build.sh",
  "description": "Build the project",
  "version": "1.0.0",
  "environment": { "NODE_ENV": "production" }
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| name | string | Yes | `/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/`; must not conflict with built-in or existing |
| executablePath | string | Yes | Absolute path; must exist and be executable |
| description | string | No | Max 256 characters |
| version | string | No | Free-form version string |
| environment | object | No | Key-value string pairs |

**Response** `201 Created`:
```json
{
  "name": "mybuild",
  "executablePath": "/home/user/scripts/build.sh",
  "description": "Build the project",
  "version": "1.0.0",
  "environment": { "NODE_ENV": "production" },
  "registeredAt": "2026-07-15T14:00:00Z"
}
```

**Response** `409 Conflict`:
```json
{
  "error": "Tool 'mybuild' is already registered"
}
```

**Response** `400 Bad Request`:
```json
{
  "error": "Executable path does not exist or is not executable: /invalid/path"
}
```

**Response** `400 Bad Request` (name conflict with built-in):
```json
{
  "error": "Tool name 'node' conflicts with a built-in command"
}
```

---

### Update a Tool

```
PUT /api/tools/:name
Content-Type: application/json
```

**Request Body** (all fields optional — only provided fields are updated):
```json
{
  "executablePath": "/home/user/scripts/build-v2.sh",
  "description": "Build v2"
}
```

**Response** `200 OK`: Same format as single tool GET response, with updated fields.

**Response** `404 Not Found`: Tool not found.

---

### Remove a Tool

```
DELETE /api/tools/:name
```

**Response** `204 No Content`

**Response** `404 Not Found`: Tool not found.

---

## Built-in Command Names (Reserved)

The following names cannot be used for custom tools:

- `node`, `npx`, `npm`, `bash`, `sh`, `zsh`, `fish`
- All POSIX standard utilities (per spec: standard terminal commands like `ls`, `cd`, `grep`, etc. are resolved via system PATH, not the registry)

The server validates against a reserved-name list during registration.

## CLI Equivalent

The `almosterm` CLI also provides tool management:

```bash
# List tools
almosterm tool list

# Register a tool
almosterm tool register <name> <executable-path> [--description "..."] [--version "..."]

# Remove a tool
almosterm tool remove <name>
```

The CLI and the HTTP API operate on the same `~/.almosterm/tools.json` file.
