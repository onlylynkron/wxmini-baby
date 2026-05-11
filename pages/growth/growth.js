const babyService = require("../../utils/baby-service");

const GROWTH_ENTRY_COLLAPSE_STORAGE_KEY = "baby-care-growth-entry-collapse-state";

function pad(value) {
  return String(value).padStart(2, "0");
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

function isValidDecimal(value) {
  const text = String(value || "").trim();
  return !text || (/^\d+(\.\d+)?$/.test(text) && Number.isFinite(Number(text)));
}

function getGrowthFormError(growthForm) {
  if (!growthForm.height && !growthForm.weight && !growthForm.headCircumference) {
    return "请至少填写一个成长指标";
  }

  if (!isValidDecimal(growthForm.height)) {
    return "身高格式不正确";
  }

  if (!isValidDecimal(growthForm.weight)) {
    return "体重格式不正确";
  }

  if (!isValidDecimal(growthForm.headCircumference)) {
    return "头围格式不正确";
  }

  return "";
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
        labelX: "50%",
        labelY: "50%",
        labelPosition: "top",
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
    const xValue = 8 + (index / lastIndex) * 84;
    const normalized = (Number(record[key]) - minValue) / range;
    const yValue = 12 + (1 - normalized) * 76;
    let labelPosition = "top";

    if (normalized > 0.82) {
      labelPosition = "bottom";
    } else if (index === 0) {
      labelPosition = "right";
    } else if (index === lastIndex) {
      labelPosition = "left";
    }

    return {
      x: `${xValue}%`,
      y: `${yValue}%`,
      labelX: `${xValue}%`,
      labelY: `${yValue}%`,
      xValue,
      yValue,
      labelPosition,
      valueText: `${record[key]}${unit}`,
      dateText: record.date,
    };
  });
}

function buildGrowthChart(growthRecords, key, unit) {
  const points = buildGrowthPoints(growthRecords, key, unit);

  return {
    points,
    hasLine: points.length > 1,
  };
}

function easeOutCubic(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

function hexToRgba(hexColor, alpha) {
  const normalized = String(hexColor || "").replace("#", "");
  if (normalized.length !== 6) {
    return `rgba(0, 0, 0, ${alpha})`;
  }

  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
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
    { label: "记录", value: `${growthCount} 条` },
    { label: "身高", value: growthLatest.heightText },
    { label: "体重", value: growthLatest.weightText },
    { label: "头围", value: growthLatest.headText },
  ];
}

