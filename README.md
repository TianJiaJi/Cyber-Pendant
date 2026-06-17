# Cyber-Pendant

Cyber-Pendant 是一个数字服装吊牌系统。用户可以扫描二维码或输入 SN 码查看服装详情，管理员可以登录后台管理记录并生成 SN/二维码。

## 数据架构

后台数据按三层管理：
1. `clothes` 衣服主档：衣服名称、面料、执行标准、安全类别、等级、厂家、厂家地址、洗护说明、备注、状态。
2. `garment_batches` 生成批次：归属某件衣服，保存款号、颜色、尺码、生产批次、生产日期、批次备注、状态。
3. `garments` SN 明细：每个吊牌一个唯一 SN，关联衣服和批次，并保留自身状态。

扫码详情由衣服主档、批次和 SN 三层组合生成；编辑衣服或批次后，已生成 SN 的展示信息会同步更新。

## 项目结构

```
cyber-pendant/
├── client/          # Uni-app Vue 3 H5 前端（为未来迁移微信小程序准备）
│   ├── src/
│   │   ├── pages/           # 页面组件
│   │   │   ├── index/       # 首页（扫码/输入入口）
│   │   │   ├── garment/     # 吊牌详情页
│   │   │   └── admin/       # 管理后台（登录/衣服主档/衣服详情）
│   │   ├── utils/           # 工具函数
│   │   │   ├── api.js       # API 请求封装
│   │   │   └── scanner.js   # 扫码功能
│   │   ├── App.vue          # 根组件（全局样式）
│   │   ├── pages.json       # 页面路由配置
│   │   └── manifest.json    # 应用配置
│   ├── .env.example         # 环境变量示例
│   └── package.json
├── server/         # Node.js API 服务器（使用内置 node:sqlite）
│   ├── src/
│   │   ├── index.js         # 服务入口
│   │   ├── api.js           # HTTP 路由和请求处理
│   │   ├── db.js            # 数据库操作和迁移
│   │   ├── auth.js          # 认证（PBKDF2 + JWT）
│   │   ├── sn.js            # SN 码生成
│   │   └── config.js        # 配置管理
│   ├── test/                # Node.js 内置测试
│   ├── .env.example         # 环境变量示例
│   └── package.json
└── data/            # 本地 SQLite 数据库目录（运行时生成，Git 忽略）
```

## 快速开始

### 1. 安装依赖

```bash
npm --prefix server install
npm --prefix client install
```

### 2. 配置环境变量

```bash
cp server/.env.example server/.env
```

**首次运行前必须编辑 `server/.env` 并设置以下两项：**
- `ADMIN_PASSWORD` - 管理员密码（必填）
- `TOKEN_SECRET` - 令牌签名密钥（必填，建议使用长随机字符串）

可选配置：
- `PORT` - 后端端口（默认 8787）
- `ADMIN_USERNAME` - 管理员用户名（默认 admin）
- `FRONTEND_BASE_URL` - 前端地址，用于生成二维码链接（默认 http://localhost:5173）
- `CORS_ORIGIN` - CORS 允许的源（默认 *）

### 3. 启动后端

```bash
npm run dev:server
```

后端将运行在 `http://localhost:8787`

### 4. 启动前端（新开终端）

```bash
npm run dev:client
```

前端 H5 页面将运行在 `http://localhost:5173`

## 后台地址

本地开发后台登录地址：

```text
http://localhost:5173/#/pages/admin/login
```

登录成功后会进入衣服主档后台。前台用户查询页不显示后台入口，需要手动输入后台地址访问。

## 默认账号

- 用户名：`admin`
- 密码：你在 `server/.env` 中设置的 `ADMIN_PASSWORD`

## 演示数据

可以使用以下 SN 码测试吊牌查询功能：

```
CP20260615DEMO01
```

## 开发命令

```bash
# 启动开发服务器
npm run dev:server   # 后端（带 --watch 自动重启）
npm run dev:client   # 前端 H5

# 构建生产版本
npm run build:client # 构建 H5 静态文件

# 运行测试
npm test            # 运行后端测试
# 或单独运行：
node --test server/test/*.test.js
```

## 技术栈

### 后端
- **运行时**：Node.js >= 24.0.0
- **数据库**：内置 `node:sqlite`（WAL 模式）
- **HTTP**：内置 `node:http`
- **认证**：PBKDF2 密码哈希 + 自定义 JWT-like 令牌
- **二维码**：`qrcode` 库

