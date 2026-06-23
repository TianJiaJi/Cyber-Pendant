---
name: operations-handbook
description: Cyber-Pendant 交付与运营手册
metadata:
  type: project
  status: current
  updated: 2026-06-23
---

# Cyber-Pendant 交付与运营手册

本文档面向交付、运营、后台管理员和现场调试人员，说明如何从一批校服主档生成可印刷二维码，并完成用户绑定、防丢和数据导出。

## 角色分工

| 角色 | 负责事项 |
|------|----------|
| 系统管理员 | 配置 `.env`、启动服务、备份数据库、管理后台账号 |
| 后台管理员 | 维护衣服主档、批次、SN、用户状态、统计和导出 |
| 学校或交付人员 | 核对批次、打印二维码、贴标、抽样扫码验收 |
| 家长或学生 | 扫码核验、微信登录、绑定学生信息、报告丢失 |
| 拾获者 | 扫码查看报失状态，登录后查看联系方式并归还 |

## 上线前检查

### 服务端配置

确认 `server/.env` 至少包含：

```env
PORT=8787
DATABASE_PATH=../data/cyber-pendant.sqlite
FRONTEND_BASE_URL=https://your-user-client.example.com
ADMIN_BASE_PATH=/admin
CORS_ORIGIN=https://your-user-client.example.com
TOKEN_SECRET=replace-with-a-long-random-secret
USER_TOKEN_SECRET=replace-with-a-different-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-strong-admin-password
WECHAT_APP_ID=your-wechat-mini-program-appid
WECHAT_APP_SECRET=your-wechat-mini-program-secret
```

### 用户端配置

`client/.env.local`：

```env
VITE_API_BASE_URL=https://your-api.example.com
```

微信小程序正式发布时，需要在微信公众平台配置合法请求域名，且后端必须是 HTTPS。

### 验证命令

```bash
npm test
node --test client/test/fixed-header-layout.test.js
node --test server/admin/test/admin-ui.test.js
npm --prefix client run build:mp-weixin
npm --prefix server/admin run build
```

## 后台使用流程

### 1. 登录后台

访问：

```text
https://your-api.example.com/admin/
```

使用 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 登录。

### 2. 创建衣服主档

进入后台首页，新增衣服主档。建议至少填写：

- 衣服名称
- 面料
- 执行标准
- 安全类别
- 质量等级
- 生产企业
- 企业地址
- 洗护说明

主档信息会同步影响该主档下所有 SN 的公开详情展示。

### 3. 创建生产批次

进入衣服详情页，在“生成批次 SN”区域填写：

- 款号
- 颜色
- 尺码
- 批次标签
- 生产日期
- 生成数量
- 批次备注

提交后系统会批量生成 SN。

### 4. 下载二维码

当前系统使用传统正方形二维码。

在 SN 列表中可以：

- 单个下载二维码。
- 导出本批 Excel。
- 导出本批 CSV。

导出表格会包含：

- 衣服名称
- 执行标准
- 款号
- 颜色
- 尺码
- SN
- 批次标签
- 生产日期
- 详情页链接
- 二维码模式
- 二维码图片链接

### 5. 印刷前抽检

每批印刷前至少抽样检查：

1. 二维码能被微信小程序扫码识别。
2. 二维码能被普通扫码工具识别为详情页链接。
3. 打开详情页后 SN 正确。
4. 页面展示的衣服、批次、颜色、尺码和执行标准正确。
5. 已停用 SN 返回停用状态，而不是正常状态。

## 用户流程

### 扫码核验

用户可以：

- 微信小程序内扫码。
- H5 页面摄像头扫码。
- 手动输入 SN。

系统会进入公开详情页并展示：

- 真伪和状态提示
- 衣服主档信息
- 批次信息
- 查询次数
- 绑定状态
- 报失状态

### 微信登录

用户点击绑定、报失或查看联系方式时，如果未登录，会跳转微信登录页。

登录流程：

1. 小程序调用 `uni.login`。
2. 前端把 `code` 发给 `/api/auth/wechat/login`。
3. 后端通过微信 `code2session` 获取 openid。
4. 后端创建或更新 `users` 记录。
5. 前端保存用户 token。

### 绑定校服

绑定时用户填写：

- 学生姓名
- 学校
- 班级
- 联系人（可选）
- 联系电话

绑定后：

- SN 会记录绑定用户。
- 绑定信息会进入审计日志。
- 公开详情正常只展示脱敏信息。
- 用户中心会出现该校服。

### 报告丢失

绑定用户可以在详情页报告丢失。

报失后：

