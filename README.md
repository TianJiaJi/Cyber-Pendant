# Cyber-Pendant

Cyber-Pendant 是一个面向校服吊牌的数字溯源与防丢系统。管理员在后台维护衣服主档、生产批次和 SN，系统生成传统正方形二维码；用户通过微信小程序或 H5 扫码进入公开详情页，完成真伪核验、学生信息绑定、报失和联系方式披露。

![后端托管管理台示意图](assets/cyber-pendant-readme-illustrations/01-server-admin-separation.png)

## 当前能力

- 管理衣服主档、生产批次、颜色尺码、生产日期、执行标准和厂家信息。
- 批量生成唯一 SN，支持按批次导出 Excel / CSV 清单。
- 生成传统正方形二维码，二维码内容为公开详情页链接。
- 小程序扫码可从链接、`sn`、`scene` 或编码后的 `scene=sn%3D...` 中提取 SN。
- 用户可通过微信登录绑定校服，绑定记录会进入审计日志。
- 绑定用户可报告丢失、取消报失；拾获者登录后可查看完整联系方式。
- 管理员可查看用户、封禁/解封用户、查看统计并导出用户、吊牌、报告和绑定日志。
- 后端启动时可自动安装并构建管理台，默认托管在 `/admin/`。

## 系统入口

| 入口 | 默认地址 | 说明 |
|------|----------|------|
| 管理后台 | `http://localhost:8787/admin/` | 管理衣服、批次、SN、用户、统计和导出 |
| API 健康检查 | `http://localhost:8787/api/health` | 检查后端和数据库路径 |
| 用户端 H5 | `http://localhost:5173` | 本地调试用户查询、绑定和报失 |
| 吊牌详情 | `/#/pages/garment/detail?sn=...` | 二维码跳转的公开详情页 |
| 微信小程序 | `dist/build/mp-weixin` | `npm --prefix client run build:mp-weixin` 输出目录 |

演示 SN：

```text
CP20260615DEMO01
```

## 快速启动

### 1. 安装依赖

```bash
npm --prefix server install
npm --prefix client install
npm --prefix server/admin install
```

后端启动时会检查 `server/admin/dist`。如果管理台未构建或源码比构建产物更新，后端会自动安装并构建管理台。

### 2. 配置环境变量

```bash
cp server/.env.example server/.env
```

至少设置：

```env
ADMIN_PASSWORD=your-admin-password
TOKEN_SECRET=replace-with-a-long-random-secret
USER_TOKEN_SECRET=replace-with-a-different-long-random-secret
```

微信小程序登录还需要：

```env
WECHAT_APP_ID=your-wechat-mini-program-appid
WECHAT_APP_SECRET=your-wechat-mini-program-secret
```

### 3. 启动后端和管理台

```bash
npm run dev
```

访问：

```text
http://localhost:8787/admin/
```

### 4. 启动用户端 H5

另开一个终端：

```bash
npm run dev:client
```

默认地址：

```text
http://localhost:5173
```

### 5. 构建微信小程序

```bash
npm --prefix client run build:mp-weixin
```

构建后用微信开发者工具导入：

```text
client/dist/build/mp-weixin
```

小程序真机调试时，`client/.env.local` 中的 `VITE_API_BASE_URL` 需要配置成手机可访问的局域网 IP 或 HTTPS 域名。

## 推荐业务流程

1. 管理员登录后台，新增衣服主档。
2. 在衣服详情中创建生产批次，填写款号、颜色、尺码、批次标签和数量。
3. 系统批量生成 SN 和传统正方形二维码。
4. 导出 Excel 或 CSV，交给印刷、贴标或交付流程。
5. 用户扫码或输入 SN，查看公开吊牌详情。
6. 用户微信登录后绑定学生姓名、学校、班级和联系方式。
7. 校服丢失时，绑定用户报告丢失；拾获者扫码并登录后查看联系方式。
8. 管理员在后台查看统计、用户状态、绑定日志和导出数据。

## 二维码策略

系统支持两种二维码类型：

### 1. 传统正方形二维码（默认）

- 二维码接口：`GET /api/qrcode/{sn}?type=url`
- 二维码内容：`FRONTEND_BASE_URL/#/pages/garment/detail?sn={SN}`
- 适用于任何扫码工具
- 微信扫一扫会打开浏览器/H5 页面

### 2. 微信小程序码（可选）

- 二维码接口：`GET /api/qrcode/{sn}?type=mini-program`
- 调用微信 `getwxacodeunlimit` API 生成
- Scene 参数传递 SN 值
- 微信扫一扫直接打开小程序指定页面
- 需要配置：`WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`

扫码解析支持以下输入：