function buildGrowthHistoryRecords(growthRecords) {
  return growthRecords
    .slice()
    .reverse()
    .map((record) => {
      const metrics = [];

      if (record.height) {
        metrics.push(`身高 ${record.height}cm`);
      }

      if (record.weight) {
        metrics.push(`体重 ${record.weight}kg`);
      }

      if (record.headCircumference) {
        metrics.push(`头围 ${record.headCircumference}cm`);
      }

      return {
        ...record,
        metricsText: metrics.join(" · ") || "成长记录",
      };
    });
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
    growthHistoryRecords: [],
    growthHeightChart: buildGrowthChart([], "height", "cm"),
    growthWeightChart: buildGrowthChart([], "weight", "kg"),
    growthHeadChart: buildGrowthChart([], "headCircumference", "cm"),
    growthStats: buildGrowthStats(buildGrowthLatest([]), 0),
    feedingChart: buildRecentFeedingChart([]),
    growthEntryCollapsed: true,
    growthEditingId: "",
    growthHistoryVisible: false,
    growthChartAnimated: false,
  },

  onShow() {
    if (wx.hideKeyboard) {
      wx.hideKeyboard();
    }
    this.loadGrowthPage();
  },

  onHide() {
    this.stopGrowthChartAnimations();
    if (wx.hideKeyboard) {
      wx.hideKeyboard();
    }
  },

  onUnload() {
    this.stopGrowthChartAnimations();
    if (wx.hideKeyboard) {
      wx.hideKeyboard();
    }
  },

  onShareAppMessage() {
    return {
      title: `${this.data.babyProfile.name || "宝宝"}成长曲线`,
      path: "/pages/growth/growth",
    };
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

      this.setData(
        {
          babyProfile,
          ageShortText: ageInfo.shortText,
          ageDetailText: ageInfo.detailText,
          ageHeroText: ageInfo.heroText,
          growthForm: this.data.growthEditingId
            ? this.data.growthForm
            : createDefaultGrowthForm(),
          growthLatest,
          growthRecords: growthRecords.slice().reverse(),
          growthHistoryRecords: buildGrowthHistoryRecords(growthRecords),
          growthHeightChart: buildGrowthChart(growthRecords, "height", "cm"),
          growthWeightChart: buildGrowthChart(growthRecords, "weight", "kg"),
          growthHeadChart: buildGrowthChart(growthRecords, "headCircumference", "cm"),
          growthStats: buildGrowthStats(growthLatest, growthRecords.length),
          feedingChart: buildRecentFeedingChart(allRecords),
          growthEntryCollapsed: isGrowthEntryCollapsed(babyProfile.id),
        },
        () => {
          this.drawGrowthCharts();
        }
      );
    } catch (error) {
      console.error("[growth] load failed", error);
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

  drawGrowthCharts() {
    this.stopGrowthChartAnimations();
    this.setData({
      growthChartAnimated: false,
    });
    this.drawGrowthChart("growthHeightCanvas", this.data.growthHeightChart, "#7a9cf0");
    this.drawGrowthChart("growthWeightCanvas", this.data.growthWeightChart, "#ef9b78");
    this.drawGrowthChart("growthHeadCanvas", this.data.growthHeadChart, "#8bc59e");

    this.growthChartActivateTimer = setTimeout(() => {
      this.setData({
        growthChartAnimated: true,
      });
    }, 120);
  },

  drawGrowthChart(canvasId, chart, color) {
    if (!chart || !chart.hasLine) {
      return;
    }

    wx.createSelectorQuery()
      .in(this)
      .select(`#${canvasId}`)
      .boundingClientRect((rect) => {
        if (!rect || !rect.width || !rect.height) {
          return;
        }

        const context = wx.createCanvasContext(canvasId, this);
        const width = rect.width;
        const height = rect.height;
        const points = chart.points.map((point) => ({
          x: (point.xValue / 100) * width,
          y: (point.yValue / 100) * height,
        }));
        const startTime = Date.now();
        const duration = 860;

        const drawCurve = (lineWidth, strokeStyle, shadowColor) => {
          if (points.length < 2) {
            return;
          }

          context.beginPath();
          context.moveTo(points[0].x, points[0].y);

          if (points.length === 2) {
            const start = points[0];
            const end = points[1];
            const direction = end.y >= start.y ? 1 : -1;
            const arcOffset = Math.max(18, Math.abs(end.x - start.x) * 0.12);
            const control = {
              x: (start.x + end.x) / 2,
              y: (start.y + end.y) / 2 - direction * arcOffset,
            };
            context.quadraticCurveTo(control.x, control.y, end.x, end.y);
          } else {
            for (let index = 1; index < points.length - 1; index += 1) {
              const current = points[index];
              const next = points[index + 1];
              const midpoint = {
                x: (current.x + next.x) / 2,
                y: (current.y + next.y) / 2,
              };
              context.quadraticCurveTo(current.x, current.y, midpoint.x, midpoint.y);
            }

            const penultimate = points[points.length - 2];
            const last = points[points.length - 1];
            context.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);
          }

          context.setStrokeStyle(strokeStyle);
          context.setLineWidth(lineWidth);
          context.setLineCap("round");
          context.setLineJoin("round");
          if (shadowColor) {
            context.setShadow(0, 10, 18, shadowColor);
          } else {
            context.setShadow(0, 0, 0, "rgba(0,0,0,0)");
          }
          context.stroke();
        };

        const renderLine = (progress) => {
          const easedProgress = easeOutCubic(progress);
          const clipWidth = Math.max(1, width * easedProgress);

          context.clearRect(0, 0, width, height);
          context.save();
          context.beginPath();
          context.rect(0, 0, clipWidth, height);
          context.clip();
          drawCurve(8.5, hexToRgba(color, 0.16), hexToRgba(color, 0.16));
          drawCurve(3.6, color, "");
          context.restore();
          context.draw();
        };

        const animate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          renderLine(progress);

          if (progress < 1) {
            this.growthChartTimers = this.growthChartTimers || [];
            this.growthChartTimers.push(setTimeout(animate, 16));
          }
        };

        animate();
      })
      .exec();
  },

  stopGrowthChartAnimations() {
    if (this.growthChartTimers && this.growthChartTimers.length) {
      this.growthChartTimers.forEach((timer) => clearTimeout(timer));
      this.growthChartTimers = [];
    }

    if (this.growthChartActivateTimer) {
      clearTimeout(this.growthChartActivateTimer);
      this.growthChartActivateTimer = null;
    }
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

  handleOpenGrowthHistory() {
    this.setData({
      growthHistoryVisible: true,
    });
  },

  handleCloseGrowthHistory() {
    this.setData({
      growthHistoryVisible: false,
    });
  },

  handleGrowthHistoryPanelTap() {},

  handleEditGrowth(event) {
    const { id } = event.currentTarget.dataset;
    const record = (this.data.growthRecords || []).find((item) => item.id === id);

    if (!record) {
      wx.showToast({
        title: "记录不存在",
        icon: "none",
      });
      return;
    }

    saveGrowthEntryCollapseState(this.data.babyProfile.id, false);
    this.setData({
      growthHistoryVisible: false,
      growthEntryCollapsed: false,
      growthEditingId: id,
      growthForm: {
        date: record.date || formatDate(new Date()),
        height: record.height !== undefined && record.height !== null ? String(record.height) : "",
        weight: record.weight !== undefined && record.weight !== null ? String(record.weight) : "",
        headCircumference:
          record.headCircumference !== undefined && record.headCircumference !== null
            ? String(record.headCircumference)
            : "",
      },
    });
  },

  handleCancelGrowthEdit() {
    this.setData({
      growthEditingId: "",
      growthForm: createDefaultGrowthForm(),
    });
    saveGrowthEntryCollapseState(this.data.babyProfile.id, true);
    this.setData({
      growthEntryCollapsed: true,
    });
  },

  async handleDeleteGrowth(event) {
    const { id } = event.currentTarget.dataset;
    const record = (this.data.growthRecords || []).find((item) => item.id === id);

    if (!record) {
      wx.showToast({
        title: "记录不存在",
        icon: "none",
      });
      return;
    }

    const confirmed = await confirmAction({
      title: "删除成长记录",
      content: `确认删除 ${record.date || "这条"} 成长记录？`,
      confirmText: "确认删除",
    });

    if (!confirmed) {
      return;
    }

    wx.showLoading({
      title: "删除中",
      mask: true,
    });

    try {
      await babyService.deleteRecord(id);
      if (id === this.data.growthEditingId) {
        this.setData({
          growthEditingId: "",
          growthForm: createDefaultGrowthForm(),
          growthEntryCollapsed: true,
        });
      }
      await this.loadGrowthPage();
      wx.showToast({
        title: "已删除",
        icon: "success",
      });
    } catch (error) {
      console.error("[growth] save failed", error);
      wx.showToast({
        title: error.message || "删除失败",
        icon: "none",
      });
    } finally {
      wx.hideLoading();
    }
  },

  async handleSaveGrowth() {
    const growthForm = this.data.growthForm;
    const isEditing = Boolean(this.data.growthEditingId);
    const errorMessage = getGrowthFormError(growthForm);

    if (errorMessage) {
      wx.showToast({
        title: errorMessage,
        icon: "none",
      });
      return;
    }

    wx.showLoading({
      title: "保存中",
      mask: true,
    });

    try {
      const currentRecord = (this.data.growthRecords || []).find(
        (item) => item.id === this.data.growthEditingId
      );

      const payload = {
        id: this.data.growthEditingId || "",
        type: "growth",
        date: growthForm.date,
        time: "12:00",
        note: "",
        height: growthForm.height,
        weight: growthForm.weight,
        headCircumference: growthForm.headCircumference,
        createdAt: currentRecord && currentRecord.createdAt ? currentRecord.createdAt : undefined,
      };

      console.log("[growth] save payload", payload);
      const state = await babyService.saveRecord(payload);
      const growthCount = (state.records || []).filter((record) => record.type === "growth").length;
      console.log("[growth] save result", {
        babyId: state.baby && state.baby.id,
        totalRecords: (state.records || []).length,
        growthCount,
      });
      await this.loadGrowthPage();
      saveGrowthEntryCollapseState(this.data.babyProfile.id, true);
      this.setData({
        growthEntryCollapsed: true,
        growthEditingId: "",
        growthForm: createDefaultGrowthForm(),
      });
      wx.showToast({
        title: isEditing ? "成长记录已更新" : "成长记录已保存",
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
