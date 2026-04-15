const babyService = require("../../utils/baby-service");

const GROWTH_ENTRY_COLLAPSE_STORAGE_KEY = "baby-care-growth-entry-collapse-state";

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

function getAgeInfo(birthDate) {
  if (!birthDate) {
    return {
      shortText: "未设置",
      detailText: "设置出生日期后会自动计算月龄和周岁。",
      heroText: "设置出生日期后会自动计算总天数和月龄。",
    };
  }

  const birth = new Date(`${birthDate}T00:00:00`);
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (Number.isNaN(birth.getTime()) || birth > current) {
    return {
      shortText: "日期无效",
      detailText: "出生日期不能晚于今天。",
      heroText: "出生日期不能晚于今天。",
    };
  }

  const diffDays = Math.floor((current.getTime() - birth.getTime()) / 86400000);
  let years = current.getFullYear() - birth.getFullYear();
  let months = current.getMonth() - birth.getMonth();
  let days = current.getDate() - birth.getDate();

  if (days < 0) {
    months -= 1;
    days += new Date(current.getFullYear(), current.getMonth(), 0).getDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalMonths = years * 12 + months;
  const monthAgeText = `${Math.max(totalMonths, 0)}月${Math.max(days, 0)}天`;

  return {
    shortText: years > 0 ? `${years}岁${months}个月` : monthAgeText,
    detailText: years > 0 ? `${years}岁${months}个月${days}天` : monthAgeText,
    heroText: `${Math.max(diffDays, 0)}天 · ${monthAgeText}`,
  };
}

function sanitizeDecimal(value) {
  const cleaned = String(value || "").replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");

  if (parts.length <= 1) {
    return cleaned;
  }

  return `${parts[0]}.${parts.slice(1).join("")}`;
}

function createDefaultGrowthForm() {
  return {
    date: formatDate(new Date()),
    height: "",
    weight: "",
    headCircumference: "",
  };
}

function readGrowthEntryCollapseState() {
  const state = wx.getStorageSync(GROWTH_ENTRY_COLLAPSE_STORAGE_KEY);
  return state && typeof state === "object" ? state : {};
}

function isGrowthEntryCollapsed(babyId) {
  if (!babyId) {
    return true;
  }

  const state = readGrowthEntryCollapseState();
  if (Object.prototype.hasOwnProperty.call(state, babyId)) {
    return Boolean(state[babyId]);
  }

  return true;
}

function saveGrowthEntryCollapseState(babyId, collapsed) {
  if (!babyId) {
    return;
  }

  const state = readGrowthEntryCollapseState();
  if (collapsed) {
    state[babyId] = true;
  } else {
    delete state[babyId];
  }

  wx.setStorageSync(GROWTH_ENTRY_COLLAPSE_STORAGE_KEY, state);
}

function getGrowthRecords(records) {
  return (records || [])
    .filter((record) => record.type === "growth")
    .slice()
    .sort((left, right) => Number(left.recordAt || 0) - Number(right.recordAt || 0));
}

function formatGrowthMetric(value, unit) {
  return value ? `${value}${unit}` : "--";
}

function isBreastfeedingMethod(method) {
  return String(method || "").trim() === "母乳";
}

function buildGrowthLatest(growthRecords) {
  const latestRecord = growthRecords[growthRecords.length - 1];

  if (!latestRecord) {
    return {
      dateText: "暂无记录",
      heightText: "--",
      weightText: "--",
      headText: "--",
    };
  }

  return {
    dateText: latestRecord.date || "暂无日期",
    heightText: formatGrowthMetric(latestRecord.height, " cm"),
    weightText: formatGrowthMetric(latestRecord.weight, " kg"),
    headText: formatGrowthMetric(latestRecord.headCircumference, " cm"),
  };
}

function buildGrowthPoints(growthRecords, key, unit) {
  const metricRecords = growthRecords.filter(
    (record) => record[key] !== undefined && record[key] !== null && record[key] !== ""
  );

  if (!metricRecords.length) {
    return [];
  }

  if (metricRecords.length === 1) {
    const onlyRecord = metricRecords[0];
    return [
      {
        x: "50%",
        y: "50%",
        valueText: `${onlyRecord[key]}${unit}`,
        dateText: onlyRecord.date,
      },
    ];
  }

  const values = metricRecords.map((record) => Number(record[key]));
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const lastIndex = metricRecords.length - 1;

  return metricRecords.map((record, index) => {
    const x = `${(index / lastIndex) * 100}%`;
    const normalized = (Number(record[key]) - minValue) / range;
    const y = `${100 - normalized * 100}%`;

    return {
      x,
      y,
      valueText: `${record[key]}${unit}`,
      dateText: record.date,
    };
  });
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

function getSummary(records, targetDate) {
  const summary = createSummary();

  records.forEach((record) => {
    if (targetDate && record.date !== targetDate) {
      return;
    }

    switch (record.type) {
      case "feeding":
        summary.feedingCount += 1;
        if (!isBreastfeedingMethod(record.method)) {
          summary.totalAmount += Number(record.amount || 0);
        }
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

function buildRecentFeedingChart(records) {
  const today = new Date();
  const days = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const targetDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const dateKey = formatDate(targetDate);
    const daySummary = getSummary(records, dateKey);

    days.push({
      date: dateKey,
      dayLabel: offset === 0 ? "今天" : `${targetDate.getMonth() + 1}/${targetDate.getDate()}`,
      amount: daySummary.totalAmount,
    });
  }

  const maxAmount = days.reduce((result, item) => Math.max(result, item.amount), 0);
  const totalAmount = days.reduce((result, item) => result + item.amount, 0);

  return {
    totalAmount,
    days: days.map((item) => ({
      ...item,
      barHeight: `${maxAmount ? Math.max((item.amount / maxAmount) * 100, item.amount ? 12 : 4) : 4}%`,
      isToday: item.dayLabel === "今天",
    })),
  };
}

function buildGrowthStats(growthLatest, growthCount) {
  return [
    { label: "记录数", value: `${growthCount} 条` },
    { label: "身高", value: growthLatest.heightText },
    { label: "体重", value: growthLatest.weightText },
    { label: "头围", value: growthLatest.headText },
  ];
}

Page({
  data: {
    babyProfile: {
      id: "",
      name: "我的宝宝",
      birthDate: "",
      inviteCode: "",
    },
    ageShortText: "未设置",
    ageDetailText: "设置出生日期后会自动计算月龄和周岁。",
    ageHeroText: "设置出生日期后会自动计算总天数和月龄。",
    growthForm: createDefaultGrowthForm(),
    growthLatest: buildGrowthLatest([]),
    growthRecords: [],
    growthHeightPoints: [],
    growthWeightPoints: [],
    growthHeadPoints: [],
    growthStats: buildGrowthStats(buildGrowthLatest([]), 0),
    feedingChart: buildRecentFeedingChart([]),
    growthEntryCollapsed: true,
  },

  onShow() {
    this.loadGrowthPage();
  },

  async loadGrowthPage() {
    wx.showNavigationBarLoading();

    try {
      const state = await babyService.bootstrap();
      const babyProfile = state.baby || this.data.babyProfile;
      const allRecords = state.records || [];
      const growthRecords = getGrowthRecords(allRecords);
      const growthLatest = buildGrowthLatest(growthRecords);
      const ageInfo = getAgeInfo(babyProfile.birthDate);

      this.setData({
        babyProfile,
        ageShortText: ageInfo.shortText,
        ageDetailText: ageInfo.detailText,
        ageHeroText: ageInfo.heroText,
        growthForm: createDefaultGrowthForm(),
        growthLatest,
        growthRecords: growthRecords.slice().reverse(),
        growthHeightPoints: buildGrowthPoints(growthRecords, "height", "cm"),
        growthWeightPoints: buildGrowthPoints(growthRecords, "weight", "kg"),
        growthHeadPoints: buildGrowthPoints(growthRecords, "headCircumference", "cm"),
        growthStats: buildGrowthStats(growthLatest, growthRecords.length),
        feedingChart: buildRecentFeedingChart(allRecords),
        growthEntryCollapsed: isGrowthEntryCollapsed(babyProfile.id),
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "数据加载失败",
        icon: "none",
      });
    } finally {
      wx.hideNavigationBarLoading();
    }
  },

  handleGrowthDateChange(event) {
    this.setData({
      "growthForm.date": event.detail.value,
    });
  },

  handleGrowthHeightInput(event) {
    this.setData({
      "growthForm.height": sanitizeDecimal(event.detail.value),
    });
  },

  handleGrowthWeightInput(event) {
    this.setData({
      "growthForm.weight": sanitizeDecimal(event.detail.value),
    });
  },

  handleGrowthHeadInput(event) {
    this.setData({
      "growthForm.headCircumference": sanitizeDecimal(event.detail.value),
    });
  },

  handleExpandGrowthEntry() {
    const babyId = this.data.babyProfile.id;
    saveGrowthEntryCollapseState(babyId, false);
    this.setData({
      growthEntryCollapsed: false,
    });
  },

  handleCollapseGrowthEntry() {
    const babyId = this.data.babyProfile.id;
    saveGrowthEntryCollapseState(babyId, true);
    this.setData({
      growthEntryCollapsed: true,
    });
  },

  async handleSaveGrowth() {
    const growthForm = this.data.growthForm;

    if (!growthForm.height && !growthForm.weight && !growthForm.headCircumference) {
      wx.showToast({
        title: "请至少填写一个成长指标",
        icon: "none",
      });
      return;
    }

    wx.showLoading({
      title: "保存中",
      mask: true,
    });

    try {
      await babyService.saveRecord({
        type: "growth",
        date: growthForm.date,
        time: "12:00",
        note: "",
        height: growthForm.height,
        weight: growthForm.weight,
        headCircumference: growthForm.headCircumference,
      });
      await this.loadGrowthPage();
      saveGrowthEntryCollapseState(this.data.babyProfile.id, true);
      this.setData({
        growthEntryCollapsed: true,
      });
      wx.showToast({
        title: "成长记录已保存",
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
});