```text
https://example.com/#/pages/garment/detail?sn=CP20260615DEMO01  # 传统二维码链接
pages/garment/detail?scene=CP20260615DEMO01                       # 小程序码跳转
scene=sn%3DCP20260615DEMO01                                       # 编码 scene
CP20260615DEMO01                                                   # 直接 SN
```

## 项目结构

```text
cyber-pendant/
├── client/                         # 用户端 uni-app，面向 H5 / 微信小程序
│   ├── src/pages/index/             # SN 输入和扫码入口
│   ├── src/pages/garment/           # 公开吊牌详情、绑定和报失
│   ├── src/pages/login/             # 微信登录页
│   ├── src/pages/user/              # 用户中心
│   ├── src/utils/api.js             # 用户端 API 封装
│   └── src/utils/scanner.js         # H5 / 小程序扫码适配
├── server/                         # Node.js API 服务
│   ├── admin/                       # Vue 管理台源码
│   ├── src/api.js                   # HTTP 路由、API 和后台静态托管
│   ├── src/auth.js                  # 管理员 token、用户 token、微信 code2session
│   ├── src/config.js                # 环境变量和路径配置
│   ├── src/db.js                    # SQLite 表结构、迁移和查询
│   ├── src/index.js                 # 服务入口
│   ├── src/prepare-admin.js         # 管理台自动安装/构建
│   └── test/api.test.js             # 后端集成测试
├── memory/                         # 设计、交付、状态和安全文档
└── data/                           # 本地 SQLite 数据库，运行时生成
```

## 架构说明

### 用户端

`client/` 使用 uni-app + Vue 3：

- 首页：输入 SN 或调用扫码能力。
- 详情页：展示主档、批次、二维码、查询次数、绑定状态、报失状态和联系方式披露入口。
- 登录页：调用 `uni.login`，把微信 `code` 发给后端换取用户 token。
- 用户中心：展示我的校服、有效报失、丢失报告和绑定记录。

小程序页面使用自定义导航栏，顶部栏需要避开微信右上角系统胶囊区域。

### 管理台

`server/admin/` 是 Vue 3 + Vite + Vue Router 应用，使用 hash 路由：

```text
#/login
#/dashboard
#/clothes/:id
```

管理台构建后输出到：

```text
server/admin/dist
```

后端默认托管在：

```text
/admin/
```

### 后端

后端使用 Node.js 内置模块和 SQLite：

- `node:http` 提供 HTTP 服务。
- `node:sqlite` 存储数据。
- PBKDF2 保存管理员密码。
- HMAC token 区分管理员和用户身份。
- `qrcode` 生成传统正方形二维码。
- SQLite 开启 `foreign_keys` 和 `WAL`。

后端启动时会执行 `ensureAdminBuild()`。如需跳过自动构建：

```bash
ADMIN_AUTO_BUILD=0 npm run dev
# 或
SKIP_ADMIN_BUILD=1 npm run dev
```

## 数据模型

| 表 | 含义 | 主要字段 |
|----|------|----------|
| `admins` | 管理员 | 用户名、密码哈希、创建时间 |
| `users` | 微信用户 | openid、昵称、头像、状态、绑定数、报失数、最后登录时间 |
| `clothes` | 衣服主档 | 商品名、面料、执行标准、安全类别、等级、厂家、洗护说明、状态 |
| `garment_batches` | 生产批次 | 款号、颜色、尺码、批次标签、生产日期、备注、状态 |
| `garments` | SN 明细 | SN、主档 ID、批次 ID、查询次数、绑定信息、报失 ID、状态 |
| `binding_logs` | 绑定审计 | SN、用户、操作类型、前后快照、IP、User-Agent |
| `lost_reports` | 丢失报告 | SN、报告人、状态、曝光次数、过期时间、关闭原因 |
| `contact_reveal_logs` | 联系方式曝光日志 | SN、报失记录、用户、来源、IP、User-Agent |
| `garment_styles` | 旧数据兼容 | 旧版单表数据迁移来源 |

公开详情页会组合主档、批次、SN、绑定和报失数据。编辑主档或批次后，已生成 SN 的公开展示会同步更新。

## 命令速查

```bash
# 后端 + 管理台
npm run dev
npm start

# 用户端
npm run dev:client
npm run build:client
npm --prefix client run dev:mp-weixin
npm --prefix client run build:mp-weixin

# 管理台
npm run dev:admin
npm run build:admin
npm --prefix server/admin run preview

# 测试
npm test
node --test server/test/*.test.js
node --test client/test/fixed-header-layout.test.js
node --test server/admin/test/admin-ui.test.js
```

## 环境变量

### 服务端

