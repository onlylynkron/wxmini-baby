const babyService = require("../../utils/baby-service");

const PROFILE_COLLAPSE_STORAGE_KEY = "baby-care-profile-collapse-state";
const COLLABORATION_COLLAPSE_STORAGE_KEY = "baby-care-collaboration-collapse-state";
const RECORD_MANAGE_COLLAPSE_STORAGE_KEY = "baby-care-record-manage-collapse-state";

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

function readRecordManageCollapseState() {
  const state = wx.getStorageSync(RECORD_MANAGE_COLLAPSE_STORAGE_KEY);
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

function isRecordManageCollapsed(babyId) {
  if (!babyId) {
    return true;
  }

  const state = readRecordManageCollapseState();
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

function saveRecordManageCollapseState(babyId, collapsed) {
  if (!babyId) {
    return;
  }

  const state = readRecordManageCollapseState();
  state[babyId] = Boolean(collapsed);
  wx.setStorageSync(RECORD_MANAGE_COLLAPSE_STORAGE_KEY, state);
}

function createDefaultProfile() {
  return {
    id: "",
    name: "我的宝宝",
    birthDate: "",
    inviteCode: "",
  };
}

function createDefaultStorageMeta() {
  return {
    mode: "local",
    collaborationEnabled: false,
  };
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

function buildMemberSummary(members) {
  if (!members.length) {
    return "1位成员";
  }

  return `${members.length}位成员`;
}

function getMemberRoleLabel(role) {
  return role === "owner" ? "管理者" : "协作者";
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
    let displayName = "协作者";
    let hintText = "共同管理成员";
    let roleLabel = member.isSelf ? "我" : "已加入";

    if (member.role === "owner") {
      displayName = "管理者";
      hintText = member.isSelf ? "当前使用设备 · 创建者" : "创建者";
      roleLabel = member.isSelf ? "我" : "主账号";
    } else {
      collaboratorIndex += 1;
      displayName = `协作者 ${collaboratorIndex}`;
      hintText = member.isSelf ? "当前使用设备" : "共同管理成员";
    }

    return {
      ...member,
      displayName,
      hintText,
      roleLabel,
      canRemove: Boolean(canManageMembers && !member.isSelf && member.role !== "owner"),
      canLeave: Boolean(member.isSelf && member.role !== "owner"),
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

  return "仅管理员可邀请其他成员加入协作。";
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

function buildManageStats(ageInfo, members, currentUserRole, storageMeta) {
  return [
    { label: "宝宝年龄", value: ageInfo.shortText },
    { label: "共同管理", value: `${members.length} 人` },
    { label: "当前身份", value: getMemberRoleLabel(currentUserRole) },
    { label: "云协作", value: storageMeta.collaborationEnabled ? "已开启" : "未开启" },
  ];
}

function shouldDefaultCollapseProfile(babyProfile) {
  const name = String((babyProfile && babyProfile.name) || "").trim();
  return Boolean((babyProfile && babyProfile.birthDate) || (name && name !== "我的宝宝"));
}

function shouldDefaultCollapseCollaboration(storageMeta, members) {
  if (!storageMeta || !storageMeta.collaborationEnabled) {
    return false;
  }

  return (members || []).length > 1;
}

Page({
  data: {
    babyProfile: createDefaultProfile(),
    profileForm: {
      name: "我的宝宝",
      birthDate: "",
    },
    todayDate: formatDate(new Date()),
    profileCollapsed: false,
    collaborationCollapsed: false,
    ageShortText: "未设置",
    ageDetailText: "设置出生日期后会自动计算月龄和周岁。",
    ageHeroText: "设置出生日期后会自动计算总天数和月龄。",
    members: [],
    memberList: [],
    memberSummaryText: "1位成员",
    currentUserRole: "owner",
    canManageMembers: false,
    collaborationHintText: "开启云开发后可邀请家人共同记录。",
    collaborationSummaryText: "未开启云协作",
    storageMeta: createDefaultStorageMeta(),
    manageStats: [],
    canLeaveBaby: false,
    canEditProfile: true,
    canClearRecords: false,
    recordManageCollapsed: true,
    recordCount: 0,
  },

  onLoad(options) {
    this.pendingInviteCode = normalizeInviteCode(options && options.inviteCode);

    if (wx.showShareMenu) {
      wx.showShareMenu();
    }
  },

  onShow() {
    if (wx.hideKeyboard) {
      wx.hideKeyboard();
    }
    this.syncDashboard();
  },

  onHide() {
    if (wx.hideKeyboard) {
      wx.hideKeyboard();
    }
  },

  onUnload() {
    if (wx.hideKeyboard) {
      wx.hideKeyboard();
    }
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

  setRecordManageCollapsed(collapsed, babyId) {
    const targetBabyId = babyId || this.data.babyProfile.id;
    saveRecordManageCollapseState(targetBabyId, collapsed);
    this.setData({
      recordManageCollapsed: collapsed,
    });
  },

  applyState(state) {
    const babyProfile = state.baby || createDefaultProfile();
    const members = state.members || [];
    const storageMeta = state.storageMeta || createDefaultStorageMeta();
    const currentUserRole = state.currentUserRole || "owner";
    const canManageMembers = Boolean(state.canManageMembers);
    const records = state.records || [];
    const ageInfo = getAgeInfo(babyProfile.birthDate);

    this.setData({
      babyProfile,
      profileForm: {
        name: babyProfile.name || "我的宝宝",
        birthDate: babyProfile.birthDate || "",
      },
      profileCollapsed: isProfileCollapsed(babyProfile.id) || shouldDefaultCollapseProfile(babyProfile),
      collaborationCollapsed:
        isCollaborationCollapsed(babyProfile.id) ||
        shouldDefaultCollapseCollaboration(storageMeta, members),
      ageShortText: ageInfo.shortText,
      ageDetailText: ageInfo.detailText,
      ageHeroText: ageInfo.heroText,
      members,
      memberList: buildMemberList(members, canManageMembers),
      memberSummaryText: buildMemberSummary(members),
      currentUserRole,
      canManageMembers,
      canEditProfile: currentUserRole === "owner",
      collaborationHintText: buildCollaborationHint(storageMeta, canManageMembers),
      collaborationSummaryText: buildCollaborationSummaryText(storageMeta, members, canManageMembers),
      storageMeta,
      manageStats: buildManageStats(ageInfo, members, currentUserRole, storageMeta),
      canLeaveBaby: currentUserRole !== "owner",
      canClearRecords: currentUserRole === "owner",
      recordManageCollapsed: isRecordManageCollapsed(babyProfile.id),
      recordCount: records.length,
    });
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

  onShareAppMessage(event) {
    const inviteCode = normalizeInviteCode(this.data.babyProfile.inviteCode);
    const canShareInvite =
      event &&
      event.from === "button" &&
      this.data.storageMeta.collaborationEnabled &&
      this.data.currentUserRole === "owner" &&
      inviteCode;

    return {
      title: canShareInvite
        ? `邀请你一起管理${this.data.babyProfile.name || "宝宝记录"}`
        : `${this.data.babyProfile.name || "宝宝"}护理记录`,
      path: canShareInvite ? `/pages/manage/manage?inviteCode=${inviteCode}` : "/pages/manage/manage",
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

  handleExpandRecordManage() {
    this.setRecordManageCollapsed(false);
  },

  handleCollapseRecordManage() {
    this.setRecordManageCollapsed(true);
  },

  async handleSaveProfile() {
    if (this.data.currentUserRole !== "owner") {
      wx.showToast({
        title: "只有管理员可以修改资料",
        icon: "none",
      });
      return;
    }

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

  async handleRemoveMember(event) {
    const { memberId, memberName } = event.currentTarget.dataset;
    const confirmed = await confirmAction({
      title: "移除成员",
      content: `确认移除${memberName}？移除后对方将不能继续管理当前宝宝，历史记录会保留。`,
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

  async handleLeaveBaby() {
    const confirmed = await confirmAction({
      title: "退出协作",
      content: "确认退出当前宝宝协作？退出后你将无法继续管理当前宝宝，但历史记录会保留，不会删除。",
      confirmText: "确认退出",
    });

    if (!confirmed) {
      return;
    }

    wx.showLoading({
      title: "退出中",
      mask: true,
    });

    try {
      const state = await babyService.leaveBaby();
      this.applyState(state);
      wx.showToast({
        title: "已退出协作",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "退出失败",
        icon: "none",
      });
    } finally {
      wx.hideLoading();
    }
  },

  async handleClearAllRecords() {
    if (this.data.currentUserRole !== "owner") {
      wx.showToast({
        title: "只有管理员可以清空记录",
        icon: "none",
      });
      return;
    }

    const recordCount = this.data.recordCount;

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
      this.applyState(state);
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
});
