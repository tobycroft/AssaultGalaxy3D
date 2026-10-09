"use strict";
// Open-source stub: added setKnowledgeSessionProvider (required at load())
// + fetchServerKnowledge (required by knowledge-handler tool_guide action)
module.exports = {
    syncKnowledge: function() { return Promise.resolve({ success: true }); },
    getKnowledgeData: function() { return Promise.resolve({}); },
    uploadKnowledge: function(data) { return Promise.resolve({ success: true }); },
    checkKnowledgeVersion: function() { return Promise.resolve({ upToDate: true, version: "0.0.0" }); },
    setKnowledgeSessionProvider: function(fn) { return true; },
    fetchServerKnowledge: function(toolName) { return Promise.resolve(null); }
};
