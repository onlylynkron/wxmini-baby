const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();

const COLLECTIONS = {
  babies: "baby_profiles",
  members: "baby_members",
  records: "baby_records",
  users: "baby_users",
};

function now() {
  return Date.now();
}

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function createInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
}

async function getUniqueInviteCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inviteCode = createInviteCode();
    const result = await db
      .collection(COLLECTIONS.babies)
      .where({
        inviteCode,
      })
      .limit(1)
      .get();

    if (!result.data.length) {
      return inviteCode;
    }
  }

  throw new Error("邀请码生成失败");
}

function mapDocument(document) {
  return {
    ...document,
    id: document._id,
  };
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
    case "是":
      return "yes";
    case "false":
    case "0":
    case "无":
    case "否":
      return "no";
    default:
      return value;
  }
}

function normalizeDiaperRecord(record) {
  return {
    ...record,
    poopShapeId: normalizePoopShapeId(record.poopShapeId || record.poopShape || record.shapeId),
    diaperRash: normalizeDiaperRashId(
      record.diaperRash !== undefined
        ? record.diaperRash
        : record.rash !== undefined
          ? record.rash
          : record.hasRash
    ),
  };
}

function buildMemberView(member, openId) {
  return {
    id: member.id,
    role: member.role || "manager",
    joinedAt: member.joinedAt || member.createdAt || 0,
    isSelf: member.userOpenId === openId,
  };
}

async function getMembershipsByOpenId(openId) {
  const result = await db
    .collection(COLLECTIONS.members)
    .where({
      userOpenId: openId,
    })
    .get();

  return result.data.map(mapDocument);
}

async function getUserState(openId) {
  const result = await db
    .collection(COLLECTIONS.users)
    .where({
      userOpenId: openId,
    })
    .limit(1)
    .get();

  return result.data[0] ? mapDocument(result.data[0]) : null;
}

async function saveUserState(openId, activeBabyId) {
  const userState = await getUserState(openId);

  if (!userState) {
    await db.collection(COLLECTIONS.users).add({
      data: {
        userOpenId: openId,
        activeBabyId,
        createdAt: now(),
        updatedAt: now(),
      },
    });
    return;
  }

  await db.collection(COLLECTIONS.users).doc(userState.id).update({
    data: {
      activeBabyId,
      updatedAt: now(),
    },
  });
}

