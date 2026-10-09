/**
 * Extended MCP Client Configurations v2.8.0
 * Adds support for 15+ additional AI editors/IDEs beyond the built-in set.
 * Built-in clients: Claude Desktop, Cursor, VS Code, VS Code Insiders, Windsurf,
 *   Devin, Qoder, Trae, Trae CN, Kiro, Codeium, Claude CLI, Gemini CLI
 *
 * Extended clients added by this module:
 *   GitHub Copilot, Continue.dev, JetBrains AI Assistant, Zed Editor,
 *   Sourcegraph Cody, Tabby, Amazon Q Developer, PearAI, Augment Code,
 *   Supermaven, Replit, Bolt.new, Lovable, v0 by Vercel, Cline
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
const XDG_CONFIG = process.env.XDG_CONFIG_HOME || path.join(HOME, '.config');

/**
 * Extended client definitions.
 * Each entry: { clientType, clientName, configPaths: [...], mcpKey, configFormat }
 * configFormat: 'json' | 'yaml' | 'toml' | 'jsonc'
 */
const EXTENDED_CLIENTS = [
    // === VS Code-based editors (use settings.json) ===
    {
        clientType: 'github-copilot',
        clientName: 'GitHub Copilot (VS Code)',
        configPaths: [
            path.join(APPDATA, 'Code', 'User', 'settings.json'),
            path.join(HOME, 'Library', 'Application Support', 'Code', 'User', 'settings.json'),
            path.join(XDG_CONFIG, 'Code', 'User', 'settings.json'),
        ],
        mcpKey: 'mcpServers',
        configFormat: 'jsonc',
        description: 'GitHub Copilot Chat in VS Code - MCP support via settings.json'
    },
    {
        clientType: 'continue-dev',
        clientName: 'Continue.dev',
        configPaths: [
            path.join(HOME, '.continue', 'config.json'),
            path.join(HOME, '.continue', 'config.yaml'),
        ],
        mcpKey: 'mcpServers',
        configFormat: 'json',
        description: 'Continue.dev - Open-source AI code assistant'
    },
    {
        clientType: 'cline',
        clientName: 'Cline (VS Code)',
        configPaths: [
            path.join(APPDATA, 'Code', 'User', 'settings.json'),
            path.join(HOME, 'Library', 'Application Support', 'Code', 'User', 'settings.json'),
        ],
        mcpKey: 'mcpServers',
        configFormat: 'jsonc',
        description: 'Cline - Autonomous coding agent for VS Code'
    },
    {
        clientType: 'pearai',
        clientName: 'PearAI',
        configPaths: [
            path.join(HOME, '.pearai', 'config.json'),
            path.join(APPDATA, 'PearAI', 'config.json'),
        ],
        mcpKey: 'mcpServers',
        configFormat: 'json',
        description: 'PearAI - Open-source AI-powered code editor'
    },
    {
        clientType: 'augment-code',
        clientName: 'Augment Code',
        configPaths: [
            path.join(HOME, '.augment', 'config.json'),
            path.join(APPDATA, 'augment-code', 'config.json'),
        ],
        mcpKey: 'mcpServers',
        configFormat: 'json',
        description: 'Augment Code - AI coding assistant'
    },

    // === JetBrains IDEs ===
    {
        clientType: 'jetbrains-ai',
        clientName: 'JetBrains AI Assistant',
        configPaths: [
            path.join(APPDATA, 'JetBrains', 'IntelliJIdea*', 'options', 'ai-assistant.xml'),
            path.join(HOME, 'Library', 'Application Support', 'JetBrains', 'IntelliJIdea*', 'options'),
            path.join(XDG_CONFIG, 'JetBrains', 'IntelliJIdea*', 'options'),
        ],
        mcpKey: 'mcpServers',
        configFormat: 'xml',
        description: 'JetBrains AI Assistant - supports all JetBrains IDEs'
    },

    // === Standalone Editors ===
    {
        clientType: 'zed',
        clientName: 'Zed Editor',
        configPaths: [
            path.join(XDG_CONFIG, 'zed', 'settings.json'),
            path.join(HOME, 'Library', 'Application Support', 'Zed', 'settings.json'),
            path.join(APPDATA, 'Zed', 'settings.json'),
        ],
        mcpKey: 'mcp_servers',
        configFormat: 'json',
        description: 'Zed - High-performance collaborative code editor'
    },
    {
        clientType: 'cody',
        clientName: 'Sourcegraph Cody',
        configPaths: [
            path.join(HOME, '.sourcegraph', 'cody.json'),
            path.join(APPDATA, 'Code', 'User', 'settings.json'), // VS Code extension
        ],
        mcpKey: 'mcpServers',
        configFormat: 'json',
        description: 'Sourcegraph Cody - AI coding assistant with codebase context'
    },
    {
        clientType: 'tabby',
        clientName: 'Tabby',
        configPaths: [
            path.join(HOME, '.tabby-client', 'agent', 'config.toml'),
            path.join(APPDATA, 'tabby', 'agent', 'config.toml'),
        ],
        mcpKey: 'mcp_servers',
        configFormat: 'toml',
        description: 'Tabby - Self-hosted AI coding assistant'
    },
    {
        clientType: 'amazon-q',
        clientName: 'Amazon Q Developer',
        configPaths: [
            path.join(HOME, '.aws', 'amazonq', 'config.json'),
            path.join(APPDATA, 'Code', 'User', 'settings.json'), // VS Code extension
        ],
        mcpKey: 'mcpServers',
        configFormat: 'json',
        description: 'Amazon Q Developer - AWS-powered AI coding assistant'
    },
    {
        clientType: 'supermaven',
        clientName: 'Supermaven',
        configPaths: [
            path.join(APPDATA, 'Code', 'User', 'settings.json'),
            path.join(HOME, '.supermaven', 'config.json'),
        ],
        mcpKey: 'mcpServers',
        configFormat: 'jsonc',
        description: 'Supermaven - Fast AI code completion and chat'
    },

    // === Web-based Editors ===
    {
        clientType: 'replit',
        clientName: 'Replit',
        configPaths: [
            path.join(HOME, '.replit', 'mcp.json'),
        ],
        mcpKey: 'mcpServers',
        configFormat: 'json',
        description: 'Replit - Collaborative browser-based IDE'
    },
    {
        clientType: 'bolt-new',
        clientName: 'Bolt.new',
        configPaths: [],
        mcpKey: 'mcpServers',
        configFormat: 'json',
        description: 'Bolt.new - AI-powered full-stack app builder (configure via project settings)',
        manualOnly: true,
        manualInstructions: 'Add MCP config in your Bolt.new project settings under "Integrations → MCP Servers".'
    },
    {
        clientType: 'lovable',
        clientName: 'Lovable',
        configPaths: [],
        mcpKey: 'mcpServers',
        configFormat: 'json',
        description: 'Lovable - AI-powered app builder (configure via project settings)',
        manualOnly: true,
        manualInstructions: 'Add MCP config in your Lovable project settings under "MCP Servers".'
    },
    {
        clientType: 'vercel-v0',
        clientName: 'v0 by Vercel',
        configPaths: [],
        mcpKey: 'mcpServers',
        configFormat: 'json',
        description: 'v0 - Vercel AI design-to-code tool (configure via project settings)',
        manualOnly: true,
        manualInstructions: 'Add MCP config in your v0 project settings.'
    },

    // === Claude Code & Codex CLI (Primary AI Coding Agents) ===
    {
        clientType: 'claude-code',
        clientName: 'Claude Code (Anthropic)',
        configPaths: [
            path.join(HOME, '.claude', 'claude_desktop_config.json'),
            path.join(HOME, '.claude.json'),
            path.join(APPDATA, 'Claude', 'claude_desktop_config.json'),
        ],
        mcpKey: 'mcpServers',
        configFormat: 'json',
        description: 'Claude Code — Anthropic agentic coding tool. MCP via ~/.claude/claude_desktop_config.json or --mcp-config flag.',
        cliCommand: 'claude mcp add cocos-creator http://127.0.0.1:3000/mcp --transport http',
        envConfig: 'MCP_SERVER_CONFIG={"cocos-creator":{"type":"http","url":"http://127.0.0.1:3000/mcp"}}'
    },
    {
        clientType: 'codex-cli',
        clientName: 'Codex CLI (OpenAI)',
        configPaths: [
            path.join(HOME, '.codex', 'config.toml'),
            path.join(XDG_CONFIG, 'codex', 'config.toml'),
        ],
        mcpKey: 'mcp_servers',
        configFormat: 'toml',
        description: 'Codex CLI — OpenAI coding agent. MCP via ~/.codex/config.toml or `codex mcp add`.',
        cliCommand: 'codex mcp add cocos-creator --url http://127.0.0.1:3000/mcp --transport http',
        envConfig: ''
    },

    // === Terminal-based ===
    {
        clientType: 'aider',
        clientName: 'Aider',
        configPaths: [
            path.join(HOME, '.aider.conf.yml'),
            path.join(HOME, '.aider', 'config.yml'),
        ],
        mcpKey: 'mcp_servers',
        configFormat: 'yaml',
        description: 'Aider - AI pair programming in your terminal'
    },
    {
        clientType: 'goose',
        clientName: 'Goose AI',
        configPaths: [
            path.join(HOME, '.goose', 'config.json'),
        ],
        mcpKey: 'mcp_servers',
        configFormat: 'json',
        description: 'Goose - Open-source AI agent for developers'
    },
];

