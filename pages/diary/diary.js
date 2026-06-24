const babyService = require("../../utils/baby-service");

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

function formatDisplayDate(dateText) {
  const [year, month, day] = String(dateText || "").split("-");
  if (!year || !month || !day) {
    return dateText || "未选择日期";
  }

  return `${Number(month)}月${Number(day)}日`;
}

function createDefaultForm() {
  return {
    date: formatDate(new Date()),
    content: "",
  };
}

function buildDiaryView(diary) {
  const content = String(diary.content || "").trim();
  return {
    ...diary,
    displayDate: formatDisplayDate(diary.date),
    previewText: content || "还没有写正文",
    updatedText: diary.updatedAt
      ? `${formatDate(new Date(diary.updatedAt))} 更新`
      : "",
  };
}

Page({
  data: {
    todayDate: formatDate(new Date()),
    diaryForm: createDefaultForm(),
    diaries: [],
    diaryViews: [],
    currentDiaryId: "",
    editorVisible: false,
    editorMode: "create",
    diarySummary: "记录每天的小事",
    isSaving: false,
  },

  onShow() {
    if (wx.hideKeyboard) {
      wx.hideKeyboard();
    }
    this.loadDiaries();
  },

  async loadDiaries() {
    wx.showNavigationBarLoading();

    try {
      const diaries = await babyService.getDiaries();
      this.applyDiaries(diaries);
    } catch (error) {
      wx.showToast({
        title: error.message || "日记加载失败",
        icon: "none",
      });
    } finally {
      wx.hideNavigationBarLoading();
    }
  },

  applyDiaries(diaries) {
    const todayDate = formatDate(new Date());

    this.setData({
      todayDate,
      diaries,
      diaryViews: (diaries || []).map(buildDiaryView),
      diarySummary: diaries && diaries.length
        ? `已经写了 ${diaries.length} 篇日记`
        : "还没有日记，从今天写第一篇",
      currentDiaryId: this.data.currentDiaryId,
    });
  },

  handleDateChange(event) {
    const date = event.detail.value;

    this.setData({
      "diaryForm.date": date,
    });
  },

  handleContentInput(event) {
    this.setData({
      "diaryForm.content": event.detail.value,
    });
  },

  handleOpenDiary(event) {
    const { id } = event.currentTarget.dataset;
    const diary = this.data.diaries.find((item) => item.id === id);

    if (!diary) {
      wx.showToast({
        title: "日记不存在",
        icon: "none",
      });
      return;
    }

    this.setData({
      currentDiaryId: diary.id,
      editorVisible: true,
      editorMode: "edit",
      diaryForm: {
        date: diary.date,
        content: diary.content || "",
      },
    });
  },

  handleDiaryActionsTap() {},

  handleCreateDiary() {
    this.setData({
      currentDiaryId: "",
      editorVisible: true,
      editorMode: "create",
      diaryForm: createDefaultForm(),
    });
  },

  handleCloseEditor() {
    this.setData({
      editorVisible: false,
    });
  },

  async handleSaveDiary() {
    const diaryForm = this.data.diaryForm;
    const content = String(diaryForm.content || "").trim();

    if (!content) {
      wx.showToast({
        title: "请写点内容",
        icon: "none",
      });
      return;
    }

    this.setData({
      isSaving: true,
    });
    wx.showLoading({
      title: "保存中",
      mask: true,
    });

    try {
      const diaries = await babyService.saveDiary({
        id: this.data.currentDiaryId,
        date: diaryForm.date,
        title: "",
        content,
      });
      this.applyDiaries(diaries);
      const savedDiary = this.data.currentDiaryId
        ? diaries.find((item) => item.id === this.data.currentDiaryId)
        : diaries.find((item) => item.date === diaryForm.date);
      this.setData({
        currentDiaryId: savedDiary ? savedDiary.id : "",
        editorMode: savedDiary ? "edit" : "create",
        editorVisible: false,
        diaryForm: savedDiary
          ? {
              date: savedDiary.date,
              content: savedDiary.content || "",
            }
          : diaryForm,
      });
      wx.showToast({
        title: "日记已保存",
        icon: "success",
      });
    } catch (error) {
      wx.showToast({
        title: error.message || "保存失败",
        icon: "none",
      });
    } finally {
      this.setData({
        isSaving: false,
      });
      wx.hideLoading();
    }
  },

  async handleDeleteDiary(event) {
    const { id } = event.currentTarget.dataset;
    const diary = this.data.diaries.find((item) => item.id === id);

    if (!diary) {
      return;
    }

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: "删除日记",
        content: `确认删除 ${diary.date} 的日记？`,
        cancelText: "取消",
        confirmText: "删除",
        confirmColor: "#cf5f36",
        success: (result) => resolve(Boolean(result.confirm)),
        fail: () => resolve(false),
      });
    });

    if (!confirmed) {
      return;
    }

    wx.showLoading({
      title: "删除中",
      mask: true,
    });

    try {
      const diaries = await babyService.deleteDiary(id);
      this.applyDiaries(diaries);
      if (id === this.data.currentDiaryId) {
        this.setData({
          currentDiaryId: "",
          editorVisible: false,
          editorMode: "create",
          diaryForm: createDefaultForm(),
        });
      }
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
});
