# Cocos Creator MCP Server v2.8.0

Open Source MCP Server for Cocos Creator 3.8+

## Installation

1. Copy this entire folder into your Cocos Creator project's `extensions/` directory
2. Restart Cocos Creator or refresh extensions (Ctrl+R / Cmd+R)
3. Enable "Cocos MCP Server" in the extensions menu
4. Open the extension panel to configure server settings

---

## 🟦 VS Code MCP Setup (Recommended for Script Editing)

The best workflow: **Cocos Creator** (scene editing) + **VS Code** (script editing via AI).

### Quick Setup — Workspace Level

Copy `.vscode/mcp.json` into your Cocos Creator project root:

```bash
cp .vscode/mcp.json /path/to/your-cocos-project/.vscode/mcp.json
```

Then open the project in VS Code — AI assistants (Copilot Chat, Cline, Continue.dev, Cody, etc.) will auto-detect the MCP server.

### Manual Setup — User Level

Add to VS Code User Settings (`Ctrl+,` → Open JSON):

```json
{
  "mcpServers": {
    "cocos-creator": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp",
      "timeout": 30000
    }
  }
}
```

### Supported VS Code AI Assistants

| Assistant | MCP Support |
|-----------|------------|
| GitHub Copilot Chat | `.vscode/mcp.json` or User Settings |
| Cline | User Settings `mcpServers` |
| Continue.dev | `~/.continue/config.json` |
| Cody (Sourcegraph) | `~/.sourcegraph/cody.json` |
| Amazon Q Developer | `~/.aws/amazonq/config.json` |
| Supermaven | User Settings `mcpServers` |
| Augment Code | `~/.augment/config.json` |

> 💡 **Pro Tip:** Keep Cocos Creator + VS Code open side by side. AI edits scripts in VS Code while controlling Cocos scenes via MCP — all in real time!

---

## Client Configuration

### Claude Desktop
```json
{
  "mcpServers": {
    "cocos-creator": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

### Cursor
```json
{
  "mcpServers": {
    "cocos-creator": {
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

Use the "Quick Config" tab in the extension panel to auto-configure 15+ supported editors.

---

## Features

- **Streamable HTTP MCP Server** (MCP 2025-03-26 protocol)
- **13 intent-level tools** with 150+ editor operations
- **Scene & Node Management** — create, modify, query scene objects
- **Component Operations** — add/remove/modify components
- **Prefab Tools** — create and manage prefabs
- **Asset Management** — query and manage project assets
- **Scene View Control** — camera, gizmos, view modes
- **Quick Client Config** — auto-configure 15+ AI editors
- **AI Prompt Library** — 20+ curated prompt templates (`prompts/index.js`)
- **Workflow Automation** — pre-built batch operations (`scripts/workflow-automation.js`)
- **Extended Editor Support** — 17 additional AI clients (`dist/mcp-client-configs-extended.js`)

---

## Quick Start

1. Start Cocos Creator and open the MCP Server panel
2. Click **Start Server** (default port 3000)
3. Open VS Code in your Cocos project
4. Ask your AI assistant: *"List all nodes in the current Cocos scene"*

---

## License

Open Source

---

Build: v2.8.0 — Open Source Edition
Author: LoonG123