/**
 * Generate MCP server config snippet compatible with this client.
 */
function generateConfigSnippet(client, serverUrl, serverName) {
    const url = serverUrl || 'http://127.0.0.1:3000/mcp';
    const name = serverName || 'cocos-creator';

    const serverEntry = {
        url: url,
        type: 'http',
        timeout: 30000
    };

    switch (client.configFormat) {
        case 'json':
        case 'jsonc':
            return JSON.stringify({ mcpServers: { [name]: serverEntry } }, null, 4);
        case 'yaml':
            return `mcp_servers:\n  ${name}:\n    url: "${url}"\n    type: http\n    timeout: 30000`;
        case 'toml':
            return `[mcp_servers.${name}]\nurl = "${url}"\ntype = "http"\ntimeout = 30000`;
        case 'xml':
            return `<!-- JetBrains AI Assistant MCP Config -->\n<!-- Add to ai-assistant.xml -->\n<mcpServer name="${name}" url="${url}" type="http" timeout="30000" />`;
        default:
            return JSON.stringify({ mcpServers: { [name]: serverEntry } }, null, 4);
    }
}

/**
 * Check if an editor is installed by looking for its config path or binary.
 */
function detectInstallation(client) {
    if (client.manualOnly) return 'manual';

    // Check config paths
    for (const configPath of client.configPaths) {
        // Handle glob patterns (e.g., IntelliJIdea*)
        if (configPath.includes('*')) {
            const baseDir = path.dirname(configPath);
            const pattern = path.basename(configPath);
            try {
                if (fs.existsSync(baseDir)) {
                    const entries = fs.readdirSync(baseDir);
                    const matched = entries.find(e => {
                        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
                        return regex.test(e);
                    });
                    if (matched) return 'installed';
                }
            } catch (e) { /* ignore */ }
        } else {
            try {
                if (fs.existsSync(configPath)) return 'installed';
                // Check parent directory exists (config might be created on first run)
                const parent = path.dirname(configPath);
                if (fs.existsSync(parent)) return 'available';
            } catch (e) { /* ignore */ }
        }
    }
    return 'not_detected';
}

