"use strict";
// Open-source stub: named class export with checkForUpdateWithSkip
class UpdateChecker {
    constructor() {}
    checkForUpdate() { return Promise.resolve({ hasUpdate: false, latestVersion: null, currentVersion: null, changelog: "", releaseDate: null, downloadUrl: "", urgency: "none" }); }
    checkForUpdateWithSkip() { return Promise.resolve({ hasUpdate: false }); }
    skipVersion(v) { return true; }
    getSkippedVersion() { return null; }
    setCurrentVersion(v) { return true; }
}
module.exports = { UpdateChecker };
