"use strict";
// Open-source stub: named class export for `new mod.SessionManager()` pattern
class SessionManager {
    constructor() {}
    initialize() { return Promise.resolve(true); }
    hasFreshSession() { return true; }
    ensureValidSession() { return true; }
    ensureFreshToken() { return true; }
    verifyTokenOffline(token) { return { valid: true, claims: { entitled: true } }; }
    getCurrentSession() { return { valid: true, token: "open-source", email: "" }; }
    clearSession() { return true; }
    stopAutoRefresh() { return true; }
    destroy() { return true; }
}
module.exports = { SessionManager };
