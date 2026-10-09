"use strict";
// Open-source stub: added isSessionRequired (gated session flow check)
module.exports = {
    isAuthDisabled: function() { return true; },
    isSessionRequired: function() { return false; },
    getAuthConfig: function() { return { authDisabled: true, serverUrl: "", apiKey: "" }; },
    getServerUrl: function() { return ""; },
    getApiKey: function() { return ""; }
};
