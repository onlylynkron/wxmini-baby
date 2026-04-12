# 宝宝护理记录

## 功能

- 宝宝资料：昵称、出生日期、年龄自动计算
- 护理记录：喝奶、尿布、睡眠、喂药、体温、成长
- 家庭协作：邀请码邀请家人共同管理
- 历史记录：按日期筛选、编辑、删除

## 云开发部署

1. 使用微信开发者工具打开项目 `D:\project\wx-mini-baby`
2. 确认 [config.js](D:/project/wx-mini-baby/config.js) 中 `envId` 已填写
3. 在开发者工具中进入 `cloudfunctions/baby`
4. 执行“安装依赖”
5. 执行“上传并部署：云端安装依赖”

## 数据集合

- `baby_profiles`
- `baby_members`
- `baby_records`
- `baby_users`

## 主要文件

- [config.js](D:/project/wx-mini-baby/config.js)
- [app.js](D:/project/wx-mini-baby/app.js)
- [pages/index/index.js](D:/project/wx-mini-baby/pages/index/index.js)
- [pages/index/index.wxml](D:/project/wx-mini-baby/pages/index/index.wxml)
- [pages/index/index.wxss](D:/project/wx-mini-baby/pages/index/index.wxss)
- [utils/baby-service.js](D:/project/wx-mini-baby/utils/baby-service.js)
- [cloudfunctions/baby/index.js](D:/project/wx-mini-baby/cloudfunctions/baby/index.js)
