const config = require("../config");

function getCloudConfig() {
  return config.cloud || {};
}

function getLocalConfig() {
  return config.local || {};
}

function getFunctionName() {
  return (getCloudConfig().functionName || "baby").trim();
}

function getEnvId() {
  return (getCloudConfig().envId || "").trim();
}

function getCloudFunctionNotFoundMessage() {
  return `云函数 ${getFunctionName()} 未部署，请在微信开发者工具中上传并部署 cloudfunctions/${getFunctionName()}。`;
}

function isCloudEnabled() {
  return Boolean(wx.cloud && getEnvId());
}

function now() {
  return Date.now();
}

const DASHBOARD_CACHE_TTL = 30 * 1000;
const AVATAR_CACHE_STORAGE_KEY = "baby-care-avatar-cache";
let cachedDashboardState = null;
let cachedDashboardAt = 0;
let pendingBootstrapPromise = null;
let cacheVersion = 0;

function readAvatarCache() {
  const cache = wx.getStorageSync(AVATAR_CACHE_STORAGE_KEY);
  return cache && typeof cache === "object" ? cache : {};
}

function writeAvatarCache(cache) {
  wx.setStorageSync(AVATAR_CACHE_STORAGE_KEY, cache || {});
}

function cacheBabyAvatar(babyId, avatarFileId) {
  if (!babyId) {
    return;
  }

  const cache = readAvatarCache();
  if (avatarFileId) {
    cache[babyId] = avatarFileId;
  } else {
    delete cache[babyId];
  }
  writeAvatarCache(cache);
}

function applyCachedBabyAvatar(baby) {
  if (!baby || baby.avatarFileId) {
    return baby;
  }

  const avatarFileId = readAvatarCache()[baby.id];
  return avatarFileId
    ? {
        ...baby,
        avatarFileId,
      }
    : baby;
}

function readCachedDashboardState(maxAge = DASHBOARD_CACHE_TTL) {
  if (!cachedDashboardState) {
    return null;
  }

  if (maxAge > 0 && now() - cachedDashboardAt > maxAge) {
    return null;
  }

  return cachedDashboardState;
}

function writeCachedDashboardState(state) {
  if (state && state.baby) {
    cacheBabyAvatar(state.baby.id, state.baby.avatarFileId || "");
  }

  cachedDashboardState = state
    ? {
        ...state,
        baby: applyCachedBabyAvatar(state.baby),
      }
    : null;
  cachedDashboardAt = cachedDashboardState ? now() : 0;
  return cachedDashboardState;
}

function writeFreshDashboardState(state) {
  cacheVersion += 1;
  return writeCachedDashboardState(state);
}

function clearCachedDashboardState() {
  cacheVersion += 1;
  cachedDashboardState = null;
  cachedDashboardAt = 0;
}