- 公开详情会显示“该校服已报失”。
- 拾获者登录后可以点击查看联系方式。
- 每次联系方式披露都会记录曝光日志。
- 报失记录默认有 30 天过期时间。

### 取消报失

绑定用户或管理员可以取消报失。取消后公开详情不再显示报失联系方式披露入口。

## 管理员运营动作

### 用户管理

后台可查看用户列表和用户状态。

可执行：

- 封禁用户
- 解封用户
- 查看用户概要

封禁后，用户登录或继续操作会被拒绝。

### 数据统计

后台统计覆盖：

- 用户总数、活跃数、封禁数
- SN 总数、绑定数、报失数
- 报失状态分布
- 当日查看、绑定等运营数据

统计用于运营观察，不等同于审计原始记录。

### 数据导出

管理台支持导出：

```text
users
garments
reports
binding-logs
```

导出建议：

- 日常运营按周导出。
- 上线初期每天导出一次留档。
- 涉及隐私字段的导出文件不要通过公开聊天工具传播。
- 离线文件应按项目和日期归档。

## 停用与真删除

默认删除是停用，不会移除数据库记录。

适合停用：

- 印刷错误但需要保留记录。
- 某批次暂时不应被公开核验。
- SN 异常需要追踪。

真删除使用 `?hard=1`，会移除记录。

适合真删除：

- 本地测试数据。
- 明确未印刷、未交付、无审计价值的数据。

不建议真删除已印刷二维码对应的 SN，因为用户扫码会查不到记录。

## 备份建议

SQLite 数据库默认位于：

```text
data/cyber-pendant.sqlite
```

如果开启 WAL，还会看到：

```text
data/cyber-pendant.sqlite-wal
data/cyber-pendant.sqlite-shm
```

建议：

- 生产环境每天备份数据库文件。
- 重大批量导入、批量生成、批量删除前手动备份。
- 备份文件按日期命名并放入非公开存储。
- 恢复演练至少在上线前做一次。

## 常见问题

### 小程序扫码后查不到 SN

检查：

1. 二维码内容是不是详情页链接或 SN。
2. 链接中是否包含 `sn=CP...`。
3. `FRONTEND_BASE_URL` 是否指向正式用户端。
4. 小程序构建是否包含最新 `client/src/utils/scanner.js`。
5. 后端是否能访问 `/api/garments/{sn}`。

### 小程序真机访问不了接口

常见原因：

- `VITE_API_BASE_URL` 仍是 `localhost`。
- 手机和电脑不在同一局域网。
- 微信开发者工具开启了域名校验。
- 正式小程序未配置 HTTPS 合法域名。

### 用户中心顶部按钮压到右上角系统组件

确认页面顶部栏存在 Mini Program 条件样式：

```css
/* #ifdef MP-WEIXIN */
.user-topbar {
  padding-right: 224rpx;
}
/* #endif */
```

其他自定义顶部栏也应保留同类规则。

### 按钮文字看起来不居中

给按钮文本加独立标签：

```vue
<button class="refresh-button">
  <text class="button-label">刷新</text>
</button>
```

并保留：

```css
.button-label {
  display: block;
  line-height: 1;
}
```

### 二维码看起来是圆形

当前产品要求传统正方形二维码。

检查：

1. 后台二维码模式是否显示“传统正方形二维码”。
2. 二维码 URL 是否为 `/api/qrcode/{sn}?type=url`。
3. 是否使用了历史导出的微信小程序码图片。
4. 是否误用了微信 `getwxacodeunlimit` 生成的图片。

### 报失后仍看不到完整联系方式

完整联系方式需要通过披露接口返回。

检查：

1. 用户是否登录。
2. SN 是否存在有效报失记录。
3. 是否调用了 `/api/garments/{sn}/contact-reveal`。
4. 绑定时是否填写了联系电话。

## 交付验收清单

- [ ] 后端 `.env` 已配置生产密钥。
- [ ] 管理后台可登录。
- [ ] 用户端可访问 API。
- [ ] 微信登录能拿到用户 token。
- [ ] 新建衣服主档成功。
- [ ] 创建批次并生成 SN 成功。
- [ ] 下载的二维码为传统正方形二维码。
- [ ] 小程序扫码能进入正确 SN 详情页。
- [ ] H5 扫码或手动输入能查询同一 SN。
- [ ] 用户可以绑定校服。
- [ ] 用户中心能看到绑定校服。
- [ ] 用户可以报告丢失和取消报失。
- [ ] 报失后登录用户可以查看联系方式。
- [ ] 管理员可以导出用户、吊牌、报告和绑定日志。
- [ ] `npm test` 通过。
- [ ] 小程序构建通过。
- [ ] 管理台构建通过。
