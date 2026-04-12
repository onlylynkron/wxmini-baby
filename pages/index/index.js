const babyService = require("../../utils/baby-service");

const RECORD_TYPES = [
  { id: "feeding", label: "喝奶" },
  { id: "diaper", label: "尿布" },
  { id: "sleep", label: "睡眠" },
  { id: "medicine", label: "喂药" },
  { id: "temperature", label: "体温" },
  { id: "growth", label: "成长" },
];
const RECORD_FILTER_OPTIONS = [{ id: "all", label: "全部" }, ...RECORD_TYPES];

const FEEDING_METHODS = ["配方奶", "母乳", "混合喂养", "其他"];
const FEEDING_AMOUNT_OPTIONS = [
  { label: "30 ml", value: "30" },
  { label: "60 ml", value: "60" },
  { label: "90 ml", value: "90" },
  { label: "120 ml", value: "120" },
  { label: "150 ml", value: "150" },
  { label: "180 ml", value: "180" },
  { label: "210 ml", value: "210" },
  { label: "240 ml", value: "240" },
];
const DIAPER_TYPES = ["尿尿", "便便", "混合"];
const SLEEP_TYPES = ["白天小睡", "夜间睡眠"];
const MEDICINE_UNITS = ["ml", "滴", "粒", "包", "次"];
const TEMPERATURE_METHODS = ["腋温", "耳温", "额温"];
const PREFERRED_FEEDING_METHOD_KEY = "baby-care-preferred-feeding-method";
const PROFILE_COLLAPSE_STORAGE_KEY = "baby-care-profile-collapse-state";
const COLLABORATION_COLLAPSE_STORAGE_KEY = "baby-care-collaboration-collapse-state";
const RECORD_FILTER_COLLAPSE_STORAGE_KEY = "baby-care-record-filter-collapse-state";
const LATEST_STATUS_FRESH_THRESHOLD = 30 * 60 * 1000;
const LATEST_STATUS_WARNING_THRESHOLD = 2 * 60 * 60 * 1000;
const LATEST_STATUS_ALERT_THRESHOLD = 4 * 60 * 60 * 1000;

const POOP_COLORS = [
  { id: "golden", label: "金黄", image: "/assets/poop-colors/golden.png" },
  { id: "yellow", label: "浅黄", image: "/assets/poop-colors/yellow.png" },
  { id: "green", label: "绿色", image: "/assets/poop-colors/green.png" },
  { id: "brown", label: "棕色", image: "/assets/poop-colors/brown.png" },
  { id: "black", label: "黑色", image: "/assets/poop-colors/black.png" },
  { id: "red", label: "偏红", image: "/assets/poop-colors/red.png" },
];

const POOP_COLOR_MAP = POOP_COLORS.reduce((result, item) => {
  result[item.id] = item;
  return result;
}, {});

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-");
}

function formatTime(date) {
  return [pad(date.getHours()), pad(date.getMinutes())].join(":");
}

function normalizeInviteCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function confirmAction(options) {
  return new Promise((resolve) => {
    wx.showModal({
      cancelText: "取消",
      confirmColor: "#cf5f36",
      ...options,
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false),
    });
  });
}

function readProfileCollapseState() {
  const state = wx.getStorageSync(PROFILE_COLLAPSE_STORAGE_KEY);
  return state && typeof state === "object" ? state : {};
}

function readCollaborationCollapseState() {
  const state = wx.getStorageSync(COLLABORATION_COLLAPSE_STORAGE_KEY);
  return state && typeof state === "object" ? state : {};
}

function readRecordFilterCollapseState() {
  const state = wx.getStorageSync(RECORD_FILTER_COLLAPSE_STORAGE_KEY);
  return state && typeof state === "object" ? state : {};
}

function isProfileCollapsed(babyId) {
  if (!babyId) {
    return false;
  }

  return Boolean(readProfileCollapseState()[babyId]);
}

function isCollaborationCollapsed(babyId) {
  if (!babyId) {
    return false;
  }

  return Boolean(readCollaborationCollapseState()[babyId]);
}

function isRecordFilterCollapsed(babyId) {
  if (!babyId) {
    return true;
  }

  const state = readRecordFilterCollapseState();
  if (Object.prototype.hasOwnProperty.call(state, babyId)) {
    return Boolean(state[babyId]);
  }

  return true;
}

function saveProfileCollapseState(babyId, collapsed) {
  if (!babyId) {
    return;
  }

  const state = readProfileCollapseState();
  if (collapsed) {
    state[babyId] = true;
  } else {
    delete state[babyId];
  }

  wx.setStorageSync(PROFILE_COLLAPSE_STORAGE_KEY, state);
}

function saveCollaborationCollapseState(babyId, collapsed) {
  if (!babyId) {
    return;
  }

  const state = readCollaborationCollapseState();
  if (collapsed) {
    state[babyId] = true;
  } else {
    delete state[babyId];
  }

  wx.setStorageSync(COLLABORATION_COLLAPSE_STORAGE_KEY, state);
}

function saveRecordFilterCollapseState(babyId, collapsed) {
  if (!babyId) {
    return;
  }

  const state = readRecordFilterCollapseState();
  state[babyId] = Boolean(collapsed);
  wx.setStorageSync(RECORD_FILTER_COLLAPSE_STORAGE_KEY, state);
}

function getPreferredFeedingMethod() {
  const preferredMethod = wx.getStorageSync(PREFERRED_FEEDING_METHOD_KEY);
  return FEEDING_METHODS.includes(preferredMethod)
    ? preferredMethod
    : FEEDING_METHODS[0];
}

function savePreferredFeedingMethod(method) {
  if (!FEEDING_METHODS.includes(method)) {
    return;
  }

  wx.setStorageSync(PREFERRED_FEEDING_METHOD_KEY, method);
}

