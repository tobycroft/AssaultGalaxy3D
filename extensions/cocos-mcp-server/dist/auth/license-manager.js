"use strict";
// Open-source stub: named class export for `new mod.LicenseManager()` pattern
class LicenseManager {
    constructor() { this._licensed = true; }
    get isLicensed() { return true; }
    validate() { return true; }
    getLicenseInfo() {
        return { isActivated: true, isTrial: false, isExpired: false, isPermanent: true,
                 licenseType: "Open Source", daysRemaining: 9999, daysLeft: 9999,
                 email: "", expiryDate: "2099-12-31", inviteCode: "", machineId: "open-source" };
    }
    activate(email, code) { return { success: true, message: "Open source - no activation needed" }; }
    deactivate() { return { success: true }; }
    changeCode(newCode) { return { success: true }; }
    initialize() { return Promise.resolve(true); }
    dispose() { return Promise.resolve(true); }
    destroy() { return Promise.resolve(true); }
}
module.exports = { LicenseManager };
