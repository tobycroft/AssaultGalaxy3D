"use strict";
// Open-source stub: run MCP server in-process (no sidecar binary needed).
class SidecarExecutor {
    constructor(mcpServer, isEntitled) {
        this._server = mcpServer;
        this._entitled = !!isEntitled;
        this.onPortFallback = null;
    }
    async start() { await this._server.start(); return { success: true }; }
    async stop() { await this._server.stop(); return { success: true }; }
    isRunning() { const s = this._server.getStatus(); return !!(s && s.running); }
    getPort() { return this._server.getSettings ? this._server.getSettings().port : null; }
}
module.exports = { SidecarExecutor };