function getAmountPickerIndex(amount) {
  const value = String(amount || "");
  const index = FEEDING_AMOUNT_OPTIONS.findIndex((item) => item.value === value);

  return index >= 0 ? index : 3;
}

function createDefaultProfile() {
  return {
    id: "",
    name: "我的宝宝",
    birthDate: "",
    inviteCode: "",
  };
}

function createDefaultForm() {
  const now = new Date();
  return {
    type: RECORD_TYPES[0].id,
    date: formatDate(now),
    time: formatTime(now),
    note: "",
    method: getPreferredFeedingMethod(),
    amount: "",
    diaperType: DIAPER_TYPES[0],
    poopColorId: POOP_COLORS[0].id,
    sleepType: SLEEP_TYPES[0],
    durationMinutes: "",
    medicineName: "",
    dosage: "",
    doseUnit: MEDICINE_UNITS[0],
    temperature: "",
    temperatureMethod: TEMPERATURE_METHODS[0],
    height: "",
    weight: "",
    headCircumference: "",
  };
}

function createSummary() {
  return {
    feedingCount: 0,
    totalAmount: 0,
    diaperCount: 0,
    sleepMinutes: 0,
    medicineCount: 0,
    temperatureCount: 0,
    growthCount: 0,
    latestTemperature: "",
  };
}

function createDefaultStorageMeta() {
  return {
    mode: "local",
    collaborationEnabled: false,
  };
}

function createLatestStatusCards() {
  return [
    {
      label: "最后喝奶",
      timeText: "暂无记录",
      detailText: "",
      relativeText: "还没有喝奶记录",
      cardClass: "latest-status-feeding",
      toneClass: "latest-status-tone-empty",
      badgeText: "",
      badgeClass: "",
    },
    {
      label: "最后换尿布",
      timeText: "暂无记录",
      detailText: "",
      relativeText: "还没有尿布记录",
      cardClass: "latest-status-diaper",
      toneClass: "latest-status-tone-empty",
      badgeText: "",
      badgeClass: "",
    },
  ];
}

function getAgeInfo(birthDate) {
  if (!birthDate) {
    return {
      shortText: "未设置",
      detailText: "设置出生日期后会自动计算天数、周数和周岁。",
      days: 0,
    };
  }

  const birth = new Date(`${birthDate}T00:00:00`);
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (Number.isNaN(birth.getTime()) || birth > current) {
    return {
      shortText: "日期无效",
      detailText: "出生日期不能晚于今天。",
      days: 0,
    };
  }

  const diffDays = Math.floor((current.getTime() - birth.getTime()) / 86400000) + 1;
  const totalWeeks = Math.floor(diffDays / 7);
  const remainDays = diffDays % 7;
  let years = current.getFullYear() - birth.getFullYear();
  let months = current.getMonth() - birth.getMonth();

  if (current.getDate() < birth.getDate()) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const shortText = years > 0 ? `${years}岁${months}个月` : `${diffDays}天`;
  return {
    shortText,
    detailText: `${diffDays}天 · ${totalWeeks}周${remainDays}天`,
    days: diffDays,
  };
}

function buildMemberSummary(members) {
  if (!members.length) {
    return "1位成员";
  }

  return `${members.length}位成员`;
}

function getMemberRoleLabel(role) {
  return role === "owner" ? "管理员" : "协作者";
}

function sortMembers(members) {
  return members.slice().sort((left, right) => {
    const leftRoleWeight = left.role === "owner" ? 0 : 1;
    const rightRoleWeight = right.role === "owner" ? 0 : 1;

    if (leftRoleWeight !== rightRoleWeight) {
      return leftRoleWeight - rightRoleWeight;
    }

    if (Boolean(left.isSelf) !== Boolean(right.isSelf)) {
      return Number(Boolean(right.isSelf)) - Number(Boolean(left.isSelf));
    }

    return Number(left.joinedAt || 0) - Number(right.joinedAt || 0);
  });
}

function buildMemberList(members, canManageMembers) {
  let collaboratorIndex = 0;

  return sortMembers(members).map((member) => {
    let displayName = "成员";
    let hintText = "共同管理成员";

    if (member.isSelf) {
      displayName = "我";
      hintText = "当前使用设备";
    } else if (member.role === "owner") {
      displayName = "管理员";
      hintText = "创建者";
    } else {
      collaboratorIndex += 1;
      displayName = `成员 ${collaboratorIndex}`;
    }

    return {
      ...member,
      displayName,
      hintText,
      roleLabel: getMemberRoleLabel(member.role),
      canRemove: Boolean(canManageMembers && !member.isSelf && member.role !== "owner"),
    };
  });
}

function buildCollaborationHint(storageMeta, canManageMembers) {
  if (!storageMeta.collaborationEnabled) {
    return "开启云开发后可邀请家人共同记录。";
  }

  if (canManageMembers) {
    return "分享给微信好友，对方打开后会自动加入当前宝宝。";
  }

  return "可继续分享邀请家人一起记录当前宝宝。";
}

function buildCollaborationSummaryText(storageMeta, members, canManageMembers) {
  if (!storageMeta.collaborationEnabled) {
    return "未开启云协作";
  }

  if (canManageMembers) {
    return `${members.length}位成员 · 可邀请和管理成员`;
  }

  return `${members.length}位成员 · 可查看协作成员`;
}