### 前端
- **框架**：Uni-app Vue 3
- **目标平台**：H5（当前）/ 微信小程序（已准备）
- **扫码**：html5-qrcode（H5）/ uni.scanCode（小程序）
- **表格导出**：xlsx

## API 接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/login` | 管理员登录 | ❌ |
| GET | `/api/clothes` | 衣服主档列表（支持 `?q=` 搜索，返回批次数和 SN 数） | ✅ |
| POST | `/api/clothes` | 新增衣服主档 | ✅ |
| GET | `/api/clothes/{id}` | 衣服主档详情 | ✅ |
| PUT | `/api/clothes/{id}` | 更新衣服主档 | ✅ |
| DELETE | `/api/clothes/{id}?hard=0\|1` | 停用或真删除衣服；真删除级联批次和 SN | ✅ |
| GET | `/api/clothes/{id}/batches` | 某件衣服下的批次和 SN 明细 | ✅ |
| POST | `/api/clothes/{id}/batches` | 创建新批次并批量生成唯一 SN | ✅ |
| PUT | `/api/batches/{id}` | 更新批次信息或启用批次 | ✅ |
| DELETE | `/api/batches/{id}?hard=0\|1` | 停用或真删除批次；真删除级联 SN | ✅ |
| GET | `/api/garments` | SN 列表（支持 `?q=`、`?clothingId=`、`?batchId=`） | ✅ |
| POST | `/api/garments` | 兼容旧流程：创建单个吊牌 | ✅ |
| GET | `/api/garments/{sn}` | 查询吊牌详情 | ❌ |
| PUT | `/api/garments/{sn}` | 更新 SN 状态 | ✅ |
| DELETE | `/api/garments/{sn}?hard=0\|1` | 停用或真删除单个 SN | ✅ |
| POST | `/api/sn/generate` | 生成唯一 SN 码 | ✅ |
| GET | `/api/qrcode/{sn}` | 获取二维码图片（`?type=sn|url`） | ❌ |

## SN 码格式

```
CP{YYYYMMDD}{6位随机字符}
```

例如：`CP20260615DEMO01`

- 前缀：`CP`（Cyber-Pendant）
- 日期：8 位数字（年月日）
- 随机部分：6 位大写字母和数字（剔除易混淆字符 0OI1）

## 环境变量详细说明

### 服务端（server/.env）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 监听端口 | 8787 |
| `DATABASE_PATH` | SQLite 数据库路径 | ../data/cyber-pendant.sqlite |
| `FRONTEND_BASE_URL` | 前端地址（二维码链接） | http://localhost:5173 |
| `CORS_ORIGIN` | CORS 允许的源 | * |
| `TOKEN_SECRET` | JWT 签名密钥 | **必须设置** |
| `ADMIN_USERNAME` | 管理员用户名 | admin |
| `ADMIN_PASSWORD` | 管理员密码 | **必须设置** |

### 客户端（client/.env.local）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_BASE_URL` | API 服务地址 | http://localhost:8787 |

## 数据库

首次运行时，数据库会自动创建并：
1. 创建 `admins`、`clothes`、`garment_batches`、`garments` 表，并保留 `garment_styles` 兼容旧版本
2. 如果管理员不存在，根据 `.env` 配置创建默认管理员
3. 如果吊牌表为空，插入一条演示数据
4. 旧的 `garment_styles + garments` 数据会自动迁移为 `clothes + garment_batches + garments`

数据库文件位置默认为项目根目录下的 `data/cyber-pendant.sqlite`。

### 删除行为

- 停用是默认安全删除：衣服、批次或 SN 停用后，公开 SN 查询返回 `423`，并带停用记录信息。
- 真删除使用 `?hard=1`：衣服真删除会级联删除批次和 SN；批次真删除会级联删除 SN；SN 真删除后公开查询返回 `404`。
- 已印刷二维码只包含 SN 或详情页链接，因此真删除后对应二维码会查不到记录。

### 后台导出

衣服详情页的批次卡片可导出本批 SN，支持 `Excel 表格` 和 `CSV 清单`。导出字段包含衣服名称、款号、颜色、尺码、SN、生产批次、生产日期、详情页链接和二维码链接；Excel 中二维码以链接写入，不嵌入图片。

## 许可证

查看 [LICENSE](LICENSE) 文件。