/**
 * Get all extended clients with installation status.
 */
function getExtendedClients(serverUrl, serverName) {
    return EXTENDED_CLIENTS.map(client => ({
        ...client,
        status: detectInstallation(client),
        configSnippet: generateConfigSnippet(client, serverUrl, serverName)
    }));
}

/**
 * Get client by type.
 */
function getClientByType(clientType) {
    return EXTENDED_CLIENTS.find(c => c.clientType === clientType) || null;
}

/**
 * Get installation instructions for a client.
 */
function getInstallInstructions(clientType) {
    const client = getClientByType(clientType);
    if (!client) return null;

    if (client.manualInstructions) {
        return client.manualInstructions;
    }

    // Detect OS and give appropriate instructions
    const platform = os.platform();
    const instructions = [];

    instructions.push(`## ${client.clientName} - MCP Configuration`);
    instructions.push('');
    instructions.push('### Configuration');

    if (client.configPaths.length > 0) {
        const validPath = client.configPaths.find(p => !p.includes('*'));
        instructions.push(`Edit your config file: \`${validPath || client.configPaths[0]}\``);
    }

    instructions.push('');
    instructions.push('```json');
    instructions.push(JSON.stringify({
        mcpServers: {
            'cocos-creator': {
                url: 'http://127.0.0.1:3000/mcp',
                type: 'http',
                timeout: 30000
            }
        }
    }, null, 2));
    instructions.push('```');

    return instructions.join('\n');
}