function createLocalBaby() {
  const timestamp = now();
  return {
    id: "local-baby",
    name: "我的宝宝",
    birthDate: "",
    avatarFileId: "",
    inviteCode: "LOCAL",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createLocalState() {
  const timestamp = now();
  return {
    baby: createLocalBaby(),
    members: [
      {
        id: "local-owner",
        role: "owner",
        isSelf: true,
        joinedAt: timestamp,
      },
    ],
    records: [],
    diaries: [],
  };
}

function readLegacyLocalRecords() {
  return wx.getStorageSync("baby-care-records") || [];
}

function migrateLegacyLocalState() {
  const legacyRecords = readLegacyLocalRecords();

  if (!legacyRecords.length) {
    return createLocalState();
  }

  const state = createLocalState();
  const records = legacyRecords.map((record) =>
    normalizeRecord(
      {
        ...record,
        babyId: state.baby.id,
        recordAt:
          record.recordAt ||
          new Date(`${record.date}T${record.time}:00`).getTime() ||
          now(),
      },
      state.baby.id
    )
  );

  const nextState = {
    ...state,
    records,
    diaries: [],
  };

  wx.removeStorageSync("baby-care-records");
  writeLocalState(nextState);
  return nextState;
}

function getLocalStateKey() {
  return getLocalConfig().stateKey || "baby-care-local-state";
}

function sortRecords(records) {
  return records.slice().sort((left, right) => {
    if (left.recordAt === right.recordAt) {
      return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
    }

    return Number(right.recordAt || 0) - Number(left.recordAt || 0);
  });
}

function normalizePoopShapeId(shapeId) {
  const rawValue =
    shapeId !== undefined && shapeId !== null
      ? shapeId
      : "";
  const value = String(rawValue).trim();

  switch (value) {
    case "0":
      return "paste";
    case "1":
      return "dry";
    case "2":
      return "cream";
    case "3":
      return "curd";
    case "4":
      return "watery";
    case "5":
      return "foamy";
    case "糊状":
      return "paste";
    case "干糊":
      return "dry";
    case "膏状":
      return "cream";
    case "奶瓣":
      return "curd";
    case "稀水样":
      return "watery";
    case "泡沫状":
      return "foamy";
    default:
      return value;
  }
}

function normalizeDiaperRashId(rashId) {
  if (rashId === true || rashId === 1) {
    return "yes";
  }

  if (rashId === false || rashId === 0) {
    return "no";
  }

  const rawValue =
    rashId !== undefined && rashId !== null
      ? rashId
      : "";
  const value = String(rawValue).trim();

  switch (value) {
    case "true":
    case "1":
    case "有":
      return "yes";
    case "false":
    case "0":
    case "无":
      return "no";
    case "是":
      return "yes";
    case "否":
      return "no";
    default:
      return value;
  }
}

function normalizeRecord(record, babyId) {
  const timestamp = record.recordAt || Date.now();
  return {
    ...record,
    id: record.id || record._id,
    babyId: record.babyId || babyId || "local-baby",
    method: record.method || "",
    note: record.note || "",
    amount: record.amount !== undefined && record.amount !== null ? String(record.amount) : "",
    solidFood: record.solidFood || "",
    diaperType: record.diaperType || "",
    poopColorId: record.poopColorId || "",
    poopShapeId: normalizePoopShapeId(record.poopShapeId),
    diaperRash: normalizeDiaperRashId(record.diaperRash),
    durationMinutes:
      record.durationMinutes !== undefined && record.durationMinutes !== null
        ? String(record.durationMinutes)
        : "",
    dosage: record.dosage !== undefined && record.dosage !== null ? String(record.dosage) : "",
    temperature:
      record.temperature !== undefined && record.temperature !== null
        ? String(record.temperature)
        : "",
    height: record.height !== undefined && record.height !== null ? String(record.height) : "",
    weight: record.weight !== undefined && record.weight !== null ? String(record.weight) : "",
    headCircumference:
      record.headCircumference !== undefined && record.headCircumference !== null
        ? String(record.headCircumference)
        : "",
    createdAt: record.createdAt || timestamp,
    updatedAt: record.updatedAt || timestamp,
    recordAt: timestamp,
  };
}

function readLocalState() {
  const state = wx.getStorageSync(getLocalStateKey());
  if (!state || !state.baby) {
    return migrateLegacyLocalState();
  }

  return {
    baby: state.baby,
    members: state.members || [],
    records: sortRecords((state.records || []).map((record) => normalizeRecord(record, state.baby.id))),
    diaries: sortDiaries((state.diaries || []).map((diary) => normalizeDiary(diary, state.baby.id))),
  };
}

function writeLocalState(state) {
  const nextState = {
    baby: state.baby,
    members: state.members || [],
    records: sortRecords(state.records || []),
    diaries: sortDiaries(state.diaries || []),
  };

  wx.setStorageSync(getLocalStateKey(), nextState);
  return nextState;
}

function buildStorageMeta() {
  if (isCloudEnabled()) {
    return {
      mode: "cloud",
      title: "云开发协作模式",
      description: "已启用云函数和云数据库，可邀请家人共同管理同一个宝宝。",
      collaborationEnabled: true,
    };
  }

  return {
    mode: "local",
    title: "本地单机模式",
    description: "当前只保存在本机。填写云环境 envId 并部署云函数后，才支持邀请他人共同管理。",
    collaborationEnabled: false,
  };
}

function buildStateResult(state) {
  const baby = applyCachedBabyAvatar(state.baby);

  return {
    baby,
    members: (state.members || []).map((member, index) => ({
      ...member,
      role: member.role || "manager",
      isSelf:
        member.isSelf !== undefined
          ? Boolean(member.isSelf)
          : state.members.length === 1 && index === 0,
    })),
    records: sortRecords((state.records || []).map((record) => normalizeRecord(record, baby.id))),
    diaries: sortDiaries((state.diaries || []).map((diary) => normalizeDiary(diary, baby.id))),
    currentUserRole:
      (state.members || []).find((member) => member.isSelf)?.role ||
      ((state.members || [])[0] && state.members[0].role) ||
      "owner",
    canManageMembers: false,
    storageMeta: buildStorageMeta(),
  };
}

function getRecordTimestamp(record) {
  const value = new Date(`${record.date}T${record.time}:00`).getTime();
  return Number.isNaN(value) ? now() : value;
}

function normalizeCloudError(error) {
  const message = String((error && error.errMsg) || (error && error.message) || "");

  if (
    error && error.errCode === -501000 ||
    message.includes("FUNCTION_NOT_FOUND") ||
    message.includes("FunctionName parameter could not be found")
  ) {
    return new Error(getCloudFunctionNotFoundMessage());
  }

  if (message.includes("environment not found") || message.includes("ENV_NOT_FOUND")) {
    return new Error(`云开发环境 ${getEnvId()} 不存在或无权限访问，请检查 envId 配置。`);
  }

  if (message.includes("cloud.callFunction:fail")) {
    return new Error("云服务暂时不可用，请稍后重试。");
  }

  return new Error(message || "操作失败");
}

async function callCloud(action, data) {
  let result;

  try {
    result = await wx.cloud.callFunction({
      name: getFunctionName(),
      data: {
        action,
        data,
      },
    });
  } catch (error) {
    console.error("[baby-service] cloud call failed", {
      action,
      error,
    });
    throw normalizeCloudError(error);
  }

  const payload = result.result || {};
  if (!payload.ok) {
    console.error("[baby-service] cloud action failed", {
      action,
      payload,
    });
    throw new Error(payload.message || "操作失败");
  }

  return payload.data;
}

function sortDiaries(diaries) {
  return diaries.slice().sort((left, right) => {
    if (left.date === right.date) {
      return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
    }

    return String(left.date || "") > String(right.date || "") ? -1 : 1;
  });
}

function normalizeDiary(diary, babyId) {
  const timestamp = diary.updatedAt || diary.createdAt || now();
  return {
    ...diary,
    id: diary.id || diary._id || "",
    babyId: diary.babyId || babyId || "local-baby",
    date: diary.date || "",
    title: diary.title || "",
    content: diary.content || "",
    createdAt: diary.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

async function bootstrap(options = {}) {
  if (isCloudEnabled()) {
    const { forceRefresh = false, preferCache = false, maxAge = DASHBOARD_CACHE_TTL } = options;
    const cachedState = !forceRefresh && preferCache ? readCachedDashboardState(maxAge) : null;

    if (cachedState) {
      return cachedState;
    }

    if (!forceRefresh && pendingBootstrapPromise) {
      return pendingBootstrapPromise;
    }

    const requestVersion = cacheVersion;
    pendingBootstrapPromise = callCloud("bootstrap")
      .then((state) => {
        if (requestVersion === cacheVersion) {
          writeCachedDashboardState(state);
          return state;
        }

        return cachedDashboardState || state;
      })
      .finally(() => {
        pendingBootstrapPromise = null;
      });

    return pendingBootstrapPromise;
  }

  return buildStateResult(readLocalState());
}

async function saveProfile(profile) {
  if (isCloudEnabled()) {
    return callCloud("saveProfile", profile).then((state) => writeFreshDashboardState(state));
  }

  const state = readLocalState();
  const nextState = writeLocalState({
    ...state,
    baby: {
      ...state.baby,
      name: profile.name || state.baby.name,
      birthDate: profile.birthDate || "",
      avatarFileId:
        profile.avatarFileId !== undefined
          ? profile.avatarFileId || ""
          : state.baby.avatarFileId || "",
      updatedAt: now(),
    },
  });

  return buildStateResult(nextState);
}

async function uploadAvatar(filePath, babyId) {
  if (!isCloudEnabled()) {
    throw new Error("当前为本地模式，开启云开发后才能上传头像。");
  }

  const extensionMatch = String(filePath || "").match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "jpg";
  const safeBabyId = String(babyId || "baby").replace(/[^a-zA-Z0-9_-]/g, "");
  const cloudPath = `baby-avatars/${safeBabyId || "baby"}-${Date.now()}.${extension}`;
  const result = await wx.cloud.uploadFile({
    cloudPath,
    filePath,
  });

  if (!result || !result.fileID) {
    throw new Error("头像上传失败");
  }

  cacheBabyAvatar(babyId, result.fileID);
  return result.fileID;
}

async function joinBaby(inviteCode) {
  if (isCloudEnabled()) {
    return callCloud("joinBaby", {
      inviteCode,
    }).then((state) => writeFreshDashboardState(state));
  }

  throw new Error("本地模式不支持邀请协作，请先开启云开发。");
}

async function saveRecord(record) {
  if (isCloudEnabled()) {
    return callCloud("saveRecord", record).then((state) => writeFreshDashboardState(state));
  }

  const state = readLocalState();
  const normalizedRecord = normalizeRecord(
    {
      ...record,
      babyId: state.baby.id,
      recordAt: getRecordTimestamp(record),
      updatedAt: now(),
      createdAt: record.createdAt || now(),
    },
    state.baby.id
  );
  const nextRecords = record.id
    ? state.records.map((item) => (item.id === record.id ? normalizedRecord : item))
    : [
        {
          ...normalizedRecord,
          id: normalizedRecord.id || `local-${Date.now()}`,
        },
        ...state.records,
      ];

  const nextState = writeLocalState({
    ...state,
    records: nextRecords,
  });

  return buildStateResult(nextState);
}

async function deleteRecord(recordId) {
  if (isCloudEnabled()) {
    return callCloud("deleteRecord", {
      recordId,
    }).then((state) => writeFreshDashboardState(state));
  }

  const state = readLocalState();
  const nextState = writeLocalState({
    ...state,
    records: state.records.filter((record) => record.id !== recordId),
  });

  return buildStateResult(nextState);
}

async function clearAllRecords() {
  if (isCloudEnabled()) {
    return callCloud("clearAllRecords").then((state) => writeFreshDashboardState(state));
  }

  const state = readLocalState();
  const nextState = writeLocalState({
    ...state,
    records: [],
  });

  return buildStateResult(nextState);
}

async function getDiaries() {
  if (isCloudEnabled()) {
    const diaries = await callCloud("getDiaries");
    return sortDiaries((diaries || []).map((diary) => normalizeDiary(diary)));
  }

  return buildStateResult(readLocalState()).diaries;
}

async function saveDiary(diary) {
  if (isCloudEnabled()) {
    const diaries = await callCloud("saveDiary", diary);
    return sortDiaries((diaries || []).map((item) => normalizeDiary(item)));
  }

  const state = readLocalState();
  const timestamp = now();
  const normalizedDiary = normalizeDiary(
    {
      ...diary,
      babyId: state.baby.id,
      updatedAt: timestamp,
      createdAt: diary.createdAt || timestamp,
    },
    state.baby.id
  );
  const existingDiary = normalizedDiary.id
    ? state.diaries.find((item) => item.id === normalizedDiary.id)
    : null;
  const nextDiaries = existingDiary
    ? state.diaries.map((item) =>
        item.id === normalizedDiary.id
          ? {
              ...normalizedDiary,
              id: item.id,
              createdAt: item.createdAt || normalizedDiary.createdAt,
            }
          : item
      )
    : [
        {
          ...normalizedDiary,
          id: normalizedDiary.id || `local-diary-${Date.now()}`,
        },
        ...state.diaries,
      ];

  const nextState = writeLocalState({
    ...state,
    diaries: nextDiaries,
  });

  return buildStateResult(nextState).diaries;
}

async function deleteDiary(diaryId) {
  if (isCloudEnabled()) {
    const diaries = await callCloud("deleteDiary", {
      diaryId,
    });
    return sortDiaries((diaries || []).map((diary) => normalizeDiary(diary)));
  }

  const state = readLocalState();
  const nextState = writeLocalState({
    ...state,
    diaries: state.diaries.filter((diary) => diary.id !== diaryId),
  });

  return buildStateResult(nextState).diaries;
}

async function removeMember(memberId) {
  if (isCloudEnabled()) {
    return callCloud("removeMember", {
      memberId,
    }).then((state) => writeFreshDashboardState(state));
  }

  throw new Error("当前模式不支持成员管理，请先开启云开发。");
}

async function leaveBaby() {
  if (isCloudEnabled()) {
    clearCachedDashboardState();
    return callCloud("leaveBaby", undefined).then((state) => writeFreshDashboardState(state));
  }

  throw new Error("当前模式不支持退出协作，请先开启云开发。");
}

module.exports = {
  bootstrap,
  clearAllRecords,
  clearCachedDashboardState,
  deleteDiary,
  deleteRecord,
  getDiaries,
  leaveBaby,
  joinBaby,
  removeMember,
  saveDiary,
  saveProfile,
  saveRecord,
  uploadAvatar,
};
