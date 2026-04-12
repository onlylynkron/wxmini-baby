module.exports = {
  cloud: {
    // 填入微信云开发环境 ID；留空则继续使用本地缓存。
    envId: "cloud1-2g4btgz3ae69f1a5",
    traceUser: true,
    functionName: "baby",
    collections: {
      babies: "baby_profiles",
      members: "baby_members",
      records: "baby_records",
      users: "baby_users",
    },
  },
  local: {
    stateKey: "baby-care-local-state",
  },
};