// ============================================================
// VS Code MCP Integration Helpers
// ============================================================

/**
 * Get VS Code user settings path for current platform.
 */
function getVSCodeSettingsPath(insiders = false) {
    const codeDir = insiders ? 'Code - Insiders' : 'Code';
    if (process.platform === 'win32') {
        return path.join(APPDATA, codeDir, 'User', 'settings.json');
    } else if (process.platform === 'darwin') {
        return path.join(HOME, 'Library', 'Application Support', codeDir, 'User', 'settings.json');
    } else {
        return path.join(XDG_CONFIG, codeDir, 'User', 'settings.json');
    }
}

/**
 * Get VS Code workspace MCP config path (.vscode/mcp.json).
 * @param {string} projectPath - Path to the project root
 */
function getVSCodeWorkspaceMCPPath(projectPath) {
    return path.join(projectPath || '.', '.vscode', 'mcp.json');
}

/**
 * Generate VS Code user-level MCP config entry.
 */
function getVSCodeUserConfig(serverUrl, serverName) {
    const url = serverUrl || 'http://127.0.0.1:3000/mcp';
    const name = serverName || 'cocos-creator';
    return {
        path: getVSCodeSettingsPath(),
        insidersPath: getVSCodeSettingsPath(true),
        entry: {
            [name]: {
                type: 'http',
                url: url,
                timeout: 30000
            }
        }
    };
}

/**
 * Generate VS Code workspace-level MCP config (.vscode/mcp.json).
 */
function getVSCodeWorkspaceConfig(serverUrl, serverName) {
    const url = serverUrl || 'http://127.0.0.1:3000/mcp';
    const name = serverName || 'cocos-creator';
    return {
        schema: 'https://raw.githubusercontent.com/microsoft/vscode-mcp/main/schemas/mcp.schema.json',
        servers: {
            [name]: {
                type: 'http',
                url: url,
                timeout: 30000,
                description: 'Cocos Creator Editor MCP Server'
            }
        }
    };
}

/**
 * Check if VS Code is installed.
 */
function isVSCodeInstalled() {
    try {
        return fs.existsSync(getVSCodeSettingsPath()) ||
               fs.existsSync(getVSCodeSettingsPath(true));
    } catch (e) {
        return false;
    }
}

/**
 * Check if VS Code already has Cocos MCP configured.
 */
function isCocosMCPInVSCode() {
    try {
        const settingsPath = getVSCodeSettingsPath();
        if (fs.existsSync(settingsPath)) {
            const content = fs.readFileSync(settingsPath, 'utf8');
            return content.includes('cocos-creator') || content.includes('cocos-mcp-server');
        }
    } catch (e) { /* ignore */ }
    return false;
}

/**
 * Generate MCP config snippet for VS Code Copilot Chat (settings.json format).
 */
function getVSCodeCopilotConfig(serverUrl, serverName) {
    const url = serverUrl || 'http://127.0.0.1:3000/mcp';
    const name = serverName || 'cocos-creator';
    return {
        type: 'http',
        url: url,
        timeout: 30000,
        description: 'Cocos Creator Editor MCP Server v2.8.0'
    };
}

/**
 * Get ALL VS Code-related MCP config info in one call.
 */
function getVSCodeIntegrationInfo(serverUrl, serverName) {
    return {
        installed: isVSCodeInstalled(),
        configured: isCocosMCPInVSCode(),
        userSettingsPath: getVSCodeSettingsPath(),
        insidersSettingsPath: getVSCodeSettingsPath(true),
        workspaceMCPTemplate: getVSCodeWorkspaceConfig(serverUrl, serverName),
        userConfig: getVSCodeUserConfig(serverUrl, serverName),
        copilotChatConfig: getVSCodeCopilotConfig(serverUrl, serverName),
        supportedAssistants: [
            'GitHub Copilot Chat (built-in)',
            'Cline (VS Code extension)',
            'Continue.dev (VS Code extension)',
            'Cody — Sourcegraph (VS Code extension)',
            'Amazon Q Developer (VS Code extension)',
            'Supermaven (VS Code extension)',
            'Augment Code (VS Code extension)'
        ]
    };
}

