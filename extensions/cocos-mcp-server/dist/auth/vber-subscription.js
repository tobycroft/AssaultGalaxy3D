"use strict";
// Open-source stub: named class export for `new mod.VberSubscription()` pattern
class VberSubscription {
    constructor() { this._entitled = true; }
    initialize() { return Promise.resolve(true); }
    verify() { return Promise.resolve(true); }
    isEntitled() { return true; }
    getSubscriptionInfo() {
        return { loggedIn: false, email: "", entitled: true, plan: "Open Source",
                 denyCode: null, upgradeUrl: "", webBase: "" };
    }
    status() { return Promise.resolve({ loggedIn: false, entitled: true }); }
    login(email, password) { return { success: true }; }
    loginGoogle() { return { success: true }; }
    logout() { return { success: true }; }
}
module.exports = { VberSubscription };
