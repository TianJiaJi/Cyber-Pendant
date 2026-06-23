---
name: current-system-state
description: Cyber-Pendant 当前实现状态索引
metadata:
  type: project
  status: current
  updated: 2026-06-23
---

# Cyber-Pendant 当前系统状态

本文档记录当前代码真实具备的能力，用于和历史设计稿、实施计划区分。判断项目现状时，优先阅读本文档、`README.md`、`CLAUDE.md` 和源码。

## 总体判断

Cyber-Pendant 已经从早期“吊牌查询 + 管理后台”扩展为“吊牌溯源 + 微信用户绑定 + 防丢 + 后台运营”的闭环系统。

当前已实现：

- 管理后台登录、衣服主档、批次、SN 管理。
- 传统正方形二维码生成和导出。
- 用户端 H5 / 微信小程序页面。
- 微信用户登录、用户 token、用户中心。
- 用户绑定、修改绑定、解绑和绑定日志。
- 报失、取消报失、联系方式披露和曝光日志。
- 管理员用户管理、统计和 CSV 导出。
- 后端托管管理台，自动准备后台构建产物。

## 运行入口

| 模块 | 入口 | 说明 |
|------|------|------|
| 后端 | `server/src/index.js` | 启动 API 服务并准备管理台 |
| API 路由 | `server/src/api.js` | 手写 HTTP 路由和处理器 |
| 数据层 | `server/src/db.js` | SQLite schema、迁移、查询和导出 |
| 用户端 | `client/src/pages.json` | uni-app 页面注册 |
| 管理台 | `server/admin/src/router.js` | Vue Router hash 路由 |

## 数据模型

当前核心表：

- `admins`：后台管理员。
- `users`：微信用户。
- `clothes`：衣服主档。
- `garment_batches`：生产批次。
- `garments`：单个 SN 明细。
- `binding_logs`：绑定操作审计。
- `lost_reports`：丢失报告。
- `contact_reveal_logs`：联系方式披露日志。
- `garment_styles`：旧单表模型兼容迁移来源。

数据关系：

```text
clothes 1 - n garment_batches 1 - n garments
users 1 - n garments(bound_by_user_id)
users 1 - n lost_reports(reporter_id)
garments 1 - n binding_logs
garments 1 - n contact_reveal_logs
```

## 用户端能力

页面：

- `pages/index/index`：SN 输入、扫码入口、H5 摄像头扫码。
- `pages/garment/detail`：公开详情、绑定、防丢、联系方式披露。
- `pages/login/index`：微信登录。
- `pages/user/index`：我的校服、有效报失、丢失报告、绑定记录。

扫码策略：

- H5 使用 `html5-qrcode`。
- 微信小程序使用 `uni.scanCode`。
- `client/src/utils/scanner.js` 会解析链接、`sn`、`scene`、编码后的 scene 和直接 SN。

小程序布局约束：

- 页面使用自定义导航栏。
- 顶部栏需要为右上角系统胶囊预留空间。
- 部分按钮文本需要用 `text.button-label` 固定垂直居中。
- 点击事件使用 `@click="() => fn()"` 写法规避 uni-app / 微信 DevTools 行为差异。

## 管理台能力

页面：

- `#/login`：管理员登录。
- `#/dashboard`：衣服主档列表、用户管理、统计和导出。
- `#/clothes/:id`：主档详情、批次生成、SN 管理、二维码下载和批次导出。

当前二维码模式：

- 管理台只展示“传统正方形二维码”。
- 导出清单包含详情页链接、二维码模式、二维码图片链接。
- 不再导出微信小程序页面和 `scene` 字段。

## 后端 API 分组

公开：

- `GET /api/health`
- `GET /api/garments/{sn}`
- `GET /api/qrcode/{sn}?type=sn|url`

管理员：

- `POST /api/auth/login`
- `/api/clothes`
- `/api/clothes/{id}/batches`
- `/api/batches/{id}`
- `/api/garments`
- `/api/sn/generate`
- `/api/admin/users`
- `/api/admin/stats`
- `/api/admin/export/{type}`

用户：

- `POST /api/auth/wechat/login`
- `GET /api/user/garments`
- `GET /api/user/lost-reports`
- `GET /api/user/binding-logs`
- `POST /api/garments/{sn}/binding`
- `PUT /api/garments/{sn}/binding`
- `DELETE /api/garments/{sn}/binding`
- `POST /api/garments/{sn}/report-lost`
- `DELETE /api/garments/{sn}/report-lost`
- `POST /api/garments/{sn}/contact-reveal`

## 隐私与权限

服务端承担安全边界：

- 用户绑定必须登录。
- 修改绑定必须是绑定者。
- 用户解绑必须是绑定者，管理员也可解绑。
- 报失必须由绑定者发起。
- 取消报失必须由绑定者或管理员执行。
- 完整联系方式只通过联系方式披露接口返回。

公开详情页正常只展示脱敏信息：

- 学生姓名脱敏。
- 学校和班级可展示。
- 电话只展示尾号。

## 二维码策略

当前产品决策：使用传统正方形二维码。

原因：

- 用户明确不要圆形小程序码。
- 传统二维码更适合印刷和第三方扫码识别。
- 小程序内扫码可直接从链接中提取 SN。

兼容规则：

- `type=url`：生成详情页链接二维码。
- `type=sn`：生成原始 SN 二维码。
- `type=mini-program`：历史兼容，回落到 `url`。

## 环境变量状态

必要生产配置：

- `ADMIN_PASSWORD`
- `TOKEN_SECRET`
- `USER_TOKEN_SECRET`
- `FRONTEND_BASE_URL`
- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`

建议生产配置：

- `CORS_ORIGIN`
- `DATABASE_PATH`
- `ADMIN_BASE_PATH`
- `USER_TOKEN_TTL_DAYS`

历史配置：

- `WECHAT_QR_PAGE`
- `WECHAT_QR_ENV_VERSION`
- `WECHAT_QR_CHECK_PATH`
- `WECHAT_QR_WIDTH`

这些历史配置目前不参与传统正方形二维码生成。

## 验证命令

当前推荐验证组合：

```bash
npm test
node --test client/test/fixed-header-layout.test.js
node --test server/admin/test/admin-ui.test.js
npm --prefix client run build:mp-weixin
npm --prefix server/admin run build
```

## 已知限制

- SQLite 适合当前小规模部署；更大规模前需要补充备份、监控、限流和恢复策略。
- 微信登录只使用 `code2session` 获取 openid，不做手机号解密。
- 联系电话由用户绑定时手动输入，没有短信验证。
- 报失流程提供联系方式披露审计，但还没有客服工单或找回闭环。
- 小程序正式发布需要后端 HTTPS 域名和微信后台合法域名配置。

## 历史文档状态

以下文档是历史设计或阶段计划，不应直接当作当前实现状态：

- `memory/user-system-analysis.md`
- `memory/wechat-login-simplified.md`
- `memory/detailed-logic-design.md`
- `memory/implementation-plan-updated.md`

这些文档仍有参考价值，但需要结合本文档和源码判断哪些内容已经实现、哪些仍是后续路线。
