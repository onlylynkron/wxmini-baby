const config = require("./config");

App({
  onLaunch() {
    const envId = (config.cloud && config.cloud.envId) || "";

    if (!wx.cloud || !envId.trim()) {
      return;
    }

    wx.cloud.init({
      env: envId.trim(),
      traceUser: config.cloud.traceUser !== false,
    });
  },

  globalData: {
    storageKey: (config.local && config.local.stateKey) || "baby-care-local-state",
  },
});