function getRecordTimestampValue(record) {
  const recordDateText = String((record && record.date) || "").trim();
  const recordTimeText = String((record && record.time) || "").trim();

  if (recordDateText && recordTimeText) {
    const parsedValue = new Date(`${recordDateText}T${recordTimeText}:00`).getTime();
    if (!Number.isNaN(parsedValue)) {
      return parsedValue;
    }
  }

  const timestamp = Number(record && record.recordAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatElapsedDurationText(timestamp, options = {}) {
  const { includePrefix = false, compact = false } = options;

  if (!timestamp) {
    return includePrefix ? "暂无记录" : "";
  }

  const rawDiff = Date.now() - timestamp;
  if (rawDiff < -60000) {
    return includePrefix ? "时间在未来" : "时间异常";
  }

  const diff = Math.max(0, rawDiff);
  const totalMinutes = Math.floor(diff / 60000);

  if (totalMinutes < 1) {
    return includePrefix ? "距现在 刚刚" : "刚刚";
  }

  if (totalMinutes < 60) {
    const text = compact ? `${totalMinutes}分钟` : `${totalMinutes}分钟`;
    return includePrefix ? `距现在 ${text}` : text;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remainMinutes = totalMinutes % 60;

  if (totalHours < 24) {
    const text = remainMinutes
      ? `${totalHours}小时${compact ? `${remainMinutes}分` : `${remainMinutes}分钟`}`
      : `${totalHours}小时`;
    return includePrefix ? `距现在 ${text}` : text;
  }

  const totalDays = Math.floor(totalHours / 24);
  const remainHours = totalHours % 24;

  if (totalDays < 30) {
    const text = remainHours ? `${totalDays}天${remainHours}小时` : `${totalDays}天`;
    return includePrefix ? `距现在 ${text}` : text;
  }

  const totalMonths = Math.floor(totalDays / 30);
  const remainDays = totalDays % 30;
  const text = remainDays ? `${totalMonths}个月${remainDays}天` : `${totalMonths}个月`;
  return includePrefix ? `距现在 ${text}` : text;
}

function formatRelativeDuration(record) {
  return formatElapsedDurationText(getRecordTimestampValue(record), {
    includePrefix: true,
  });
}

function isSameCalendarDay(left, right) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatLatestRecordTime(record) {
  const now = new Date();
  const todayText = formatDate(now);
  const yesterdayText = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const recordDateText = record.date || "";
  const recordTimeText = record.time || "";

  if (recordDateText === todayText) {
    return `今天 ${recordTimeText}`;
  }

  if (recordDateText === yesterdayText) {
    return `昨天 ${recordTimeText}`;
  }

  if (recordDateText && recordTimeText) {
    return `${recordDateText} ${recordTimeText}`;
  }

  const recordDate = new Date(getRecordTimestampValue(record));
  if (!Number.isNaN(recordDate.getTime())) {
    if (isSameCalendarDay(recordDate, now)) {
      return `今天 ${pad(recordDate.getHours())}:${pad(recordDate.getMinutes())}`;
    }

    if (isSameCalendarDay(recordDate, new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) {
      return `昨天 ${pad(recordDate.getHours())}:${pad(recordDate.getMinutes())}`;
    }

    return `${formatDate(recordDate)} ${pad(recordDate.getHours())}:${pad(recordDate.getMinutes())}`;
  }

  return "暂无时间";
}

function buildDiaperDetailText(record) {
  if (!record) {
    return "";
  }

  const parts = [record.diaperType || "尿布记录"];
  const poopColor = POOP_COLOR_MAP[record.poopColorId];

  if (poopColor && (record.diaperType === "便便" || record.diaperType === "混合")) {
    parts.push(poopColor.label);
  }

  return parts.join(" · ");
}

function getLatestStatusTone(record) {
  if (!record) {
    return "empty";
  }

  const timestamp = getRecordTimestampValue(record);
  if (!timestamp) {
    return "empty";
  }

  const rawDiff = Date.now() - timestamp;
  if (rawDiff < -60000) {
    return "future";
  }

  const diff = Math.max(0, rawDiff);

  if (diff < LATEST_STATUS_FRESH_THRESHOLD) {
    return "fresh";
  }

  if (diff < LATEST_STATUS_WARNING_THRESHOLD) {
    return "recent";
  }

  if (diff < LATEST_STATUS_ALERT_THRESHOLD) {
    return "warning";
  }

  return "alert";
}

function getLatestStatusBadgeByTimestamp(timestamp, tone) {
  const durationText = formatElapsedDurationText(timestamp, {
    compact: true,
  });

  switch (tone) {
    case "fresh":
      return {
        text: durationText || "刚刚",
        className: "latest-status-badge-fresh",
      };
    case "recent":
      return {
        text: durationText,
        className: "latest-status-badge-recent",
      };
    case "warning":
      return {
        text: durationText,
        className: "latest-status-badge-warning",
      };
    case "alert":
      return {
        text: durationText,
        className: "latest-status-badge-alert",
      };
    case "future":
      return {
        text: "时间异常",
        className: "latest-status-badge-future",
      };
    default:
      return {
        text: "",
        className: "",
      };
  }
}

function buildLatestStatusCard(label, record, detailText, emptyText, cardClass) {
  if (!record) {
    return {
      label,
      timeText: "暂无记录",
      detailText: "",
      relativeText: emptyText,
      cardClass,
      toneClass: "latest-status-tone-empty",
      badgeText: "",
      badgeClass: "",
    };
  }

  const tone = getLatestStatusTone(record);
  const badge = getLatestStatusBadgeByTimestamp(getRecordTimestampValue(record), tone);

  return {
    label,
    timeText: formatLatestRecordTime(record),
    detailText,
    relativeText: formatRelativeDuration(record),
    cardClass,
    toneClass: `latest-status-tone-${tone}`,
    badgeText: badge.text,
    badgeClass: badge.className,
  };
}

function buildLatestStatusCards(records) {
  const feedingRecord = records.find((record) => record.type === "feeding");
  const diaperRecord = records.find((record) => record.type === "diaper");

  return [
    buildLatestStatusCard(
      "最后喝奶",
      feedingRecord,
      feedingRecord ? `${feedingRecord.method} · ${formatMetric(feedingRecord.amount, " ml")}` : "",
      "还没有喝奶记录",
      "latest-status-feeding"
    ),
    buildLatestStatusCard(
      "最后换尿布",
      diaperRecord,
      buildDiaperDetailText(diaperRecord),
      "还没有尿布记录",
      "latest-status-diaper"
    ),
  ];
}

function sanitizeInteger(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function sanitizeDecimal(value) {
  const cleaned = String(value || "").replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");

  if (parts.length <= 1) {
    return cleaned;
  }

  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function formatMetric(value, unit) {
  return value ? `${value}${unit}` : "--";
}

function buildHeroStats(ageInfo, members, summary) {
  return [
    { label: "宝宝年龄", value: ageInfo.shortText },
    { label: "今日喝奶", value: `${summary.feedingCount} 次` },
    { label: "今日奶量", value: `${summary.totalAmount} ml` },
    { label: "今日尿布", value: `${summary.diaperCount} 次` },
    { label: "今日睡眠", value: `${summary.sleepMinutes} 分钟` },
    { label: "共同管理", value: `${members.length} 人` },
  ];
}

function buildFilterStats(summary) {
  return [
    { label: "喝奶", value: `${summary.feedingCount} 次` },
    { label: "尿布", value: `${summary.diaperCount} 次` },
    { label: "睡眠", value: `${summary.sleepMinutes} 分钟` },
    { label: "喂药", value: `${summary.medicineCount} 次` },
    { label: "体温", value: `${summary.temperatureCount} 次` },
    { label: "成长", value: `${summary.growthCount} 次` },
  ];
}

function getSummary(records, targetDate) {
  const summary = createSummary();

  records.forEach((record) => {
    if (targetDate && record.date !== targetDate) {
      return;
    }

    switch (record.type) {
      case "feeding":
        summary.feedingCount += 1;
        summary.totalAmount += Number(record.amount || 0);
        break;
      case "diaper":
        summary.diaperCount += 1;
        break;
      case "sleep":
        summary.sleepMinutes += Number(record.durationMinutes || 0);
        break;
      case "medicine":
        summary.medicineCount += 1;
        break;
      case "temperature":
        summary.temperatureCount += 1;
        if (!summary.latestTemperature) {
          summary.latestTemperature = record.temperature || "";
        }
        break;
      case "growth":
        summary.growthCount += 1;
        break;
      default:
        break;
    }
  });

  return summary;
}

function sortRecords(records) {
  return records.slice().sort((left, right) => {
    if (left.recordAt === right.recordAt) {
      return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
    }

    return Number(right.recordAt || 0) - Number(left.recordAt || 0);
  });
}

function filterRecords(records, filterDate, filterType) {
  return records.filter((record) => {
    if (filterDate && record.date !== filterDate) {
      return false;
    }

    if (filterType && filterType !== "all" && record.type !== filterType) {
      return false;
    }

    return true;
  });
}

function getRecordTypeMeta(type) {
  return RECORD_TYPES.find((item) => item.id === type) || RECORD_TYPES[0];
}

function getRecordFilterMeta(type) {
  return RECORD_FILTER_OPTIONS.find((item) => item.id === type) || RECORD_FILTER_OPTIONS[0];
}

function buildActiveFilterParts(filterDate, filterType) {
  const parts = [];

  if (filterDate) {
    parts.push(filterDate);
  }

  if (filterType && filterType !== "all") {
    parts.push(`分类：${getRecordFilterMeta(filterType).label}`);
  }

  return parts;
}

function buildFormFromRecord(record) {
  return {
    type: record.type,
    date: record.date,
    time: record.time,
    note: record.note || "",
    method: record.method || getPreferredFeedingMethod(),
    amount: record.amount !== undefined && record.amount !== null ? String(record.amount) : "",
    diaperType: record.diaperType || DIAPER_TYPES[0],
    poopColorId: record.poopColorId || POOP_COLORS[0].id,
    sleepType: record.sleepType || SLEEP_TYPES[0],
    durationMinutes:
      record.durationMinutes !== undefined && record.durationMinutes !== null
        ? String(record.durationMinutes)
        : "",
    medicineName: record.medicineName || "",
    dosage: record.dosage !== undefined && record.dosage !== null ? String(record.dosage) : "",
    doseUnit: record.doseUnit || MEDICINE_UNITS[0],
    temperature:
      record.temperature !== undefined && record.temperature !== null
        ? String(record.temperature)
        : "",
    temperatureMethod: record.temperatureMethod || TEMPERATURE_METHODS[0],
    height: record.height !== undefined && record.height !== null ? String(record.height) : "",
    weight: record.weight !== undefined && record.weight !== null ? String(record.weight) : "",
    headCircumference:
      record.headCircumference !== undefined && record.headCircumference !== null
        ? String(record.headCircumference)
        : "",
  };
}

function buildRecordView(record) {
  const baseRecord = {
    ...record,
    displayTime: formatLatestRecordTime(record),
  };

  switch (record.type) {
    case "feeding":
      return {
        ...baseRecord,
        typeLabel: "喝奶",
        badgeClass: "record-badge-feeding",
        title: `${record.method} · ${formatMetric(record.amount, " ml")}`,
        subtitle: "喂养记录",
      };
    case "diaper": {
      const poopColor = POOP_COLOR_MAP[record.poopColorId];
      const details = [`尿布情况：${record.diaperType}`];
      if (poopColor && (record.diaperType === "便便" || record.diaperType === "混合")) {
        details.push(`便便颜色：${poopColor.label}`);
      }

      return {
        ...baseRecord,
        typeLabel: "尿布",
        badgeClass: "record-badge-diaper",
        title: details.join(" · "),
        subtitle: "排泄记录",
      };
    }
    case "sleep":
      return {
        ...baseRecord,
        typeLabel: "睡眠",
        badgeClass: "record-badge-sleep",
        title: `${record.sleepType} · ${formatMetric(record.durationMinutes, " 分钟")}`,
        subtitle: "睡眠记录",
      };
    case "medicine":
      return {
        ...baseRecord,
        typeLabel: "喂药",
        badgeClass: "record-badge-medicine",
        title: `${record.medicineName} · ${formatMetric(record.dosage, record.doseUnit || "")}`,
        subtitle: "用药记录",
      };
    case "temperature":
      return {
        ...baseRecord,
        typeLabel: "体温",
        badgeClass: "record-badge-temperature",
        title: `${formatMetric(record.temperature, "℃")}`,
        subtitle: `测量方式：${record.temperatureMethod || "未填写"}`,
      };
    case "growth": {
      const parts = [];
      if (record.height) {
        parts.push(`身高 ${record.height}cm`);
      }
      if (record.weight) {
        parts.push(`体重 ${record.weight}kg`);
      }
      if (record.headCircumference) {
        parts.push(`头围 ${record.headCircumference}cm`);
      }

      return {
        ...baseRecord,
        typeLabel: "成长",
        badgeClass: "record-badge-growth",
        title: parts.join(" · ") || "成长记录",
        subtitle: "身高、体重、头围",
      };
    }
    default: {
      return {
        ...baseRecord,
        typeLabel: getRecordTypeMeta(record.type).label,
        badgeClass: "record-badge-default",
        title: getRecordTypeMeta(record.type).label,
        subtitle: "",
      };
    }
  }
}

function buildEditingSummary(record) {
  if (!record) {
    return "";
  }

  const typeMeta = getRecordTypeMeta(record.type);
  return `${typeMeta.label} · ${formatLatestRecordTime(record)}`;
}

Page({
  data: {
    recordTypes: RECORD_TYPES,
    recordFilterOptions: RECORD_FILTER_OPTIONS,
    feedingMethods: FEEDING_METHODS,
    amountOptions: FEEDING_AMOUNT_OPTIONS,
    diaperTypes: DIAPER_TYPES,
    sleepTypes: SLEEP_TYPES,
    medicineUnits: MEDICINE_UNITS,
    temperatureMethods: TEMPERATURE_METHODS,
    poopColors: POOP_COLORS,
    babyProfile: createDefaultProfile(),
    profileForm: {
      name: "我的宝宝",
      birthDate: "",
    },
    profileCollapsed: false,
    collaborationCollapsed: false,
    members: [],
    memberList: [],
    heroStats: [],
    latestStatusCards: createLatestStatusCards(),
    allRecords: [],
    records: [],
    todaySummary: createSummary(),
    filteredSummary: createSummary(),
    filterStats: [],
    todayDate: formatDate(new Date()),
    filterDate: "",
    filterType: "all",
    filterPickerValue: formatDate(new Date()),
    filterTip: "当前显示全部记录",
    filterModeText: "当前显示全部记录",
    hasActiveFilter: false,
    filterCollapsed: true,
    listNote: "0 条",
    emptyTitle: "还没有记录",
    emptyDesc: "先添加一条宝宝记录。",
    amountPickerIndex: getAmountPickerIndex(""),
    editingId: "",
    editingSummaryText: "",
    ageShortText: "未设置",
    ageDetailText: "设置出生日期后会自动计算天数、周数和周岁。",
    memberSummaryText: "1位成员",
    currentUserRole: "owner",
    canManageMembers: false,
    collaborationHintText: "开启云开发后可邀请家人共同记录。",
    collaborationSummaryText: "未开启云协作",
    storageMeta: createDefaultStorageMeta(),
    form: createDefaultForm(),
  },

  onLoad(options) {
    this.pendingInviteCode = normalizeInviteCode(options && options.inviteCode);
    this.resetForm();

    if (wx.showShareMenu) {
      wx.showShareMenu();
    }
  },

  onShow() {
    this.startLatestStatusTicker();
    this.syncDashboard();
  },

  onHide() {
    this.stopLatestStatusTicker();
  },

  onUnload() {
    this.stopLatestStatusTicker();
  },

  async syncDashboard() {
    if (this.isSyncingDashboard) {
      return;
    }

    this.isSyncingDashboard = true;

    try {
      if (this.pendingInviteCode) {
        const inviteCode = this.pendingInviteCode;
        this.pendingInviteCode = "";
        await this.handleSharedJoin(inviteCode);
        return;
      }

      await this.loadDashboard();
    } finally {
      this.isSyncingDashboard = false;
    }
  },

  resetForm() {
    this.setData({
      editingId: "",
      editingSummaryText: "",
      form: createDefaultForm(),
      amountPickerIndex: getAmountPickerIndex(""),
    });
  },

  startLatestStatusTicker() {
    this.stopLatestStatusTicker();
    this.latestStatusTimer = setInterval(() => {
      this.refreshLatestStatus(this.data.allRecords);
    }, 60000);
  },

  stopLatestStatusTicker() {
    if (this.latestStatusTimer) {
      clearInterval(this.latestStatusTimer);
      this.latestStatusTimer = null;
    }
  },

  setProfileCollapsed(collapsed, babyId) {
    const targetBabyId = babyId || this.data.babyProfile.id;
    saveProfileCollapseState(targetBabyId, collapsed);
    this.setData({
      profileCollapsed: collapsed,
    });
  },

  setCollaborationCollapsed(collapsed, babyId) {
    const targetBabyId = babyId || this.data.babyProfile.id;
    saveCollaborationCollapseState(targetBabyId, collapsed);
    this.setData({
      collaborationCollapsed: collapsed,
    });
  },

  setRecordFilterCollapsed(collapsed, babyId) {
    const targetBabyId = babyId || this.data.babyProfile.id;
    saveRecordFilterCollapseState(targetBabyId, collapsed);
    this.setData({
      filterCollapsed: collapsed,
    });
  },

  applyState(state) {
    const babyProfile = state.baby || createDefaultProfile();
    const members = state.members || [];
    const storageMeta = state.storageMeta || createDefaultStorageMeta();
    const currentUserRole = state.currentUserRole || "owner";
    const canManageMembers = Boolean(state.canManageMembers);
    const allRecords = sortRecords(state.records || []);
    const todaySummary = getSummary(allRecords, this.data.todayDate);
    const ageInfo = getAgeInfo(babyProfile.birthDate);
    const heroStats = buildHeroStats(ageInfo, members, todaySummary);
    const memberList = buildMemberList(members, canManageMembers);

    this.setData({
      babyProfile,
      profileForm: {
        name: babyProfile.name || "我的宝宝",
        birthDate: babyProfile.birthDate || "",
      },
      profileCollapsed: isProfileCollapsed(babyProfile.id),
      collaborationCollapsed: isCollaborationCollapsed(babyProfile.id),
      filterCollapsed: isRecordFilterCollapsed(babyProfile.id),
      members,
      memberList,
      todaySummary,
      heroStats,
      ageShortText: ageInfo.shortText,
      ageDetailText: ageInfo.detailText,
      memberSummaryText: buildMemberSummary(members),
      currentUserRole,
      canManageMembers,
      collaborationHintText: buildCollaborationHint(storageMeta, canManageMembers),
      collaborationSummaryText: buildCollaborationSummaryText(storageMeta, members, canManageMembers),
      storageMeta,
    });

    this.refreshView(allRecords);
    this.refreshLatestStatus(allRecords);
  },

  async loadDashboard() {
    wx.showNavigationBarLoading();

    try {
      const state = await babyService.bootstrap();
      this.applyState(state);
    } catch (error) {
      wx.showToast({
        title: error.message || "数据加载失败",
        icon: "none",
      });
    } finally {
      wx.hideNavigationBarLoading();
    }
  },

  onShareAppMessage() {
    const inviteCode = normalizeInviteCode(this.data.babyProfile.inviteCode);
    const canShareInvite = this.data.storageMeta.collaborationEnabled && inviteCode;

    return {
      title: canShareInvite
        ? `邀请你一起管理${this.data.babyProfile.name || "宝宝记录"}`
        : `${this.data.babyProfile.name || "宝宝"}护理记录`,
      path: canShareInvite ? `/pages/manage/manage?inviteCode=${inviteCode}` : "/pages/index/index",
    };
  },

  async handleSharedJoin(inviteCode) {
    wx.showNavigationBarLoading();
    wx.showLoading({
      title: "加入中",
      mask: true,
    });

    try {
      const state = await babyService.joinBaby(inviteCode);
      this.setData({
        filterDate: "",
        filterType: "all",
      });
      this.resetForm();
      this.applyState(state);
      wx.showToast({
        title: "已加入协作",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "加入失败",
        icon: "none",
      });

      try {
        const state = await babyService.bootstrap();
        this.applyState(state);
      } catch (bootstrapError) {
        wx.showToast({
          title: bootstrapError.message || "数据加载失败",
          icon: "none",
        });
      }
    } finally {
      wx.hideLoading();
      wx.hideNavigationBarLoading();
    }
  },

  refreshView(allRecords) {
    const records = sortRecords(allRecords);
    const filteredRecords = filterRecords(records, this.data.filterDate, this.data.filterType);
    const filteredSummary = getSummary(filteredRecords);
    const activeFilterParts = buildActiveFilterParts(this.data.filterDate, this.data.filterType);
    const hasActiveFilter = activeFilterParts.length > 0;
    const filterSummaryText = hasActiveFilter
      ? `当前筛选：${activeFilterParts.join(" · ")}`
      : "当前显示全部记录";

    this.setData({
      allRecords: records,
      records: filteredRecords.map(buildRecordView),
      filteredSummary,
      filterStats: buildFilterStats(filteredSummary),
      filterPickerValue: this.data.filterDate || this.data.todayDate,
      filterTip: filterSummaryText,
      filterModeText: hasActiveFilter ? `已筛选 ${activeFilterParts.join(" · ")}` : "当前显示全部记录",
      hasActiveFilter,
      listNote: hasActiveFilter ? `${filteredRecords.length} 条结果` : `${filteredRecords.length} 条`,
      emptyTitle: hasActiveFilter ? "当前筛选下暂无记录" : "还没有记录",
      emptyDesc: hasActiveFilter
        ? "换个日期或分类试试，或先添加一条新记录。"
        : "先添加一条宝宝记录。",
    });
  },

  refreshLatestStatus(allRecords) {
    this.setData({
      latestStatusCards: buildLatestStatusCards(allRecords || []),
    });
  },

  handleProfileNameInput(event) {
    this.setData({
      "profileForm.name": event.detail.value,
    });
  },

  handleBirthDateChange(event) {
    this.setData({
      "profileForm.birthDate": event.detail.value,
    });
  },

  handleExpandProfile() {
    this.setProfileCollapsed(false);
  },

  handleCollapseProfile() {
    this.setProfileCollapsed(true);
  },

  handleExpandCollaboration() {
    this.setCollaborationCollapsed(false);
  },

  handleCollapseCollaboration() {
    this.setCollaborationCollapsed(true);
  },

  handleToggleRecordFilter() {
    this.setRecordFilterCollapsed(!this.data.filterCollapsed);
  },

  async handleSaveProfile() {
    const profileForm = this.data.profileForm;

    if (profileForm.birthDate && profileForm.birthDate > this.data.todayDate) {
      wx.showToast({
        title: "出生日期不能晚于今天",
        icon: "none",
      });
      return;
    }

    wx.showLoading({
      title: "保存中",
      mask: true,
    });

    try {
      const state = await babyService.saveProfile({
        name: profileForm.name.trim() || "我的宝宝",
        birthDate: profileForm.birthDate,
      });
      this.applyState(state);
      this.setProfileCollapsed(true, state.baby && state.baby.id);
      wx.showToast({
        title: "资料已保存",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "保存失败",
        icon: "none",
      });
    } finally {
      wx.hideLoading();
    }
  },

  handleTypeChange(event) {
    const { type } = event.currentTarget.dataset;
    const nextForm = {
      ...this.data.form,
      type,
    };

    if (type === "feeding" && !nextForm.method) {
      nextForm.method = getPreferredFeedingMethod();
    }

    if (type === "diaper" && !nextForm.diaperType) {
      nextForm.diaperType = DIAPER_TYPES[0];
      nextForm.poopColorId = POOP_COLORS[0].id;
    }

    if (type === "sleep" && !nextForm.sleepType) {
      nextForm.sleepType = SLEEP_TYPES[0];
    }

    if (type === "medicine" && !nextForm.doseUnit) {
      nextForm.doseUnit = MEDICINE_UNITS[0];
    }

    if (type === "temperature" && !nextForm.temperatureMethod) {
      nextForm.temperatureMethod = TEMPERATURE_METHODS[0];
    }

    this.setData({
      form: nextForm,
    });
  },

  handleDateChange(event) {
    this.setData({
      "form.date": event.detail.value,
    });
  },

  handleTimeChange(event) {
    this.setData({
      "form.time": event.detail.value,
    });
  },

  handleNoteInput(event) {
    this.setData({
      "form.note": event.detail.value,
    });
  },

  handleFeedingMethodChange(event) {
    const { method } = event.currentTarget.dataset;
    savePreferredFeedingMethod(method);
    this.setData({
      "form.method": method,
    });
  },

  handleAmountInput(event) {
    const amount = sanitizeInteger(event.detail.value);
    this.setData({
      "form.amount": amount,
      amountPickerIndex: getAmountPickerIndex(amount),
    });
  },

  handleAmountOptionChange(event) {
    const amountPickerIndex = Number(event.detail.value || 0);
    const selectedOption = FEEDING_AMOUNT_OPTIONS[amountPickerIndex] || FEEDING_AMOUNT_OPTIONS[0];

    this.setData({
      "form.amount": selectedOption.value,
      amountPickerIndex,
    });
  },

  handleDiaperTypeChange(event) {
    const { diaperType } = event.currentTarget.dataset;
    const nextForm = {
      ...this.data.form,
      diaperType,
    };

    if ((diaperType === "便便" || diaperType === "混合") && !nextForm.poopColorId) {
      nextForm.poopColorId = POOP_COLORS[0].id;
    }

    this.setData({
      form: nextForm,
    });
  },

  handlePoopColorChange(event) {
    const { colorId } = event.currentTarget.dataset;
    this.setData({
      "form.poopColorId": colorId,
    });
  },

  handleSleepTypeChange(event) {
    const { sleepType } = event.currentTarget.dataset;
    this.setData({
      "form.sleepType": sleepType,
    });
  },

  handleDurationInput(event) {
    this.setData({
      "form.durationMinutes": sanitizeInteger(event.detail.value),
    });
  },

  handleMedicineNameInput(event) {
    this.setData({
      "form.medicineName": event.detail.value,
    });
  },

  handleDosageInput(event) {
    this.setData({
      "form.dosage": sanitizeDecimal(event.detail.value),
    });
  },

  handleDoseUnitChange(event) {
    const { doseUnit } = event.currentTarget.dataset;
    this.setData({
      "form.doseUnit": doseUnit,
    });
  },

  handleTemperatureInput(event) {
    this.setData({
      "form.temperature": sanitizeDecimal(event.detail.value),
    });
  },

  handleTemperatureMethodChange(event) {
    const { method } = event.currentTarget.dataset;
    this.setData({
      "form.temperatureMethod": method,
    });
  },

  handleHeightInput(event) {
    this.setData({
      "form.height": sanitizeDecimal(event.detail.value),
    });
  },

  handleWeightInput(event) {
    this.setData({
      "form.weight": sanitizeDecimal(event.detail.value),
    });
  },

  handleHeadCircumferenceInput(event) {
    this.setData({
      "form.headCircumference": sanitizeDecimal(event.detail.value),
    });
  },

  handleFilterDateChange(event) {
    this.setData(
      {
        filterDate: event.detail.value,
      },
      () => {
        this.refreshView(this.data.allRecords);
      }
    );
  },

  handleFilterTypeChange(event) {
    const { type } = event.currentTarget.dataset;

    this.setData(
      {
        filterType: type,
      },
      () => {
        this.refreshView(this.data.allRecords);
      }
    );
  },

  handleResetFilter() {
    this.setData(
      {
        filterDate: "",
        filterType: "all",
      },
      () => {
        this.refreshView(this.data.allRecords);
      }
    );
  },

  handleEdit(event) {
    const { id } = event.currentTarget.dataset;
    const record = this.data.allRecords.find((item) => item.id === id);

    if (!record) {
      wx.showToast({
        title: "记录不存在",
        icon: "none",
      });
      return;
    }

    this.setData({
      editingId: id,
      editingSummaryText: buildEditingSummary(record),
      form: buildFormFromRecord(record),
      amountPickerIndex: getAmountPickerIndex(record.amount),
    });
  },

  handleCancelEdit() {
    this.resetForm();
  },

  handlePopupClose() {
    if (this.data.editingId) {
      this.handleCancelEdit();
    }
  },

  handlePopupTap() {},

  validateForm(form) {
    switch (form.type) {
      case "feeding":
        if (!form.amount) {
          return "请填写奶量";
        }
        return "";
      case "diaper":
        if ((form.diaperType === "便便" || form.diaperType === "混合") && !form.poopColorId) {
          return "请选择便便颜色";
        }
        return "";
      case "sleep":
        if (!form.durationMinutes) {
          return "请填写睡眠时长";
        }
        return "";
      case "medicine":
        if (!form.medicineName.trim()) {
          return "请填写药名";
        }
        if (!form.dosage) {
          return "请填写剂量";
        }
        return "";
      case "temperature":
        if (!form.temperature) {
          return "请填写体温";
        }
        return "";
      case "growth":
        if (!form.height && !form.weight && !form.headCircumference) {
          return "请至少填写一个成长指标";
        }
        return "";
      default:
        return "";
    }
  },

  buildRecordPayload() {
    const form = this.data.form;
    const record = {
      id: this.data.editingId || "",
      type: form.type,
      date: form.date,
      time: form.time,
      note: form.note.trim(),
    };

    if (form.type === "feeding") {
      record.method = form.method;
      record.amount = form.amount;
      savePreferredFeedingMethod(form.method);
    }

    if (form.type === "diaper") {
      record.diaperType = form.diaperType;
      record.poopColorId =
        form.diaperType === "便便" || form.diaperType === "混合" ? form.poopColorId : "";
    }

    if (form.type === "sleep") {
      record.sleepType = form.sleepType;
      record.durationMinutes = form.durationMinutes;
    }

    if (form.type === "medicine") {
      record.medicineName = form.medicineName.trim();
      record.dosage = form.dosage;
      record.doseUnit = form.doseUnit;
    }

    if (form.type === "temperature") {
      record.temperature = form.temperature;
      record.temperatureMethod = form.temperatureMethod;
    }

    if (form.type === "growth") {
      record.height = form.height;
      record.weight = form.weight;
      record.headCircumference = form.headCircumference;
    }

    const currentRecord = this.data.allRecords.find((item) => item.id === this.data.editingId);
    if (currentRecord && currentRecord.createdAt) {
      record.createdAt = currentRecord.createdAt;
    }

    return record;
  },

  async handleSubmit() {
    const errorMessage = this.validateForm(this.data.form);
    const isEditing = Boolean(this.data.editingId);

    if (errorMessage) {
      wx.showToast({
        title: errorMessage,
        icon: "none",
      });
      return;
    }

    wx.showLoading({
      title: this.data.editingId ? "更新中" : "保存中",
      mask: true,
    });

    try {
      const state = await babyService.saveRecord(this.buildRecordPayload());
      this.resetForm();
      this.applyState(state);
      wx.showToast({
        title: isEditing ? "已更新" : "已保存",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "保存失败",
        icon: "none",
      });
    } finally {
      wx.hideLoading();
    }
  },

  async handleDelete(event) {
    const { id } = event.currentTarget.dataset;

    wx.showLoading({
      title: "删除中",
      mask: true,
    });

    try {
      const state = await babyService.deleteRecord(id);
      if (id === this.data.editingId) {
        this.resetForm();
      }
      this.applyState(state);
      wx.showToast({
        title: "已删除",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "删除失败",
        icon: "none",
      });
    } finally {
      wx.hideLoading();
    }
  },

  async handleClearAllRecords() {
    const recordCount = this.data.allRecords.length;

    if (!recordCount) {
      wx.showToast({
        title: "暂无可清空记录",
        icon: "none",
      });
      return;
    }

    const firstConfirmed = await confirmAction({
      title: "清空全部记录",
      content: "将清空当前宝宝的全部记录，是否继续？",
      confirmText: "继续",
    });

    if (!firstConfirmed) {
      return;
    }

    const secondConfirmed = await confirmAction({
      title: "再次确认",
      content: "清空后无法恢复，请再次确认。",
      confirmText: "继续清空",
    });

    if (!secondConfirmed) {
      return;
    }

    const finalConfirmed = await confirmAction({
      title: "最终确认",
      content: `当前共有 ${recordCount} 条记录，确认立即删除？`,
      confirmText: "确认删除",
    });

    if (!finalConfirmed) {
      return;
    }

    wx.showLoading({
      title: "清空中",
      mask: true,
    });

    try {
      const state = await babyService.clearAllRecords();
      this.setData(
        {
          filterDate: "",
          filterType: "all",
        },
        () => {
          if (this.data.editingId) {
            this.resetForm();
          }
          this.applyState(state);
        }
      );
      wx.showToast({
        title: "已清空",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "清空失败",
        icon: "none",
      });
    } finally {
      wx.hideLoading();
    }
  },

  async handleRemoveMember(event) {
    const { memberId, memberName } = event.currentTarget.dataset;
    const confirmed = await confirmAction({
      title: "移除成员",
      content: `确认移除${memberName}？移除后对方将不能继续管理当前宝宝。`,
      confirmText: "确认移除",
    });

    if (!confirmed) {
      return;
    }

    wx.showLoading({
      title: "移除中",
      mask: true,
    });

    try {
      const state = await babyService.removeMember(memberId);
      this.applyState(state);
      wx.showToast({
        title: "已移除",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "移除失败",
        icon: "none",
      });
    } finally {
      wx.hideLoading();
    }
  },
});