// ============================================================
// Claude Code & Codex CLI Integration
// ============================================================

/**
 * Get Claude Code config path for current platform.
 */
function getClaudeCodeConfigPath() {
    if (process.platform === 'win32') {
        return path.join(APPDATA, 'Claude', 'claude_desktop_config.json');
    } else if (process.platform === 'darwin') {
        return path.join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    } else {
        return path.join(HOME, '.claude', 'claude_desktop_config.json');
    }
}

/**
 * Generate Claude Code MCP config via CLI command.
 */
function getClaudeCodeCLICommand(serverUrl, serverName) {
    const url = serverUrl || 'http://127.0.0.1:3000/mcp';
    const name = serverName || 'cocos-creator';
    return `claude mcp add ${name} ${url} --transport http`;
}

/**
 * Generate Claude Code MCP config via environment variable.
 */
function getClaudeCodeEnvConfig(serverUrl, serverName) {
    const url = serverUrl || 'http://127.0.0.1:3000/mcp';
    const name = serverName || 'cocos-creator';
    const config = JSON.stringify({ [name]: { type: 'http', url: url, timeout: 30000 } });
    return `export MCP_SERVER_CONFIG='${config}'`;
}

/**
 * Generate Claude Code MCP config file content.
 */
function getClaudeCodeFileConfig(serverUrl, serverName) {
    const url = serverUrl || 'http://127.0.0.1:3000/mcp';
    const name = serverName || 'cocos-creator';
    return JSON.stringify({
        mcpServers: {
            [name]: {
                type: 'http',
                url: url,
                timeout: 30000
            }
        }
    }, null, 2);
}

/**
 * Generate Codex CLI MCP config via CLI command.
 */
function getCodexCLICommand(serverUrl, serverName) {
    const url = serverUrl || 'http://127.0.0.1:3000/mcp';
    const name = serverName || 'cocos-creator';
    return `codex mcp add ${name} --url ${url} --transport http`;
}

/**
 * Generate Codex CLI MCP config file content (TOML format).
 */
function getCodexFileConfig(serverUrl, serverName) {
    const url = serverUrl || 'http://127.0.0.1:3000/mcp';
    const name = serverName || 'cocos-creator';
    return `# Codex CLI MCP Configuration
[mcp_servers.${name}]
url = "${url}"
type = "http"
timeout = 30000
description = "Cocos Creator Editor MCP Server v2.8.0"
`;
}

/**
 * Check if Claude Code is installed.
 */
function isClaudeCodeInstalled() {
    try {
        const configPath = getClaudeCodeConfigPath();
        return fs.existsSync(configPath) || fs.existsSync(path.dirname(configPath));
    } catch (e) { return false; }
}

/**
 * Check if Codex CLI is installed (check for binary).
 */
function isCodexCLIInstalled() {
    try {
        const { execSync } = require('child_process');
        execSync('codex --version', { stdio: 'ignore' });
        return true;
    } catch (e) { return false; }
}

module.exports = {
    EXTENDED_CLIENTS,
    getExtendedClients,
    getClientByType,
    getInstallInstructions,
    generateConfigSnippet,
    detectInstallation,
    // VS Code specific
    getVSCodeSettingsPath,
    getVSCodeWorkspaceMCPPath,
    getVSCodeUserConfig,
    getVSCodeWorkspaceConfig,
    isVSCodeInstalled,
    isCocosMCPInVSCode,
    getVSCodeIntegrationInfo,
    getVSCodeCopilotConfig,
    // Claude Code specific
    getClaudeCodeConfigPath,
    getClaudeCodeCLICommand,
    getClaudeCodeEnvConfig,
    getClaudeCodeFileConfig,
    isClaudeCodeInstalled,
    // Codex CLI specific
    getCodexCLICommand,
    getCodexFileConfig,
    isCodexCLIInstalled
};