`server/.env`：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8787` | 后端监听端口 |
| `DATABASE_PATH` | `data/cyber-pendant.sqlite` | SQLite 数据库路径 |
| `FRONTEND_BASE_URL` | `http://localhost:5173` | 用户端地址，用于生成详情链接二维码 |
| `ADMIN_BASE_PATH` | `/admin` | 后端托管管理台的访问路径 |
| `ADMIN_STATIC_DIR` | `server/admin/dist` | 管理台构建产物目录 |
| `CORS_ORIGIN` | `*` | CORS 允许来源 |
| `TOKEN_SECRET` | 随机临时值 | 管理员 token 签名密钥，生产必须固定配置 |
| `USER_TOKEN_SECRET` | 同 `TOKEN_SECRET` | 用户 token 签名密钥，生产建议单独配置 |
| `USER_TOKEN_TTL_DAYS` | `30` | 用户 token 有效天数 |
| `WECHAT_APP_ID` | 空 | 微信小程序 AppID（小程序码生成必需） |
| `WECHAT_APP_SECRET` | 空 | 微信小程序 AppSecret（小程序码生成必需） |
| `WECHAT_QR_PAGE` | `pages/garment/detail` | 小程序码跳转页面路径 |
| `WECHAT_QR_ENV_VERSION` | `release` | 小程序码环境版本（release/trial/develop） |
| `WECHAT_QR_CHECK_PATH` | `false` | 小程序码是否检查页面存在 |
| `WECHAT_QR_WIDTH` | `430` | 小程序码宽度 |
| `ADMIN_USERNAME` | `admin` | 默认管理员用户名 |
| `ADMIN_PASSWORD` | 空 | 默认管理员密码，必须设置 |

### 用户端

`client/.env.local`：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_API_BASE_URL` | `http://localhost:8787` | 用户端请求的 API 地址 |

### 管理台开发

`server/admin/.env.local`：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_API_BASE_URL` | 空 | 为空时使用同源 `/api` |
| `VITE_FRONTEND_BASE_URL` | `http://localhost:5173` | 导出表格中的公开详情页地址 |

## API 一览

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| `GET` | `/api/health` | 健康检查 | 否 |
| `POST` | `/api/auth/login` | 管理员登录 | 否 |
| `POST` | `/api/auth/wechat/login` | 微信用户登录 | 否 |
| `GET` | `/api/user/garments` | 我的校服 | 用户 |
| `GET` | `/api/user/lost-reports` | 我的丢失报告 | 用户 |
| `GET` | `/api/user/binding-logs` | 我的绑定记录 | 用户 |
| `GET` | `/api/admin/users` | 用户列表 | 管理员 |
| `GET` | `/api/admin/users/{id}` | 用户详情 | 管理员 |
| `POST` | `/api/admin/users/{id}/ban` | 封禁用户 | 管理员 |
| `POST` | `/api/admin/users/{id}/unban` | 解封用户 | 管理员 |
| `GET` | `/api/admin/stats` | 管理统计 | 管理员 |
| `GET` | `/api/admin/export/{type}` | 导出 CSV | 管理员 |
| `GET` | `/api/clothes` | 衣服主档列表 | 管理员 |
| `POST` | `/api/clothes` | 新增衣服主档 | 管理员 |
| `GET` | `/api/clothes/{id}` | 衣服主档详情 | 管理员 |
| `PUT` | `/api/clothes/{id}` | 更新衣服主档 | 管理员 |
| `DELETE` | `/api/clothes/{id}?hard=0\|1` | 停用或真删除衣服 | 管理员 |
| `GET` | `/api/clothes/{id}/batches` | 衣服下的批次和 SN | 管理员 |
| `POST` | `/api/clothes/{id}/batches` | 创建批次并批量生成 SN | 管理员 |
| `PUT` | `/api/batches/{id}` | 更新或启用批次 | 管理员 |
| `DELETE` | `/api/batches/{id}?hard=0\|1` | 停用或真删除批次 | 管理员 |
| `GET` | `/api/garments` | SN 列表和筛选 | 管理员 |
| `POST` | `/api/garments` | 兼容旧流程：创建单个吊牌 | 管理员 |
| `GET` | `/api/garments/{sn}` | 公开查询吊牌详情 | 否 |
| `PUT` | `/api/garments/{sn}` | 更新 SN 状态 | 管理员 |
| `DELETE` | `/api/garments/{sn}?hard=0\|1` | 停用或真删除 SN | 管理员 |
| `POST` | `/api/garments/{sn}/binding` | 绑定学生信息 | 用户 |
| `PUT` | `/api/garments/{sn}/binding` | 修改本人绑定信息 | 用户 |
| `DELETE` | `/api/garments/{sn}/binding` | 用户本人解绑或管理员解绑 | 用户 / 管理员 |
| `POST` | `/api/garments/{sn}/report-lost` | 报告丢失 | 用户本人 |
| `DELETE` | `/api/garments/{sn}/report-lost` | 取消报失 | 用户本人 / 管理员 |
| `POST` | `/api/garments/{sn}/contact-reveal` | 披露联系方式并记录曝光 | 用户 |
| `POST` | `/api/sn/generate` | 生成唯一 SN | 管理员 |
| `GET` | `/api/qrcode/{sn}?type=sn\|url\|mini-program` | 获取二维码图片 | 否 |