async function createDefaultBaby(openId) {
  const timestamp = now();
  const inviteCode = await getUniqueInviteCode();
  const babyResult = await db.collection(COLLECTIONS.babies).add({
    data: {
      name: "我的宝宝",
      birthDate: "",
      inviteCode,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });

  const babyId = babyResult._id;

  await db.collection(COLLECTIONS.members).add({
    data: {
      babyId,
      userOpenId: openId,
      role: "owner",
      joinedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });

  await saveUserState(openId, babyId);
  return babyId;
}

async function migrateLegacyRecords(openId, babyId) {
  try {
    const result = await db
      .collection(COLLECTIONS.records)
      .where({
        _openid: openId,
      })
      .limit(300)
      .get();

    const legacyRecords = result.data.filter((record) => !record.babyId);

    for (const record of legacyRecords) {
      const timestamp =
        record.recordAt || new Date(`${record.date}T${record.time}:00`).getTime() || now();
      await db.collection(COLLECTIONS.records).doc(record._id).update({
        data: {
          babyId,
          method: record.method || "",
          amount: record.amount !== undefined ? record.amount : null,
          diaperType: record.diaperType || "",
          poopColorId: record.poopColorId || "",
          poopShapeId: record.poopShapeId || "",
          diaperRash: record.diaperRash || "",
          sleepType: record.sleepType || "",
          durationMinutes: record.durationMinutes !== undefined ? record.durationMinutes : null,
          medicineName: record.medicineName || "",
          dosage: record.dosage !== undefined ? record.dosage : null,
          doseUnit: record.doseUnit || "",
          temperature: record.temperature !== undefined ? record.temperature : null,
          temperatureMethod: record.temperatureMethod || "",
          height: record.height !== undefined ? record.height : null,
          weight: record.weight !== undefined ? record.weight : null,
          headCircumference:
            record.headCircumference !== undefined ? record.headCircumference : null,
          createdAt: record.createdAt || timestamp,
          updatedAt: record.updatedAt || timestamp,
          recordAt: timestamp,
        },
      });
    }
  } catch (error) {
    return;
  }
}

async function ensureActiveBabyId(openId) {
  const memberships = await getMembershipsByOpenId(openId);

  if (!memberships.length) {
    const babyId = await createDefaultBaby(openId);
    await migrateLegacyRecords(openId, babyId);
    return babyId;
  }

  const userState = await getUserState(openId);
  const membershipMap = new Set(memberships.map((item) => item.babyId));

  if (userState && membershipMap.has(userState.activeBabyId)) {
    return userState.activeBabyId;
  }

  const activeBabyId = memberships[0].babyId;
  await saveUserState(openId, activeBabyId);
  return activeBabyId;
}

async function ensureMembership(openId, babyId) {
  const result = await db
    .collection(COLLECTIONS.members)
    .where({
      babyId,
      userOpenId: openId,
    })
    .limit(1)
    .get();

  if (!result.data.length) {
    throw new Error("当前用户没有该宝宝的管理权限");
  }

  return mapDocument(result.data[0]);
}

async function getBabyById(babyId) {
  const result = await db.collection(COLLECTIONS.babies).doc(babyId).get();
  return mapDocument(result.data);
}

async function getBabyByInviteCode(inviteCode) {
  const normalizedCode = normalizeCode(inviteCode);
  const result = await db
    .collection(COLLECTIONS.babies)
    .where({
      inviteCode: normalizedCode,
    })
    .limit(1)
    .get();

  if (!result.data.length) {
    throw new Error("邀请码不存在");
  }

  return mapDocument(result.data[0]);
}

async function getMembersByBabyId(babyId) {
  const result = await db
    .collection(COLLECTIONS.members)
    .where({
      babyId,
    })
    .get();

  return result.data.map(mapDocument);
}

async function getMemberById(memberId) {
  try {
    const result = await db.collection(COLLECTIONS.members).doc(memberId).get();
    return result.data ? mapDocument(result.data) : null;
  } catch (error) {
    return null;
  }
}

async function getRecordsByBabyId(babyId) {
  const records = [];
  const batchSize = 100;
  let offset = 0;

  while (true) {
    const result = await db
      .collection(COLLECTIONS.records)
      .where({
        babyId,
      })
      .orderBy("recordAt", "desc")
      .skip(offset)
      .limit(batchSize)
      .get();

    records.push(...result.data);

    if (result.data.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return records.map((record) => normalizeDiaperRecord(mapDocument(record)));
}

async function buildDashboard(openId) {
  const activeBabyId = await ensureActiveBabyId(openId);
  const currentMember = await ensureMembership(openId, activeBabyId);

  const [baby, members, records] = await Promise.all([
    getBabyById(activeBabyId),
    getMembersByBabyId(activeBabyId),
    getRecordsByBabyId(activeBabyId),
  ]);

  return {
    baby,
    members: members.map((member) => buildMemberView(member, openId)),
    records,
    currentUserRole: currentMember.role || "manager",
    canManageMembers: currentMember.role === "owner",
    storageMeta: {
      mode: "cloud",
      title: "云开发协作模式",
      description: "已启用云函数和云数据库，可邀请家人共同管理同一个宝宝。",
      collaborationEnabled: true,
    },
  };
}

function toOptionalNumber(value, fieldName) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new Error(`${fieldName}格式不正确`);
  }

  return numberValue;
}

function buildRecordPayload(record, babyId) {
  const timestamp = now();
  const recordAt = new Date(`${record.date}T${record.time}:00`).getTime();

  return {
    babyId,
    type: record.type,
    date: record.date,
    time: record.time,
    note: record.note || "",
    method: record.method || "",
    amount: toOptionalNumber(record.amount, "奶量"),
    diaperType: record.diaperType || "",
    poopColorId: record.poopColorId || "",
    poopShapeId: record.poopShapeId || "",
    diaperRash: record.diaperRash || "",
    sleepType: record.sleepType || "",
    durationMinutes: toOptionalNumber(record.durationMinutes, "睡眠时长"),
    medicineName: record.medicineName || "",
    dosage: toOptionalNumber(record.dosage, "剂量"),
    doseUnit: record.doseUnit || "",
    temperature: toOptionalNumber(record.temperature, "体温"),
    temperatureMethod: record.temperatureMethod || "",
    height: toOptionalNumber(record.height, "身高"),
    weight: toOptionalNumber(record.weight, "体重"),
    headCircumference: toOptionalNumber(record.headCircumference, "头围"),
    recordAt: Number.isNaN(recordAt) ? timestamp : recordAt,
    updatedAt: timestamp,
  };
}

async function handleSaveProfile(openId, data) {
  const activeBabyId = await ensureActiveBabyId(openId);
  const currentMember = await ensureMembership(openId, activeBabyId);

  if (currentMember.role !== "owner") {
    throw new Error("只有管理员可以修改资料");
  }

  await db.collection(COLLECTIONS.babies).doc(activeBabyId).update({
    data: {
      name: data.name || "我的宝宝",
      birthDate: data.birthDate || "",
      updatedAt: now(),
    },
  });

  return buildDashboard(openId);
}

async function handleJoinBaby(openId, data) {
  const baby = await getBabyByInviteCode(data.inviteCode);
  const existingMembershipResult = await db
    .collection(COLLECTIONS.members)
    .where({
      babyId: baby.id,
      userOpenId: openId,
    })
    .limit(1)
    .get();

  if (!existingMembershipResult.data.length) {
    await db.collection(COLLECTIONS.members).add({
      data: {
        babyId: baby.id,
        userOpenId: openId,
        role: "manager",
        joinedAt: now(),
        createdAt: now(),
        updatedAt: now(),
      },
    });
  }

  await saveUserState(openId, baby.id);
  return buildDashboard(openId);
}

async function handleSaveRecord(openId, data) {
  const activeBabyId = await ensureActiveBabyId(openId);
  await ensureMembership(openId, activeBabyId);

  const payload = buildRecordPayload(data, activeBabyId);

  if (data.id) {
    const recordResult = await db.collection(COLLECTIONS.records).doc(data.id).get();
    if (!recordResult.data || recordResult.data.babyId !== activeBabyId) {
      throw new Error("记录不存在或无权修改");
    }

    await db.collection(COLLECTIONS.records).doc(data.id).update({
      data: {
        ...payload,
        createdAt: recordResult.data.createdAt || now(),
      },
    });
  } else {
    await db.collection(COLLECTIONS.records).add({
      data: {
        ...payload,
        createdAt: now(),
      },
    });
  }

  return buildDashboard(openId);
}

async function handleDeleteRecord(openId, data) {
  const activeBabyId = await ensureActiveBabyId(openId);
  await ensureMembership(openId, activeBabyId);

  const recordResult = await db.collection(COLLECTIONS.records).doc(data.recordId).get();
  if (!recordResult.data || recordResult.data.babyId !== activeBabyId) {
    throw new Error("记录不存在或无权删除");
  }

  await db.collection(COLLECTIONS.records).doc(data.recordId).remove();
  return buildDashboard(openId);
}

async function clearRecordsByBabyId(babyId) {
  while (true) {
    const result = await db
      .collection(COLLECTIONS.records)
      .where({
        babyId,
      })
      .limit(100)
      .get();

    if (!result.data.length) {
      return;
    }

    for (const record of result.data) {
      await db.collection(COLLECTIONS.records).doc(record._id).remove();
    }
  }
}

async function handleClearAllRecords(openId) {
  const activeBabyId = await ensureActiveBabyId(openId);
  const currentMember = await ensureMembership(openId, activeBabyId);

  if (currentMember.role !== "owner") {
    throw new Error("只有管理员可以清空记录");
  }

  await clearRecordsByBabyId(activeBabyId);
  return buildDashboard(openId);
}

async function handleRemoveMember(openId, data) {
  const activeBabyId = await ensureActiveBabyId(openId);
  const currentMember = await ensureMembership(openId, activeBabyId);

  if (currentMember.role !== "owner") {
    throw new Error("只有管理员可以移除成员");
  }

  const targetMember = await getMemberById(data.memberId);
  if (!targetMember || targetMember.babyId !== activeBabyId) {
    throw new Error("成员不存在或无权操作");
  }

  if (targetMember.userOpenId === openId) {
    throw new Error("不能移除自己");
  }

  if (targetMember.role === "owner") {
    throw new Error("不能移除管理员");
  }

  await db.collection(COLLECTIONS.members).doc(targetMember.id).remove();
  return buildDashboard(openId);
}

async function handleLeaveBaby(openId) {
  const activeBabyId = await ensureActiveBabyId(openId);
  const currentMember = await ensureMembership(openId, activeBabyId);

  if (currentMember.role === "owner") {
    throw new Error("管理者不能直接退出，请先保留当前宝宝管理权限");
  }

  await db.collection(COLLECTIONS.members).doc(currentMember.id).remove();
  return buildDashboard(openId);
}

exports.main = async (event) => {
  const { OPENID: openId } = cloud.getWXContext();

  try {
    let data;
    switch (event.action) {
      case "bootstrap":
        data = await buildDashboard(openId);
        break;
      case "saveProfile":
        data = await handleSaveProfile(openId, event.data || {});
        break;
      case "joinBaby":
        data = await handleJoinBaby(openId, event.data || {});
        break;
      case "saveRecord":
        data = await handleSaveRecord(openId, event.data || {});
        break;
      case "deleteRecord":
        data = await handleDeleteRecord(openId, event.data || {});
        break;
      case "clearAllRecords":
        data = await handleClearAllRecords(openId);
        break;
      case "removeMember":
        data = await handleRemoveMember(openId, event.data || {});
        break;
      case "leaveBaby":
        data = await handleLeaveBaby(openId);
        break;
      default:
        throw new Error("未知操作");
    }

    return {
      ok: true,
      data,
    };
  } catch (error) {
    console.error("[baby] action failed", {
      action: event.action,
      openId,
      message: error.message,
      stack: error.stack,
    });
    return {
      ok: false,
      message: error.message || "服务调用失败",
    };
  }
};