二维码类型说明：
- `type=sn`：原始 SN 码二维码
- `type=url`：详情页链接二维码（默认）
- `type=mini-program`：微信小程序码，微信扫码直接进入小程序

`/api/admin/export/{type}` 支持：

```text
users
garments
reports
binding-logs
```

## SN 规则

SN 格式：

```text
CP{YYYYMMDD}{6位随机字符}
```

随机字符会避开容易混淆的 `0`、`O`、`I`、`1`。

## 安全与隐私

- 用户绑定、解绑、报失和联系方式披露都由服务端验证 token 与数据库状态。
- 正常状态只返回脱敏绑定信息；完整联系方式只在报失后通过披露接口返回。
- 管理员可查看完整绑定信息，但用户端不依赖客户端隐藏敏感字段。
- 绑定操作、解绑操作、联系方式披露会记录审计信息。
- 生产环境必须固定配置 `TOKEN_SECRET`、`USER_TOKEN_SECRET` 和 `ADMIN_PASSWORD`。

更多原则见 [memory/security-principles.md](memory/security-principles.md)。

## 删除和停用

默认删除是停用：

- 衣服停用后，该衣服下所有 SN 扫码返回停用状态。
- 批次停用后，该批次下所有 SN 扫码返回停用状态。
- SN 停用后，公开查询返回 `423`，并带停用记录信息。

真删除使用 `?hard=1`：

- 真删除衣服会级联删除批次和 SN。
- 真删除批次会级联删除该批次下的 SN。
- 真删除 SN 后，已印刷二维码将查不到记录。

生产环境建议优先停用，谨慎真删除。

## 文档地图

| 文档 | 用途 |
|------|------|
| [memory/current-system-state.md](memory/current-system-state.md) | 当前真实功能、架构和限制索引 |
| [memory/operations-handbook.md](memory/operations-handbook.md) | 交付、运营、后台使用和故障处理手册 |
| [memory/security-principles.md](memory/security-principles.md) | 客户端零信任和隐私边界 |
| [memory/detailed-logic-design.md](memory/detailed-logic-design.md) | 用户系统和防丢功能的历史设计稿 |
| [memory/implementation-plan-updated.md](memory/implementation-plan-updated.md) | 历史实施计划与后续路线参考 |
| [CODE_REVIEW_REPORT.md](CODE_REVIEW_REPORT.md) | 深度代码审查报告 |

## 测试与验证

```bash
npm test
node --test client/test/fixed-header-layout.test.js
node --test server/admin/test/admin-ui.test.js
npm --prefix client run build:mp-weixin
npm --prefix server/admin run build
```

测试覆盖：

- 管理员登录、用户登录、token 和鉴权。
- 衣服、批次、SN 的增删改查。
- 用户绑定、修改绑定、解绑、用户中心和绑定日志。
- 报失、取消报失、联系方式披露和曝光统计。
- 用户管理、统计、CSV 导出。
- 二维码生成、历史小程序码请求回退。
- 后端托管管理台、SPA fallback 和路径安全。
- 小程序自定义顶部栏、右上角胶囊避让和用户中心按钮布局。

## 部署建议

1. 固定设置 `TOKEN_SECRET`、`USER_TOKEN_SECRET` 和 `ADMIN_PASSWORD`。
2. 设置 `FRONTEND_BASE_URL` 为用户端正式地址。
3. 设置 `CORS_ORIGIN` 为正式用户端域名，不建议生产长期使用 `*`。
4. 配置 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET`。
5. 启动后端：

```bash
npm start
```

6. 访问 `http://你的后端域名/admin/` 管理数据。
7. 将用户端 H5 或微信小程序单独发布。
8. 印刷前用真实环境扫码确认二维码能进入详情页并解析 SN。

## 已知限制

- 当前数据规模按小型校服项目设计，SQLite 足够承载三所学校级别的数据；更大规模上线前应补充备份、监控和限流。
- 用户手机号由绑定表单手动录入，不做微信手机号解密和短信验证。
- 报失默认有 30 天过期策略，运营侧仍需制定线下找回和客服流程。
- 小程序真机环境不能访问电脑的 `localhost`，需要局域网 IP 或 HTTPS 域名。

## 许可证

查看 [LICENSE](LICENSE)。
